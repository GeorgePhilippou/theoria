// Light as an electromagnetic wave: Maxwell's equations on a 2D grid (the Yee FDTD method).
// TM mode: the electric field Ez points out of the plane; the magnetic field (Hx, Hy) lies in it.
// Normalised units: c = 1, grid spacing 1, ε₀ = μ₀ = 1, so E and H (= B here) have the same scale.
//   ∂Hx/∂t = −∂Ez/∂y,   ∂Hy/∂t = ∂Ez/∂x,   ε ∂Ez/∂t = ∂Hy/∂x − ∂Hx/∂y
// A graded, matched conducting border absorbs outgoing waves.

export const COURANT = .5;   // time step in grid units (stable below 1/√2)

/**
 * `periodicY` wraps the top and bottom edges, so a strip behaves like an infinitely wide plane
 * (used for tests); otherwise the absorbing border runs all the way round.
 */
export function createField({nx = 200, ny = 200, border = 24, dt = COURANT, periodicY = false} = {}) {
  const n = nx * ny;
  const ez = new Float32Array(n), hx = new Float32Array(n), hy = new Float32Array(n);
  const eps = new Float32Array(n).fill(1), metal = new Uint8Array(n);
  const ca = new Float32Array(n), cb = new Float32Array(n), da = new Float32Array(n), db = new Float32Array(n);
  const sources = [];
  const field = {nx, ny, border, dt, ez, hx, hy, eps, metal, sources, t: 0, steps: 0};

  /** Conductivity of the absorbing border: cubic grading, matched electric and magnetic. */
  const sigmaMax = 4 * Math.log(1e6) / (2 * border);
  const sigmaAt = (i, j) => {
    const d = periodicY ? Math.max(0, border - i, i - (nx - 1 - border))
      : Math.max(0, border - i, border - j, i - (nx - 1 - border), j - (ny - 1 - border));
    return d > 0 ? sigmaMax * (d / border) ** 3 : 0;
  };

  /** Recompute update coefficients after changing eps or metal. */
  field.rebuild = () => {
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i, s = sigmaAt(i, j), e = eps[k];
      const le = s * dt / (2 * e), lm = s * dt / 2;
      ca[k] = metal[k] ? 0 : (1 - le) / (1 + le);
      cb[k] = metal[k] ? 0 : (dt / e) / (1 + le);
      da[k] = (1 - lm) / (1 + lm);
      db[k] = dt / (1 + lm);
    }
  };

  /** Set the material of every cell: fn(i, j) → {eps, metal}. */
  field.setMaterial = fn => {
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i, m = fn(i, j) ?? {};
      eps[k] = m.eps ?? 1;
      metal[k] = m.metal ? 1 : 0;
    }
    field.rebuild();
  };

  field.clear = () => { ez.fill(0); hx.fill(0); hy.fill(0); field.t = 0; field.steps = 0; };

  field.step = () => {
    const jUp = periodicY ? ny : ny - 1, jFrom = periodicY ? 0 : 1, jTo = periodicY ? ny : ny - 1;
    for (let j = 0; j < jUp; j++) {
      const up = (j + 1) % ny * nx - j * nx;   // offset to the row above (wraps when periodic)
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        hx[k] = da[k] * hx[k] - db[k] * (ez[k + up] - ez[k]);
      }
    }
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx - 1; i++) {
      const k = j * nx + i;
      hy[k] = da[k] * hy[k] + db[k] * (ez[k + 1] - ez[k]);
    }
    for (let j = jFrom; j < jTo; j++) {
      const down = (j + ny - 1) % ny * nx - j * nx;
      for (let i = 1; i < nx - 1; i++) {
        const k = j * nx + i;
        ez[k] = ca[k] * ez[k] + cb[k] * ((hy[k] - hy[k - 1]) - (hx[k] - hx[k + down]));
      }
    }
    field.t += dt;
    field.steps++;
    for (const s of sources) s.apply(field);
  };

  /** Total electromagnetic energy, ½ Σ (ε Ez² + Hx² + Hy²). */
  field.energy = () => {
    let u = 0;
    for (let k = 0; k < n; k++) u += eps[k] * ez[k] * ez[k] + hx[k] * hx[k] + hy[k] * hy[k];
    return u / 2;
  };

  field.rebuild();
  return field;
}

/** Smooth start, so a switched-on source does not ring. */
const ramp = (t, period) => Math.min(1, t / (2 * period)) ** 2;

/** A point charge oscillating at angular frequency ω (an antenna seen end-on). */
export function pointSource(i, j, {omega, amp = 1, phase = 0}) {
  return {kind: 'point', i, j, omega, apply(f) {
    f.ez[j * f.nx + i] += amp * f.dt * Math.sin(omega * f.t + phase) * ramp(f.t, 2 * Math.PI / omega);
  }};
}

/** A line of sources at column i: launches a plane wave travelling along ±x. */
export function lineSource(i, {omega, amp = 1, from, to}) {
  return {kind: 'line', i, omega, apply(f) {
    const v = amp * f.dt * Math.sin(omega * f.t) * ramp(f.t, 2 * Math.PI / omega);
    for (let j = from ?? 0; j < (to ?? f.ny); j++) f.ez[j * f.nx + i] += v;
  }};
}

/** A short Gaussian burst at one point or along a column: a single ripple or a single wavefront. */
export function pulse({i, j = null, t0, width, amp = 1, from, to}) {
  return {kind: 'pulse', i, j, t0, width, apply(f) {
    const v = amp * f.dt * Math.exp(-(((f.t - t0) / width) ** 2));
    if (Math.abs(f.t - t0) > 5 * width) return;
    if (j !== null) f.ez[j * f.nx + i] += v;
    else for (let jj = from ?? 0; jj < (to ?? f.ny); jj++) f.ez[jj * f.nx + i] += v;
  }};
}

/** Angular frequency for a wavelength λ (in grid cells) in vacuum. */
export const omegaFor = lambda => 2 * Math.PI / lambda;
