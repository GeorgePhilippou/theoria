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
