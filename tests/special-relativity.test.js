import test from 'node:test';
import assert from 'node:assert/strict';
import * as sr from '../dist/special-relativity/physics.js';

const close = (a, b, tol, message) => assert.ok(Math.abs(a - b) < tol, `${message ?? ''} ${a} vs ${b}`);

test('Lorentz factor and rapidity', () => {
  assert.equal(sr.gamma(0), 1);
  close(sr.gamma(.6), 1.25, 1e-14);
  close(sr.gamma(.8), 5 / 3, 1e-14);
  close(Math.tanh(sr.rapidity(.6) + sr.rapidity(.6)), (1.2) / (1 + .36), 1e-14, 'rapidities add like velocity addition');
  close(sr.relativeVelocity(.6, .6), 0, 1e-15);
  close(sr.relativeVelocity(-.6, .6), -1.2 / 1.36, 1e-14);
  assert.ok(Math.abs(sr.relativeVelocity(.99, -.99)) < 1, 'never faster than light');
});

test('boosts preserve the interval and compose by adding rapidities', () => {
  const events = [[3, 1, .5], [2, 5, 0], [7, -6, 2], [4, 4, 0]];
  for (const e of events) {
    for (const phi of [-1.3, .2, .693]) close(sr.interval(sr.boost(e, phi)), sr.interval(e), 1e-11);
    const twice = sr.boost(sr.boost(e, .4), .3), once = sr.boost(e, .7);
    twice.forEach((v, i) => close(v, once[i], 1e-12));
  }
  const [t, x] = sr.boost([10, 6], sr.rapidity(.6));
  close(x, 0, 1e-12, 'the ship is at rest in its own frame');
  close(t, 8, 1e-12, 'and its clock shows t/γ');
});

test('a light clock ticks slowly by γ, and its photon always moves at c', () => {
  const v = .6, trip = sr.journey({v}), photon = sr.lightClock(trip, {L: .5, tauMax: 10});
  for (let i = 1; i < photon.length; i++) {
    const [t0, x0, y0] = photon[i - 1], [t1, x1, y1] = photon[i];
    close(Math.hypot(x1 - x0, y1 - y0) / (t1 - t0), 1, 1e-12, 'Earth-frame photon speed');
    const a = sr.boost(photon[i - 1], sr.rapidity(v)), b = sr.boost(photon[i], sr.rapidity(v));
    close(Math.hypot(b[1] - a[1], b[2] - a[2]) / (b[0] - a[0]), 1, 1e-12, 'ship-frame photon speed');
    close(b[1] - a[1], 0, 1e-12, 'in the ship frame the photon only moves across');
  }
  const tick = photon.find(p => p[3] === 1);
  close(tick[0], sr.gamma(v), 1e-12, 'one tick takes γ seconds of Earth time');
});

test('the light flash: simultaneous for the ship, back first on Earth by γ v L0', () => {
  const v = .6, L0 = 4, trip = sr.journey({v}), {emit, back, front} = sr.shipFlash(trip, {L0, tauEmit: 4});
  const sub = (a, b) => a.map((value, i) => value - b[i]);
  close(sr.interval(sub(back, emit)), 0, 1e-12, 'back reception is on the light cone');
  close(sr.interval(sub(front, emit)), 0, 1e-12, 'front reception is on the light cone');
  const phi = sr.rapidity(v);
  close(sr.boost(back, phi)[0], sr.boost(front, phi)[0], 1e-12, 'simultaneous in the ship frame');
  close(front[0] - back[0], sr.gamma(v) * v * L0, 1e-12, 'Earth sees the back lit first');
});

test('length contraction follows from measuring both ends at once', () => {
  const v = .6, L0 = 4, trip = sr.journey({v});
  const backLine = [0, 30].map(tau => sr.shipEvent(trip, tau, [0, -L0 / 2]));
  const frontLine = [0, 30].map(tau => sr.shipEvent(trip, tau, [0, L0 / 2]));
  for (const tNow of [5, 12]) {
    const back = sr.sliceAt(backLine, 0, tNow), front = sr.sliceAt(frontLine, 0, tNow);
    close(front[1] - back[1], sr.contractedLength(L0, v), 1e-12, 'Earth-frame length');
    const backS = sr.sliceAt(backLine, sr.rapidity(v), tNow), frontS = sr.sliceAt(frontLine, sr.rapidity(v), tNow);
    close(frontS[1] - backS[1], L0, 1e-12, 'ship-frame length');
  }
  close(sr.contractedLength(4, .6), 3.2, 1e-12);
});

test('time dilation is reciprocal', () => {
  const v = .6, phi = sr.rapidity(v), earth = [[0, 0], [100, 0]], trip = sr.journey({v});
  const ship = [0, 100].map(tau => trip.centreAt(tau));
  const t = 20;
  close(sr.sliceAt(ship, 0, t)[0] / sr.gamma(v), t / sr.gamma(v), 1e-12);
  const shipAtT = sr.boost(sr.sliceAt(ship, 0, t).slice(0, 3), phi)[0];
  close(shipAtT, t / sr.gamma(v), 1e-12, 'Earth frame: ship clock is slow');
  const earthEvent = sr.sliceAt(earth, phi, t);
  const earthProper = Math.sqrt(sr.interval(sr.boost(earthEvent.slice(0, 3), -phi)));
  close(earthProper, t / sr.gamma(v), 1e-12, 'ship frame: Earth clock is slow');
});

