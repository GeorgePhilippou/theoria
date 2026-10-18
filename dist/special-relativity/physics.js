// Special relativity in flat spacetime. Units: c = 1, times in seconds, distances in light-seconds (ls).
// Events are [t, x, y] in the Earth frame unless stated. Motion is along x; y is never affected by boosts.

/** Lorentz factor γ = 1/√(1 − v²). */
export const gamma = v => 1 / Math.sqrt(1 - v * v);

/** Rapidity φ = artanh v. Rapidities add along one direction, unlike velocities. */
export const rapidity = v => Math.atanh(v);

/** Velocity u (Earth frame) as measured in a frame moving at w: (u − w)/(1 − uw). */
export const relativeVelocity = (u, w) => (u - w) / (1 - u * w);

/** Coordinates of event e in a frame moving at rapidity φ relative to the Earth frame. */
export function boost([t, x, y = 0], phi) {
  const c = Math.cosh(phi), s = Math.sinh(phi);
  return [t * c - x * s, x * c - t * s, y];
}

/** Spacetime interval s² = t² − x² − y²: the same in every frame. */
export const interval = ([t, x, y = 0]) => t * t - x * x - y * y;

/**
 * The ship's centre. It leaves Earth at the origin event at speed v. On a round trip it turns
 * around (instantly) at Earth time `turnAt`, comes home at 2·turnAt and then stays.
 * Legs are described by the ship's own time τ.
 */
export function journey({v, roundTrip = false, turnAt = 10}) {
  const g = gamma(v), legs = [{tau0: 0, t0: 0, x0: 0, u: v}];
  if (roundTrip) {
    const tauTurn = turnAt / g;
    legs.push({tau0: tauTurn, t0: turnAt, x0: v * turnAt, u: -v});
    legs.push({tau0: 2 * tauTurn, t0: 2 * turnAt, x0: 0, u: 0});
  }
  const legAt = tau => legs.findLast(leg => tau >= leg.tau0) ?? legs[0];
  /** Earth-frame event of the ship's centre at its own time τ. */
  const centreAt = tau => {
    const leg = legAt(tau), dtau = tau - leg.tau0, gu = gamma(leg.u);
    return [leg.t0 + gu * dtau, leg.x0 + gu * leg.u * dtau, 0];
  };
  /** Ship time τ at Earth time t. */
  const tauAtT = t => {
    const leg = legs.findLast(l => t >= l.t0) ?? legs[0];
    return leg.tau0 + (t - leg.t0) / gamma(leg.u);
  };
  return {v, roundTrip, turnAt, legs, legAt, centreAt, tauAtT};
}

/**
 * Event at rest-frame offset (dt′, dx′, dy) from the ship's centre at its own time τ,
 * using the rest frame of the leg it is on.
 */
export function shipEvent(trip, tau, [dtp, dxp, dy = 0]) {
  const [t, x] = trip.centreAt(tau), u = trip.legAt(tau).u, g = gamma(u);
  return [t + g * (dtp + u * dxp), x + g * (dxp + u * dtp), dy];
}

/**
 * A light clock: a photon bouncing between mirrors at y = ±L/2, at the ship's centre.
 * One tick is a round trip, 2L of the ship's own time. Returns the photon's worldline
 * as Earth-frame events at every bounce and at every change of leg.
 */
export function lightClock(trip, {L = .5, tauMax = 40} = {}) {
  const taus = new Set();
  for (let tau = 0; tau <= tauMax + 1e-9; tau += L) taus.add(+tau.toFixed(9));
  for (const leg of trip.legs) if (leg.tau0 <= tauMax) taus.add(leg.tau0);
  return [...taus].sort((a, b) => a - b).map(tau => {
    const phase = (tau % (2 * L)) / L;
    const y = -L / 2 + L * (phase <= 1 ? phase : 2 - phase);
    const [t, x] = trip.centreAt(tau);
    return [t, x, y, tau];
  });
}

/**
 * A flash from the ship's centre at ship time τe, reaching the back and front of a ship of
 * rest length L0. In the ship's frame both arrive L0/2 later; on Earth the back is lit first,
 * by γ v L0.
 */
