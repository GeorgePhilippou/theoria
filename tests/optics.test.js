import test from 'node:test';
import assert from 'node:assert/strict';
import * as op from '../dist/optics/physics.js';

const close = (a, b, tol, message) => assert.ok(Math.abs(a - b) < tol, `${message ?? ''} ${a} vs ${b}`);
const deg = x => x * Math.PI / 180;
const angleOf = d => Math.atan2(d[1], d[0]) * 180 / Math.PI;

test('Snell’s law: n₁ sin θ₁ = n₂ sin θ₂, and the Fresnel reflectance at normal incidence', () => {
  for (const theta of [10, 30, 50, 70]) {
    const d = [Math.cos(deg(theta)), -Math.sin(deg(theta))];   // hitting a surface whose normal is the y axis
    const out = op.interact(d, [0, 1], 1, 1.5);
    const sinT = Math.abs(out.transmitted[0]);
    close(Math.sin(deg(90 - theta)), 1.5 * sinT, 1e-12, `angle ${theta}`);
  }
  close(op.interact([0, -1], [0, 1], 1, 1.5).R, .04, 1e-12, 'normal incidence, air to glass');
});

test('total internal reflection beyond the critical angle, and none below it', () => {
  const n = 1.5, crit = op.criticalAngle(n);
  close(crit, 41.81, .01, 'critical angle');
  for (const [theta, tir] of [[crit - 1, false], [crit + 1, true]]) {
    const d = [Math.sin(deg(theta)), Math.cos(deg(theta))];     // inside glass, heading for the boundary y = const
    const out = op.interact(d, [0, -1], n, 1);
    assert.equal(out.transmitted === null, tir, `at ${theta.toFixed(1)}°`);
  }
});

test('a slab delays light by (n − 1) d and leaves its direction unchanged', () => {
  const block = op.slab(0, 4, -10, 10, {nd: 1.5});
  const segs = op.trace([-5, 0], [1, .3], [block], {nm: 587.6, reflections: false});
  const first = segs[0], last = segs.at(-1);
  close(angleOf(sub(last.b, last.a)), angleOf(sub(first.b, first.a)), 1e-9, 'direction');
  // Straight through at normal incidence: optical path n·d, i.e. a delay of (n − 1)·d.
  const straight = op.trace([-5, 0], [1, 0], [block], {reflections: false, maxLength: 20});
  close(straight.at(-1).t1 - 20, (1.5 - 1) * 4, 1e-9, 'delay');
});
const sub = (b, a) => [b[0] - a[0], b[1] - a[1]];

test('parallel rays through a biconvex lens meet at the lensmaker’s focus', () => {
  const n = 1.5, R = 20, t = 2, L = op.lens(0, t, 4, R, -R, {nd: n});
  const {back} = op.lensFocus(n, R, -R, t);
  // Paraxial rays (small heights) cross the axis at the back focal distance from the back vertex.
  for (const y of [.2, .4]) {
    const x = op.axisCrossing(op.trace([-10, y], [1, 0], [L], {reflections: false}), 1);
    close(x - t / 2, back, back * .005, `height ${y}`);
  }
  // Marginal rays focus shorter: spherical aberration.
  const edge = op.axisCrossing(op.trace([-10, 3.6], [1, 0], [L], {reflections: false}), 1);
  assert.ok(edge - t / 2 < back * .99, 'marginal rays focus nearer');
});

test('a prism bends violet more than red, and minimum deviation obeys n = sin((A + D)/2) / sin(A/2)', () => {
  const A = 60, P = op.prism(0, -5, 10, A, {nd: 1.5});
  const deviation = (nm, incidence) => {
    // Aim at the middle of the left face; `incidence` is the ray's angle above the horizontal.
    const d = [Math.cos(deg(incidence)), Math.sin(deg(incidence))], target = [-2.5, -5 + 10 * Math.cos(deg(A / 2)) / 2];
    const segs = op.trace([target[0] - 10 * d[0], target[1] - 10 * d[1]], d, [P], {nm, reflections: false});
    const last = segs.at(-1);
    return incidence - angleOf(sub(last.b, last.a));
  };
  assert.ok(deviation(420, 10) > deviation(680, 10), 'violet deviates more');
  // Scan the incidence for the minimum deviation at the d line, then check the textbook formula.
  let best = Infinity;
  for (let i = -20; i <= 30; i += .05) best = Math.min(best, deviation(587.6, i));
  close(Math.sin(deg((A + best) / 2)) / Math.sin(deg(A / 2)), 1.5, 2e-4, 'index from minimum deviation');
});

