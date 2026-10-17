// General relativity outside a non-rotating, uncharged mass: the Schwarzschild exterior.
// Units: Schwarzschild radius r_s = 2GM/c² = 1 and c = 1, so lengths are in r_s and times in r_s/c.
// "t" is Schwarzschild coordinate time, the time of a distant observer at rest; "τ" is a clock's own time.

/** Radius of the photon sphere, where light can orbit (unstably). */
export const PHOTON_SPHERE = 1.5;

/** Innermost stable circular orbit for matter. */
export const ISCO = 3;

/** Impact parameter that separates captured light from escaping light: 3√3/2 r_s. */
export const criticalImpact = 3 * Math.sqrt(3) / 2;

/** Proper-time rate dτ/dt of a clock held static at radius r. */
export const rate = r => Math.sqrt(1 - 1 / r);

/** Height of Flamm's paraboloid, an isometric embedding of the equatorial spatial slice. */
export const embedding = r => 2 * Math.sqrt(r - 1);

// Tortoise coordinate r* = r + ln(r − 1). Radial light obeys dr*/dt = ±1.
export const tortoise = r => r + Math.log(r - 1);

/** Inverse of the tortoise coordinate: the radius r > 1 with r + ln(r − 1) = s. */
export function radiusFromTortoise(s) {
  // f(x) = 1 + eˣ + x − s is increasing in x = ln(r − 1), so bisection always converges.
  let lo = -700, hi = Math.max(Math.log(Math.max(s, 2)), 0) + 1;
  for (let i = 0; i < 120; i++) {
    const mid = (lo + hi) / 2;
    if (1 + Math.exp(mid) + mid < s) lo = mid; else hi = mid;
  }
  return 1 + Math.exp((lo + hi) / 2);
}

/** Coordinate time for light to travel radially between two radii. */
export const radialLightDelay = (r1, r2) => Math.abs(tortoise(r2) - tortoise(r1));

/** Radius reached by a radial light pulse sent from rFrom towards rTo, after coordinate time dt. */
export function signalRadius(rFrom, rTo, dt) {
  const direction = rTo >= rFrom ? 1 : -1;
  return radiusFromTortoise(tortoise(rFrom) + direction * dt);
}

/**
 * Flashes sent radially from a static clock at rFrom, one every `interval` of its own time,
 * to a static clock at rTo. The spacetime is static, so every flash takes the same coordinate
 * time; the received spacing in the receiver's own time is interval · rate(rTo) / rate(rFrom).
 */
export function signalSchedule(rFrom, rTo, {interval = 2, tMax = 60} = {}) {
  const delay = radialLightDelay(rFrom, rTo);
  const flashes = [];
  for (let n = 0; ; n++) {
    const tauEmit = n * interval, tEmit = tauEmit / rate(rFrom);
    if (tEmit > tMax) break;
    const tArrive = tEmit + delay;
    flashes.push({n, tauEmit, tEmit, tArrive, tauArrive: tArrive * rate(rTo)});
  }
  return {delay, flashes, receivedInterval: interval * rate(rTo) / rate(rFrom)};
}

/** Wavelength measured by a static observer at r, relative to its value when emitted at rFrom. */
export const wavelengthFactor = (rFrom, r) => rate(r) / rate(rFrom);

/**
 * Radial free fall from rest at radius R, in the exact cycloid parametrisation (MTW §31.10)
 * with η from 0 (release) to π (the central singularity):
 *   r = R/2 (1 + cos η),  τ = R^{3/2}/2 (η + sin η),
 *   t = ln|(k + tan η/2)/(k − tan η/2)| + k [η + R/2 (η + sin η)],  k = √(R − 1).
 * The horizon is reached at η_h = 2 arctan k: finite τ, but t → ∞.
 */
