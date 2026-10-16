import test from 'node:test';
import assert from 'node:assert/strict';
import * as gr from '../dist/general-relativity/physics.js';

const close = (a, b, tol, message) => assert.ok(Math.abs(a - b) < tol, `${message ?? ''} ${a} vs ${b}`);

test('static clocks and Flamm embedding match analytic limits', () => {
  assert.equal(gr.rate(Infinity), 1);
  assert.equal(gr.rate(1), 0);
  close(gr.rate(4), Math.sqrt(.75), 1e-14);
  assert.equal(gr.embedding(2), 2);
});

test('null constraint conserved; subcritical capture and supercritical escape', () => {
  for (const b of [0, 2.2, 2.58, 2.7, 3.4, 7]) {
    const ray = gr.tracePhoton(b);
    assert.equal(ray.outcome, b < gr.criticalImpact ? 'captured' : 'escapes');
    assert.ok(ray.error < 1e-6, `${b}: ${ray.error}`);
    assert.ok(ray.points.every((p, i, a) => Number.isFinite(p.t) && (!i || p.t > a[i - 1].t)));
  }
});

test('mirrored rays preserve symmetry and integration converges', () => {
  const a = gr.tracePhoton(3.4), b = gr.tracePhoton(-3.4), c = gr.tracePhoton(3.4, {stepSize: .0175});
  const t = 20, aa = gr.sampleAt(a.points, t), bb = gr.sampleAt(b.points, t), cc = gr.sampleAt(c.points, t);
  close(aa.x, bb.x, 1e-10);
  close(aa.z, -bb.z, 1e-10);
  assert.ok(Math.hypot(aa.x - cc.x, aa.z - cc.z) < .0002);
  assert.equal(gr.sampleAt(a.points, -1), null);
});

test('light deflection matches the post-Newtonian series', () => {
  // α = 4M/b + 15πM²/(4b²) + 128M³/(3b³) + …, with M = 1/2; the leading term is Einstein's 2 r_s/b.
  // Launching at r = 2000 instead of infinity removes about 2 · 2M/2000 = 0.001 rad.
  const b = 7, ray = gr.tracePhoton(b, {radius: 2000, stepSize: .05, maxSteps: 400000});
  const deflection = gr.sweptAngle(ray.points) - Math.PI;
  close(deflection, 2 / b + 15 * Math.PI / (16 * b * b) + 16 / (3 * b ** 3), .0015, 'deflection');
});

test('near-critical light winds around the photon sphere before escaping', () => {
  const ray = gr.tracePhoton(gr.criticalImpact * (1 + 3e-5), {stepSize: .015});
  assert.equal(ray.outcome, 'escapes');
  assert.ok(gr.sweptAngle(ray.points) > 3 * Math.PI, 'should sweep more than a full extra turn');
  const closest = Math.min(...ray.points.map(p => p.r));
  close(closest, gr.PHOTON_SPHERE, .02, 'closest approach');
});

test('tortoise coordinate inverts and radial light moves at dr/dt = 1 − 1/r', () => {
  for (const r of [1.0001, 1.3, 2.4, 8, 50]) close(gr.radiusFromTortoise(gr.tortoise(r)), r, 1e-9 * r, 'round trip');
  const r = 3, h = 1e-6;
  close((gr.signalRadius(r, 9, h) - r) / h, 1 - 1 / r, 1e-5, 'outward speed');
  close((r - gr.signalRadius(r, 1.5, h)) / h, 1 - 1 / r, 1e-5, 'inward speed');
});

test('signals between static clocks show gravitational redshift', () => {
  const rA = 2.4, rB = 8, {delay, flashes, receivedInterval} = gr.signalSchedule(rA, rB, {interval: 2, tMax: 60});
  close(gr.signalRadius(rA, rB, delay), rB, 1e-9, 'arrives at B');
  close(receivedInterval, 2 * gr.rate(rB) / gr.rate(rA), 1e-14);
  for (let i = 1; i < flashes.length; i++) close(flashes[i].tauArrive - flashes[i - 1].tauArrive, receivedInterval, 1e-9);
  assert.ok(receivedInterval > 2, 'climbing light arrives stretched (redshifted)');
  assert.ok(gr.signalSchedule(rB, rA).receivedInterval < 2, 'falling light arrives compressed (blueshifted)');
  close(gr.wavelengthFactor(rA, rB), receivedInterval / 2, 1e-14);
});

test('free fall from rest obeys the radial geodesic equations', () => {
  const R = 6, fall = gr.freeFall(R), E = gr.rate(R), h = 1e-6;
  assert.equal(fall.r(0), R);
  assert.equal(fall.tau(0), 0);
  close(fall.t(0), 0, 1e-15);
  for (const eta of [.2, .9, 1.7, 2.2]) {
    const r = fall.r(eta);
    const drdtau = (fall.r(eta + h) - fall.r(eta - h)) / (fall.tau(eta + h) - fall.tau(eta - h));
    const dtdtau = (fall.t(eta + h) - fall.t(eta - h)) / (fall.tau(eta + h) - fall.tau(eta - h));
    close(drdtau, -Math.sqrt(1 / r - 1 / R), 1e-6, `dr/dτ at η=${eta}`);
    close(dtdtau, E / (1 - 1 / r), 1e-5 * dtdtau, `dt/dτ at η=${eta}`);
  }
  close(fall.r(fall.etaHorizon), 1, 1e-12, 'horizon radius');
  close(fall.tauCentre, Math.PI * R ** 1.5 / 2, 1e-12, 'proper time to the centre');
  assert.ok(Number.isFinite(fall.tauHorizon) && fall.tauHorizon < fall.tauCentre);
});

test('a falling clock reaches the horizon in finite proper time but never in coordinate time', () => {
  const fall = gr.freeFall(6);
  for (const t of [1, 10, 30]) close(fall.t(fall.etaAtT(t)), t, 1e-8, 'etaAtT round trip');
  for (const tau of [1, 10, 20]) close(fall.tau(fall.etaAtTau(tau)), tau, 1e-9, 'etaAtTau round trip');
  const r30 = fall.r(fall.etaAtT(30)), r60 = fall.r(fall.etaAtT(60));
  assert.ok(r30 > 1 && r60 > 1 && r60 < r30, 'creeps closer but stays outside');
  assert.ok(fall.tau(fall.etaAtT(60)) < fall.tauHorizon, 'its clock never quite reaches τ_h in finite t');
  close(fall.tau(fall.etaAtT(60)), fall.tauHorizon, 1e-3, 'but approaches it');
});
