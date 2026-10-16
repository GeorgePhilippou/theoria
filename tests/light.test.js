import test from 'node:test';
import assert from 'node:assert/strict';
import * as em from '../dist/light/physics.js';

const close = (a, b, tol, message) => assert.ok(Math.abs(a - b) < tol, `${message ?? ''} ${a} vs ${b}`);

/** Time at which |Ez| peaks at cell (i, j) while stepping `steps` times. */
function peakTime(f, i, j, steps) {
  let best = 0, when = 0;
  for (let s = 0; s < steps; s++) {
    f.step();
    const v = Math.abs(f.ez[j * f.nx + i]);
    if (v > best) { best = v; when = f.t; }
  }
  return when;
}

test('a plane pulse travels at c in vacuum and c/n in glass', () => {
  for (const n of [1, 1.5]) {
    const f = em.createField({nx: 360, ny: 8, border: 20, periodicY: true});
    f.setMaterial(() => ({eps: n * n}));
    f.sources.push(em.pulse({i: 40, t0: 30, width: 8}));
    const j = 4;
    const g = em.createField({nx: 360, ny: 8, border: 20, periodicY: true});
    g.setMaterial(() => ({eps: n * n}));
    g.sources.push(em.pulse({i: 40, t0: 30, width: 8}));
    const t1 = peakTime(f, 100, j, 900), t2 = peakTime(g, 260, j, 900);
    close(160 / (t2 - t1), 1 / n, .01 / n + .005, `speed for n=${n}`);
  }
});

test('the wavelength shrinks by n inside glass', () => {
  const lambda = 24, f = em.createField({nx: 400, ny: 8, border: 24, periodicY: true});
  f.setMaterial(i => ({eps: i >= 200 ? 2.25 : 1}));
  f.sources.push(em.lineSource(40, {omega: em.omegaFor(lambda)}));
  for (let s = 0; s < 1600; s++) f.step();
  const crossings = (from, to) => {
    const xs = [], row = 4 * f.nx;
    for (let i = from; i < to; i++) {
      const a = f.ez[row + i], b = f.ez[row + i + 1];
      if (a <= 0 && b > 0) xs.push(i + a / (a - b));
    }
    return (xs.at(-1) - xs[0]) / (xs.length - 1);
  };
  close(crossings(220, 360), lambda / 1.5, .4, 'glass');
});

test('in a plane wave E = cB, perpendicular, and E/cB = 1/n in glass', () => {
  for (const n of [1, 1.5]) {
    const lambda = 24, f = em.createField({nx: 300, ny: 8, border: 24, periodicY: true});
    f.setMaterial(() => ({eps: n * n}));
    f.sources.push(em.lineSource(40, {omega: em.omegaFor(lambda)}));
    for (let s = 0; s < 1400; s++) f.step();
    let eMax = 0, hyMax = 0, hxMax = 0;
    const k = 4 * f.nx + 160;
    for (let s = 0; s < 120; s++) {
      f.step();
      eMax = Math.max(eMax, Math.abs(f.ez[k]));
      hyMax = Math.max(hyMax, Math.abs(f.hy[k]));
      hxMax = Math.max(hxMax, Math.abs(f.hx[k]));
    }
    close(eMax / hyMax, 1 / n, .03, `E/cB for n=${n}`);
    assert.ok(hxMax < .02 * hyMax, 'B is perpendicular to the direction of travel');
  }
});

test('energy is conserved inside a closed metal box', () => {
  const f = em.createField({nx: 120, ny: 120, border: 0});
  f.setMaterial((i, j) => ({metal: i === 0 || j === 0 || i === 119 || j === 119}));
  f.sources.push(em.pulse({i: 60, j: 60, t0: 15, width: 4}));
  for (let s = 0; s < 80; s++) f.step();
  // E and H live half a step apart, so the sampled energy wobbles; its average must not drift.
  const mean = steps => { let u = 0; for (let s = 0; s < steps; s++) { f.step(); u += f.energy(); } return u / steps; };
  const early = mean(400);
  for (let s = 0; s < 3000; s++) f.step();
  const late = mean(400);
  assert.ok(Math.abs(late - early) / early < .01, `energy drift ${(late - early) / early}`);
});

test('the absorbing border swallows outgoing waves', () => {
  const f = em.createField({nx: 160, ny: 160, border: 24});
  f.sources.push(em.pulse({i: 80, j: 80, t0: 15, width: 4}));
  for (let s = 0; s < 70; s++) f.step();
  const u0 = f.energy();
  for (let s = 0; s < 900; s++) f.step();
  assert.ok(f.energy() < .01 * u0, `left ${f.energy() / u0} of the energy`);
});

test('two sources in step interfere: dark where paths differ by half a wavelength', () => {
  const lambda = 20, d = 40, f = em.createField({nx: 240, ny: 240, border: 24});
  const cx = 120, cy = 80;
  f.sources.push(em.pointSource(cx - d / 2, cy, {omega: em.omegaFor(lambda)}));
  f.sources.push(em.pointSource(cx + d / 2, cy, {omega: em.omegaFor(lambda)}));
  for (let s = 0; s < 900; s++) f.step();
  // Time-averaged intensity over a few periods.
  const avg = new Float32Array(f.ez.length);
  for (let s = 0; s < 160; s++) { f.step(); for (let k = 0; k < avg.length; k++) avg[k] += f.ez[k] * f.ez[k]; }
  const I = (x, y) => avg[Math.round(y) * f.nx + Math.round(x)];
  // A point 80 cells out on the centre line, and on the first dark hyperbola |r1 − r2| = λ/2.
  const R = 80, y = cy + R;
  let xDark = cx;
  for (let x = cx; x < cx + 80; x += .05) {
    if (Math.hypot(x - (cx - d / 2), y - cy) - Math.hypot(x - (cx + d / 2), y - cy) >= lambda / 2) { xDark = x; break; }
  }
  assert.ok(I(xDark, y) < .15 * I(cx, y), `dark/bright = ${I(xDark, y) / I(cx, y)}`);
});