export function freeFall(R) {
  const k = Math.sqrt(R - 1), scale = R ** 1.5 / 2;
  const etaHorizon = 2 * Math.atan(k);
  const r = eta => R / 2 * (1 + Math.cos(eta));
  const tau = eta => scale * (eta + Math.sin(eta));
  const t = eta => {
    const h = Math.tan(eta / 2);
    return Math.log((k + h) / (k - h)) + k * (eta + R / 2 * (eta + Math.sin(eta)));
  };
  const invert = (f, target, hi) => {
    let lo = 0;
    for (let i = 0; i < 100; i++) {
      const mid = (lo + hi) / 2;
      if (f(mid) < target) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  };
  return {
    R, r, tau, t, etaHorizon,
    energy: rate(R),
    tauHorizon: tau(etaHorizon),
    tauCentre: tau(Math.PI),
    /** η at coordinate time t; approaches η_h but never reaches it. */
    etaAtT: time => time <= 0 ? 0 : invert(t, time, etaHorizon),
    /** η at proper time τ, up to the singularity. */
    etaAtTau: proper => proper <= 0 ? 0 : invert(tau, Math.min(proper, tau(Math.PI)), Math.PI),
  };
}

// Null geodesics in the equatorial plane, affine parameter λ, conserved E = 1 and L = −b:
//   r' = p,  p' = L²/r³ − 3L²/(2r⁴),  φ' = L/r²,  t' = 1/(1 − 1/r),
//   with the constraint p² + (1 − 1/r) L²/r² = 1.
function derivative([r, p, , ], L) {
  return [p, L * L / (r * r * r) - 1.5 * L * L / (r * r * r * r), L / (r * r), 1 / (1 - 1 / r)];
}

function rk4(s, h, L) {
  const a = derivative(s, L);
  const b = derivative(s.map((v, i) => v + h * a[i] / 2), L);
  const c = derivative(s.map((v, i) => v + h * b[i] / 2), L);
  const d = derivative(s.map((v, i) => v + h * c[i]), L);
  return s.map((v, i) => v + h * (a[i] + 2 * b[i] + 2 * c[i] + d[i]) / 6);
}

/** Light ray arriving from −x with impact parameter b, launched at `radius` at t = 0. */
export function tracePhoton(b, {radius = 14, stepSize = .035, maxSteps = 40000} = {}) {
  const L = -b;
  let s = [radius, -Math.sqrt(1 - (1 - 1 / radius) * b * b / (radius * radius)), Math.PI - Math.asin(b / radius), 0];
  const points = [];
  let error = 0;
  for (let i = 0; i < maxSteps; i++) {
    const [r, p, phi, t] = s;
    points.push({r, phi, t, x: r * Math.cos(phi), z: r * Math.sin(phi)});
    error = Math.max(error, Math.abs(p * p + (1 - 1 / r) * L * L / (r * r) - 1));
    if (r < 1.015) return {points, outcome: 'captured', error};
    if (r > radius + .05 && p > 0) return {points, outcome: 'escapes', error};
    s = rk4(s, Math.min(stepSize, .06 * (r - 1)), L);
  }
  return {points, outcome: 'limit', error};
}

/** Linear interpolation of a traced ray at coordinate time t; null outside the trace. */
export function sampleAt(points, t) {
  if (t < 0 || t > points.at(-1).t) return null;
  let lo = 0, hi = points.length - 1;
  while (hi - lo > 1) {
    const m = (hi + lo) >> 1;
    if (points[m].t < t) lo = m; else hi = m;
  }
  const a = points[lo], b = points[hi], u = (t - a.t) / (b.t - a.t || 1);
  return {x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u, r: a.r + (b.r - a.r) * u};
}

/** Total angle swept by a traced ray: π for a straight line, more when light wraps around. */
export function sweptAngle(points) {
  return Math.abs(points.at(-1).phi - points[0].phi);
}

// ---------------------------------------------------------------- ingoing Eddington–Finkelstein time
// t̃ = t + ln|r − 1|. Unlike Schwarzschild t it stays finite at the horizon, so worldlines can be drawn across it.
// Ingoing light moves at dt̃/dr = −1; outgoing light at dt̃/dr = (r + 1)/(r − 1), which is vertical at r = 1
// and points inwards for r < 1: the light cones tip over.

/** Ingoing Eddington–Finkelstein time from Schwarzschild time t at radius r. */
export const efTime = (t, r) => t + Math.log(Math.abs(r - 1));

/** Slopes dt̃/dr of the two edges of the light cone at radius r: [ingoing, outgoing]. */
export const coneSlopes = r => [-1, (r + 1) / (r - 1)];

/** EF time along an outgoing radial light ray from (r0, t̃0) when it reaches r (both on the same side of the horizon). */
export const outgoingLightEF = (r0, ef0, r) => ef0 + (r - r0) + 2 * Math.log(Math.abs((r - 1) / (r0 - 1)));

/**
 * Free fall from rest at R, tabulated through the horizon to near the centre, in EF time.
 * dt̃/dτ = [(1 − 1/R)(r + 1) + 1/r] / [E r + √(1/r − 1/R)] has no singularity at r = 1.
 * Returns samples {tau, r, ef} and lookups by proper time or by EF time.
 */
export function fallEF(R, {steps = 4000, rStop = .03} = {}) {
  const fall = freeFall(R), E = rate(R), samples = [];
  const dEF = r => ((1 - 1 / R) * (r + 1) + 1 / r) / (E * r + Math.sqrt(Math.max(0, 1 / r - 1 / R)));
  let ef = 0, prev = null;
  for (let i = 0; i <= steps; i++) {
    const eta = Math.PI * i / steps, r = fall.r(eta), tau = fall.tau(eta);
    if (r < rStop) break;
    if (prev) ef += (tau - prev.tau) * (dEF(r) + dEF(prev.r)) / 2;
    else ef = efTime(0, R);
    samples.push(prev = {tau, r, ef});
  }
  const lookup = (key, value) => {
    if (value <= samples[0][key]) return samples[0];
    for (let i = 1; i < samples.length; i++) if (samples[i][key] >= value) {
      const a = samples[i - 1], b = samples[i], u = (value - a[key]) / (b[key] - a[key]);
      return {tau: a.tau + u * (b.tau - a.tau), r: a.r + u * (b.r - a.r), ef: a.ef + u * (b.ef - a.ef)};
    }
    return null;   // beyond the last sample: at the centre
  };
  const horizon = samples.find(s => s.r <= 1);
  return {R, samples, fall, atTau: tau => lookup("tau", tau), atEF: ef => lookup("ef", ef), efHorizon: horizon?.ef, tauHorizon: fall.tauHorizon};
}

// ---------------------------------------------------------------- orbits of matter
// Equatorial timelike geodesics, proper time τ, conserved L (angular momentum per unit mass) and E:
//   r̈ = −1/(2r²) + L²/r³ − 3L²/(2r⁴),  φ̇ = L/r²,  ṫ = E/(1 − 1/r).

/** Angular momentum of a circular orbit at radius r (circular orbits exist for r > 1.5, stable for r > 3). */
export const circularL = r => r / Math.sqrt(2 * r - 3);

/**
 * An orbit launched tangentially at radius r0 with angular momentum L. Returns points {t, tau, r, phi, x, y}
 * up to coordinate time tMax, and the outcome: 'bound', 'plunges' (crosses r = 1.02) or 'escapes'.
 */
export function orbit(r0, L, {tMax = 400, h = .02, phi0 = 0} = {}) {
  const E = Math.sqrt((1 - 1 / r0) * (1 + L * L / (r0 * r0)));
  const f = ([r, v]) => [v, -1 / (2 * r * r) + L * L / (r * r * r) - 1.5 * L * L / (r * r * r * r), L / (r * r), E / (1 - 1 / r)];
  let s = [r0, 0, phi0, 0], tau = 0;
  const points = [];
  let outcome = 'bound';
  for (let i = 0; i < 400000; i++) {
    const [r, , phi, t] = s;
    if (i % 4 === 0) points.push({t, tau, r, phi, x: r * Math.cos(phi), y: r * Math.sin(phi)});
    if (r < 1.02) { outcome = 'plunges'; break; }
    if (r > 60) { outcome = 'escapes'; break; }
    if (t > tMax) break;
    const step = h * Math.min(1, (r - 1) * 2);
    const a = f(s), b = f(s.map((x, k) => x + step * a[k] / 2)), c = f(s.map((x, k) => x + step * b[k] / 2)), d = f(s.map((x, k) => x + step * c[k]));
    s = s.map((x, k) => x + step * (a[k] + 2 * b[k] + 2 * c[k] + d[k]) / 6);
    tau += step;
  }
  return {points, outcome, E, L};
}

/** Linear interpolation along any time-ordered list of points by coordinate time t (clamped to the ends). */
export function pointAtT(points, t) {
  if (t <= points[0].t) return points[0];
  if (t >= points.at(-1).t) return points.at(-1);
  let lo = 0, hi = points.length - 1;
  while (hi - lo > 1) { const m = (hi + lo) >> 1; if (points[m].t < t) lo = m; else hi = m; }
  const a = points[lo], b = points[hi], u = (t - a.t) / (b.t - a.t || 1), out = {};
  for (const key of Object.keys(a)) out[key] = a[key] + (b[key] - a[key]) * u;
  return out;
}

/**
 * A light ray from any point (x, y) in any direction (dx, dy), as measured by an observer held still there.
 * For angle α between the ray and the outward direction: L = r sin α / √(1 − 1/r), dr/dλ = cos α (E = 1).
 * Returns points {t, r, phi, x, y} and the outcome ('captured', 'escapes' beyond rOut, or 'limit').
 */
export function traceRay(x, y, dx, dy, {rOut = 16, stepSize = .03, maxSteps = 60000} = {}) {
  const r0 = Math.hypot(x, y), phi0 = Math.atan2(y, x), len = Math.hypot(dx, dy);
  const radial = (dx * Math.cos(phi0) + dy * Math.sin(phi0)) / len;
  const tangential = (-dx * Math.sin(phi0) + dy * Math.cos(phi0)) / len;
  const L = r0 * tangential / Math.sqrt(1 - 1 / r0);
  let s = [r0, radial, phi0, 0];
  const points = [];
  for (let i = 0; i < maxSteps; i++) {
    const [r, p, phi, t] = s;
    if (i % 2 === 0) points.push({t, r, phi, x: r * Math.cos(phi), y: r * Math.sin(phi)});
    if (r < 1.01) return {points, outcome: 'captured', L};
    if (r > rOut && p > 0) return {points, outcome: 'escapes', L};
    s = rk4(s, Math.min(stepSize, .06 * (r - 1)), L);
  }
  return {points, outcome: 'limit', L};
}