test('the twins: the traveller comes home younger, and its "now" jumps at the turn', () => {
  const v = .6, turnAt = 10, trip = sr.journey({v, roundTrip: true, turnAt}), g = sr.gamma(v);
  const home = trip.centreAt(2 * turnAt / g);
  close(home[0], 2 * turnAt, 1e-12, 'back at Earth time 20');
  close(home[1], 0, 1e-12, 'back at Earth');
  close(trip.tauAtT(2 * turnAt), 16, 1e-12, 'traveller aged 16');
  close(trip.tauAtT(25), 21, 1e-12, 'then ages with Earth');
  const turn = trip.centreAt(turnAt / g);
  const before = sr.earthTimeSimultaneousWith(turn, v), after = sr.earthTimeSimultaneousWith(turn, -v);
  close(before, turnAt / (g * g), 1e-12);
  close(after - before, 2 * v * v * turnAt, 1e-12, 'Earth time on the ship’s line of "now" jumps');
});

test('sliceAt finds the crossing with a tilted now', () => {
  const line = [[0, 0], [10, 5]];
  assert.equal(sr.sliceAt(line, 0, -1), null);
  const p = sr.sliceAt(line, 0, 4);
  close(p[1], 2, 1e-12);
  const q = sr.sliceAt(line, .3, 4);
  close(sr.boost([q[0], q[1]], -.3)[1] / sr.boost([q[0], q[1]], -.3)[0], .5, 1e-12, 'still on the line');
});

test('velocity addition never exceeds c, and light moves at c in every frame', () => {
  close(sr.addVelocities(.6, .6), 1.2 / 1.36, 1e-14);
  close(sr.addVelocities(1, .9), 1, 1e-14, 'light from a moving source');
  close(sr.addVelocities(.99, .99), 1.98 / 1.9801, 1e-14);
  const a = sr.toFrame([0, 0], .7), b = sr.toFrame([5, 5], .7);
  close((b[1] - a[1]) / (b[0] - a[0]), 1, 1e-12, 'a light ray still has slope 1');
  const back = sr.fromFrame(sr.toFrame([3, -2], -.4), -.4);
  close(back[0], 3, 1e-12); close(back[1], -2, 1e-12);
});

test('a point meets a frame’s now on that now, and moving trains’ leading clocks lag by v L0', () => {
  const [t, x] = sr.lineMeetsNow(2, 1, .5, -.6, 7);
  close(sr.toFrame([t, x], -.6)[0], 7, 1e-12, 'on the now line');
  close(x - 1, .5 * (t - 2), 1e-12, 'on the worldline');
  // Train of rest length 8 at v = 0.6, centre clock reads 0 at S origin. At one S time its ends:
  const u = .6, L0 = 8, legs = sr.chainLegs([{t0: 0, x0: 0, u, tau0: 0}]);
  const back = sr.bodyAtNow(legs, 0, 5, -L0 / 2), front = sr.bodyAtNow(legs, 0, 5, L0 / 2);
  close(front.x - back.x, L0 / sr.gamma(u), 1e-12, 'contracted in S');
  close(back.tau - front.tau, u * L0, 1e-12, 'leading clock lags by v L0');
  // In the train's own frame the ends are L0 apart and their clocks agree.
  const b2 = sr.bodyAtNow(legs, u, 5, -L0 / 2), f2 = sr.bodyAtNow(legs, u, 5, L0 / 2);
  close(f2.xp - b2.xp, L0, 1e-12); close(f2.tau, b2.tau, 1e-12); close(f2.tau, 5, 1e-12);
});

test('the tunnel paradox: doors close together for the platform, not for the train', () => {
  const u = .8, L0 = 10, tunnel = 6;           // γ = 5/3, so the train is 6 long in S
  const legs = sr.chainLegs([{t0: 0, x0: 0, u, tau0: 0}]);
  const back = sr.bodyAtNow(legs, 0, 0, -L0 / 2), front = sr.bodyAtNow(legs, 0, 0, L0 / 2);
  close(back.x, -tunnel / 2, 1e-12); close(front.x, tunnel / 2, 1e-12);
  const [tIn] = sr.toFrame([0, -tunnel / 2], u), [tOut] = sr.toFrame([0, tunnel / 2], u);
  close(tIn - tOut, sr.gamma(u) * u * tunnel, 1e-12, 'in the train frame the far door closes first');
});

test('a body on several legs is found on the right leg, with its own clock', () => {
  const v = .8, legs = sr.chainLegs([{t0: 0, x0: 0, u: v, tau0: 0}, {t0: 10, x0: 8, u: -v, tau0: 6}, {t0: 20, x0: 0, u: 0, tau0: 12}]);
  const mid = sr.bodyAtNow(legs, 0, 15);
  close(mid.x, 4, 1e-12); close(mid.tau, 9, 1e-12);
  close(sr.bodyAtNow(legs, 0, 25).tau, 17, 1e-12, 'home: 12 + 5');
  assert.equal(sr.bodyAtNow(legs, 0, -1), null, 'not launched yet');
  const seen = sr.bodyAtNow(legs, -v, 4);
  close(sr.toFrame([seen.t, seen.x], -v)[0], 4, 1e-12);
});