test('crown glass dispersion: index falls from violet to red', () => {
  const nBlue = op.glassIndex(1.5168, 486.1), nRed = op.glassIndex(1.5168, 656.3);
  assert.ok(nBlue > 1.5168 && nRed < 1.5168);
  // Abbe number V = (n_d − 1) / (n_F − n_C) close to BK7's 64.
  close((1.5168 - 1) / (nBlue - nRed), 64, 4, 'Abbe number');
});

test('light entering a fibre end at a shallow angle is trapped by total internal reflection', () => {
  const fibre = op.slab(0, 60, -.5, .5, {nd: 1.5});
  const segs = op.trace([-1, -.3], [1, Math.tan(deg(20))], [fibre], {reflections: false, maxLength: 120, maxEvents: 200});
  const exit = segs.at(-1);
  assert.ok(exit.a[0] > 59.5, `the light leaves through the far end (x = ${exit.a[0]})`);
});

test('a placed, rotated part bends light exactly as the original, rotated', () => {
  const a = deg(30), rot = ([x, y]) => [Math.cos(a) * x - Math.sin(a) * y, Math.sin(a) * x + Math.cos(a) * y];
  const block = op.slab(-3, 3, -5, 5, {nd: 1.5}), turned = op.place(block, 0, 0, a);
  const d0 = [Math.cos(deg(20)), Math.sin(deg(20))], s0 = [-12, -2];
  const ref = op.trace(s0, d0, [block]), got = op.trace(rot(s0), rot(d0), [turned]);
  const end = g => g.filter(x => x.depth === 0).at(-1).b;
  const e1 = rot(end(ref)), e2 = end(got);
  close(e1[0], e2[0], 1e-9); close(e1[1], e2[1], 1e-9);
  // A lens's curved faces survive the move: still focuses at the lensmaker's focal length from its new place.
  const L = op.place(op.lens(0, 3.4, 5, 10, -10, {nd: 1.5}), 5, 2, 0), f = op.lensFocus(1.5, 10, -10, 3.4);
  const seg = op.trace([-20, 2 + .3], [1, 0], [L]);
  close(op.axisCrossing(seg.map(g => ({...g, a: [g.a[0], g.a[1] - 2], b: [g.b[0], g.b[1] - 2]})), 5), 5 + 1.7 + f.back, .05);
});

test('mirrors reflect at equal angles, a concave mirror focuses at R/2, and a screen stops light', () => {
  const m = op.place(op.flatMirror(10), 0, 0, deg(-45));   // tilted mirror at the origin
  const seg = op.trace([-10, 0], [1, 0], [m]);
  const out = seg.filter(g => g.depth === 0)[1], dir = [out.b[0] - out.a[0], out.b[1] - out.a[1]];
  close(Math.abs(angleOf(dir)), 90, 1e-9, 'turned through a right angle');
  close(seg.events[0].thetaI, 45, 1e-9);
  const cm = op.curvedMirror(20, 3), back = op.trace([-30, .4], [1, 0], [cm]), r = back.filter(g => g.depth === 0)[1];
  const t = -r.a[1] / (r.b[1] - r.a[1]), x = r.a[0] + t * (r.b[0] - r.a[0]);
  close(x, -10, .05, 'paraxial focus at R/2');
  const stop = op.trace([-10, 0], [1, 0], [op.screen(4)]);
  assert.equal(stop.length, 1); assert.equal(stop.events[0].kind, 'stop');
});

test('the ray log records angles that obey Snell’s law', () => {
  const seg = op.trace([-10, -3], [Math.cos(deg(25)), Math.sin(deg(25))], [op.slab(-2, 2, -10, 10, {nd: 1.5})]);
  const [enter, leave] = seg.events;
  assert.equal(enter.kind, 'enter'); assert.equal(leave.kind, 'leave');
  close(Math.sin(deg(enter.thetaI)), 1.5 * Math.sin(deg(enter.thetaT)), 1e-9);
  close(leave.thetaT, enter.thetaI, 1e-9, 'parallel on the way out');
});