export function shipFlash(trip, {L0 = 4, tauEmit = 4} = {}) {
  return {
    emit: trip.centreAt(tauEmit),
    back: shipEvent(trip, tauEmit, [L0 / 2, -L0 / 2]),
    front: shipEvent(trip, tauEmit, [L0 / 2, L0 / 2]),
  };
}

/** Length of a body of rest length L0 moving at u relative to the observer. */
export const contractedLength = (L0, u) => L0 / gamma(u);

/**
 * The point where a worldline (Earth-frame events in time order) crosses the "now" t′ = tNow
 * of the frame with rapidity φ. Returns display coordinates [t′, x′, y, fraction-along] or null.
 * Worldlines of matter and light keep their time order in every frame, so a scan suffices.
 */
export function sliceAt(events, phi, tNow) {
  let previous = boost(events[0], phi);
  if (tNow < previous[0]) return null;
  for (let i = 1; i < events.length; i++) {
    const current = boost(events[i], phi);
    if (current[0] >= tNow) {
      const f = (tNow - previous[0]) / (current[0] - previous[0] || 1);
      return [tNow, previous[1] + f * (current[1] - previous[1]), previous[2] + f * (current[2] - previous[2]), i - 1 + f];
    }
    previous = current;
  }
  return null;
}

/** Earth's clock reading on the ship's line of simultaneity through event e, for ship speed u. */
export const earthTimeSimultaneousWith = ([t, x], u) => t - u * x;

// ---------------------------------------------------------------- the sandbox: bodies seen from any frame
// Bodies move in straight legs in the platform frame S. A leg starts at S event (t0, x0), where the body's own
// clock reads tau0, and moves at u until tEnd. Frames are named by their velocity w relative to S.

/** Velocity addition: something moving at u in a frame that itself moves at w (both along x). */
export const addVelocities = (u, w) => (u + w) / (1 + u * w);

/** Coordinates [t′, x′] in frame w of S event e, and back again. */
export const toFrame = (e, w) => boost(e, rapidity(w));
export const fromFrame = (e, w) => boost(e, -rapidity(w));

/**
 * The S event where a point moving uniformly (through S event (t0, x0) at velocity u) meets the "now" t′ = T
 * of frame w. Solves γ_w (t − w x) = T with x = x0 + u (t − t0).
 */
export function lineMeetsNow(t0, x0, u, w, T) {
  const t = (T / gamma(w) + w * (x0 - u * t0)) / (1 - w * u);
  return [t, x0 + u * (t - t0)];
}

/**
 * Reading of a clock riding a rigid body that moves at u, its clocks synchronised in its own frame
 * (Einstein's convention), when the clock at S event (t0, x0) reads tau0. Valid for any point of the body.
 */
export const bodyClock = (t0, x0, u, tau0, [t, x]) => tau0 + gamma(u) * ((t - t0) - u * (x - x0));

/** Fills in tEnd for each leg (the next leg's t0, or +∞). */
export function chainLegs(legs) {
  return legs.map((leg, i) => ({...leg, tEnd: legs[i + 1]?.t0 ?? Infinity}));
}

/**
 * Where a body following `legs` (with tEnd) is at time T of frame w, offset ξ along its own length
 * (rest-frame distance from its centre; only meaningful on a single straight leg).
 * Returns {t, x (S), tp, xp (frame w), tau (its clock there), leg} or null if it does not exist yet.
 */
export function bodyAtNow(legs, w, T, xi = 0) {
  for (const leg of legs) {
    const x0 = leg.x0 + xi / gamma(leg.u);
    const [t, x] = lineMeetsNow(leg.t0, x0, leg.u, w, T);
    if (t < leg.t0 - 1e-9 && leg === legs[0] && !leg.forever) return null;
    if ((t >= leg.t0 - 1e-9 || leg.forever) && t < leg.tEnd) {
      const [tp, xp] = toFrame([t, x], w);
      return {t, x, tp, xp, tau: bodyClock(leg.t0, leg.x0, leg.u, leg.tau0, [t, x]), leg};
    }
  }
  return null;
}
