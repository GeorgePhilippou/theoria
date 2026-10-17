import test from 'node:test';
import assert from 'node:assert/strict';
import * as gasLib from '../dist/entropy/physics.js';

const close = (a, b, tol, message) => assert.ok(Math.abs(a - b) < tol, `${message ?? ''} ${a} vs ${b}`);
const snapshot = g => [Float64Array.from(g.x), Float64Array.from(g.y)];

test('running the gas backwards retraces it exactly, bit for bit', () => {
  const g = gasLib.experiment('spread', {n: 300, seed: 3});
  const [x0, y0] = snapshot(g);
  g.step(3000);
  assert.ok(gasLib.leftFraction(g) < .75, 'the gas has spread');
  g.reverse();
  g.step(3000);
  assert.equal(g.index, 0);
  assert.deepEqual(Array.from(g.x), Array.from(x0));
  assert.deepEqual(Array.from(g.y), Array.from(y0));
  assert.equal(gasLib.leftFraction(g), 1);
});

test('a nudge of a millionth of an atom spoils the reversal', () => {
  // Reversed once the box is full (t = 20): earlier, the gas's bulk flow carries it most of the way back regardless.
  const g = gasLib.experiment('spread', {n: 400, seed: 3});
  const [x0] = snapshot(g);
  g.step(5000);
  g.reverse(3);
  g.step(5000);
  let moved = 0;
  for (let i = 0; i < g.n; i++) moved += Math.abs(g.x[i] - x0[i]) * gasLib.UNIT;
  assert.ok(moved / g.n > 1, `mean displacement ${moved / g.n}`);
  assert.ok(gasLib.leftFraction(g) < .8, `left fraction ${gasLib.leftFraction(g)}`);
});

test('energy is conserved', () => {
  const g = gasLib.experiment('heat', {n: 300, seed: 5});
  const e0 = g.energy();
  let worst = 0;
  for (let k = 0; k < 10; k++) { g.step(400); worst = Math.max(worst, Math.abs(g.energy() / e0 - 1)); }
  assert.ok(worst < .01, `energy drift ${worst}`);
});

test('equal speeds relax to the Maxwell–Boltzmann distribution', () => {
  const g = gasLib.experiment('speeds', {n: 400, seed: 7});
  const ratio = () => {
    let v2 = 0, v4 = 0;
    for (let i = 0; i < g.n; i++) { const [u, v] = g.velocity(i), s = u * u + v * v; v2 += s; v4 += s * s; }
    return v4 * g.n / (v2 * v2);
  };
  close(ratio(), 1, .01, 'all speeds equal at the start');
  g.step(4000);
  // Averaged over snapshots: <v⁴>/<v²>² = 2 and <v> = √(π kT / 2) for a 2D gas in equilibrium.
  let r = 0, mean = 0, kT = 0;
  for (let k = 0; k < 20; k++) {
    g.step(100);
    g.refresh();
    r += ratio() / 20;
    let m = 0;
    for (let i = 0; i < g.n; i++) m += Math.hypot(...g.velocity(i)) / g.n;
    mean += m / 20;
    kT += gasLib.temperature(g) / 20;
  }
  close(r, 2, .12, 'fourth moment ratio');
  close(mean / Math.sqrt(Math.PI * kT / 2), 1, .03, 'mean speed');
  const S = gasLib.entropy(g);
  close(S.total, S.max, .06, 'entropy at its maximum');
});

test('free expansion raises the entropy by ln 2 per atom', () => {
  const g = gasLib.experiment('spread', {n: 400, seed: 11});
  const s0 = gasLib.entropy(g).total;
  g.step(8000);
  let gain = 0;
  for (let k = 0; k < 10; k++) { g.step(200); gain += (gasLib.entropy(g).total - s0) / 10; }
  close(gain, Math.LN2, .06, 'entropy gain');
  close(gasLib.leftFraction(g), .5, .08, 'atoms in the left half');
  close(gasLib.oddsExponent(Math.LN2, 400), 400 * Math.log10(2), 1e-9, 'odds of returning: 2^−N');
});

test('heat flows from hot to cold, with the textbook entropy gain', () => {
  const g = gasLib.experiment('heat', {n: 400, seed: 13});
  const half = g.width / 2;
  const hot = gasLib.temperature(g, 0, half), cold = gasLib.temperature(g, half, g.width), s0 = gasLib.entropy(g).total;
  assert.ok(hot > 1.6 && cold < .35, `starting temperatures ${hot}, ${cold}`);
  // The gas sloshes (a sound wave) as it settles, so average over a long window.
  g.step(10000);
  let left = 0, right = 0, gain = 0, tf = 0;
  const samples = 40;
  for (let k = 0; k < samples; k++) {
    g.step(250);
    left += gasLib.temperature(g, 0, half) / samples;
    right += gasLib.temperature(g, half, g.width) / samples;
    tf += gasLib.temperature(g) / samples;
    gain += (gasLib.entropy(g).total - s0) / samples;
  }
  close(left / right, 1, .15, 'temperatures equal');
  // A 2D ideal gas with equal halves: ΔS/N = ln(T_f / √(T_hot T_cold)).
  close(gain, Math.log(tf / Math.sqrt(hot * cold)), .08, 'entropy gain');
});
