// Quantum waves: the time-dependent Schrödinger equation in 2D, and exact hydrogen orbitals.
// Units: ħ = m = 1 (atomic-style). The wave equation is  i ∂ψ/∂t = −½∇²ψ + V ψ.
// Time stepping uses the split-step Fourier method (Strang splitting): half a potential kick,
// a full free-flight step done exactly in momentum space, then another half kick. Each part is
// unitary, so total probability is conserved to rounding error (until the absorbing edge).

// ---------------------------------------------------------------- FFT (radix-2, in place)
function fftPlan(n) {
  const bits = Math.log2(n);
  if (!Number.isInteger(bits)) throw new Error('FFT size must be a power of 2');
  const rev = new Uint32Array(n);
  for (let i = 0; i < n; i++) rev[i] = parseInt(i.toString(2).padStart(bits, '0').split('').reverse().join(''), 2);
  const cos = new Float64Array(n / 2), sin = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) { cos[i] = Math.cos(2 * Math.PI * i / n); sin[i] = Math.sin(2 * Math.PI * i / n); }
  return {n, rev, cos, sin};
}

/** In-place FFT of (re, im) with stride; inverse includes the 1/n factor. */
export function fft(re, im, plan, inverse = false, offset = 0, stride = 1) {
  const {n, rev, cos, sin} = plan, sign = inverse ? 1 : -1;
  for (let i = 0; i < n; i++) {
    const j = rev[i];
    if (j > i) {
      const a = offset + i * stride, b = offset + j * stride;
      let t = re[a]; re[a] = re[b]; re[b] = t;
      t = im[a]; im[a] = im[b]; im[b] = t;
    }
  }
  for (let size = 2; size <= n; size *= 2) {
    const half = size / 2, step = n / size;
    for (let start = 0; start < n; start += size) {
      for (let k = 0; k < half; k++) {
        const wr = cos[k * step], wi = sign * sin[k * step];
        const a = offset + (start + k) * stride, b = offset + (start + k + half) * stride;
        const xr = re[b] * wr - im[b] * wi, xi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - xr; im[b] = im[a] - xi;
        re[a] += xr; im[a] += xi;
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) { const a = offset + i * stride; re[a] /= n; im[a] /= n; }
}

export const planFor = fftPlan;

/**
 * FFT down every column of an (nx × plan.n) row-major grid at once. The inner loops run along
 * rows, so memory is read in order: much faster than transforming each column with a stride.
 */
export function fftColumns(re, im, plan, nx, inverse = false) {
  const {n, rev, cos, sin} = plan, sign = inverse ? 1 : -1;
  for (let r = 0; r < n; r++) {
    const s = rev[r];
    if (s > r) {
      const a = r * nx, b = s * nx;
      for (let i = 0; i < nx; i++) {
        let t = re[a + i]; re[a + i] = re[b + i]; re[b + i] = t;
        t = im[a + i]; im[a + i] = im[b + i]; im[b + i] = t;
      }
    }
  }
  for (let size = 2; size <= n; size *= 2) {
    const half = size / 2, step = n / size;
    for (let start = 0; start < n; start += size) {
      for (let k = 0; k < half; k++) {
        const wr = cos[k * step], wi = sign * sin[k * step];
        const a = (start + k) * nx, b = (start + k + half) * nx;
        for (let i = 0; i < nx; i++) {
          const br = re[b + i], bi = im[b + i];
          const xr = br * wr - bi * wi, xi = br * wi + bi * wr;
          re[b + i] = re[a + i] - xr; im[b + i] = im[a + i] - xi;
          re[a + i] += xr; im[a + i] += xi;
        }
      }
    }
  }
  if (inverse) { const f = 1 / n, total = n * nx; for (let k = 0; k < total; k++) { re[k] *= f; im[k] *= f; } }
}

// ---------------------------------------------------------------- the 2D wave
/**
 * A wavefunction on an nx × ny grid covering lx × ly, centred on the origin.
 * `absorb` cells at each edge gently remove the wave as it leaves (0 to keep everything).
 */
export function createWave({nx = 256, ny = 256, lx = 128, ly = 128, dt = .2, absorb = 16} = {}) {
  const n = nx * ny, dx = lx / nx, dy = ly / ny;
  const re = new Float64Array(n), im = new Float64Array(n), V = new Float64Array(n);
  const vc = new Float64Array(n).fill(1), vs = new Float64Array(n), mask = new Float64Array(n).fill(1);
  const px = fftPlan(nx), py = fftPlan(ny);
  const wave = {nx, ny, lx, ly, dx, dy, dt, re, im, V, t: 0};
  const xAt = i => (i - nx / 2) * dx, yAt = j => (j - ny / 2) * dy;
  wave.xAt = xAt; wave.yAt = yAt;

  // Free flight for one step: multiply by exp(−i k² dt / 2), separable in kx and ky.
  const phase = (count, length) => {
    const c = new Float64Array(count), s = new Float64Array(count);
    for (let i = 0; i < count; i++) {
      const k = 2 * Math.PI / length * (i < count / 2 ? i : i - count);
      c[i] = Math.cos(-k * k * dt / 2); s[i] = Math.sin(-k * k * dt / 2);
    }
    return [c, s];
  };
  const [kxc, kxs] = phase(nx, lx), [kyc, kys] = phase(ny, ly);

  if (absorb > 0) {
    const edge = (i, count) => {
      const d = Math.min(i, count - 1 - i);
      return d >= absorb ? 1 : Math.cos((absorb - d) / absorb * Math.PI / 2) ** .08;
    };
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) mask[j * nx + i] = edge(i, nx) * edge(j, ny);
  }

  /** Set the potential: fn(x, y) → V. */
  wave.setPotential = fn => {
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i, v = fn(xAt(i), yAt(j));
      V[k] = v;
      vc[k] = Math.cos(-v * dt / 2); vs[k] = Math.sin(-v * dt / 2);
    }
  };

  /** A Gaussian wave packet: centre (x0, y0), momentum (kx, ky), widths σx, σy of |ψ|². */
  wave.setPacket = ({x0 = 0, y0 = 0, kx = 0, ky = 0, sx = 6, sy = 6}) => {
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const x = xAt(i) - x0, y = yAt(j) - y0, k = j * nx + i;
      const a = Math.exp(-x * x / (4 * sx * sx) - y * y / (4 * sy * sy)), p = kx * x + ky * y;
      re[k] = a * Math.cos(p); im[k] = a * Math.sin(p);
    }
    wave.normalise();
    wave.t = 0;
  };

  wave.norm = () => { let s = 0; for (let k = 0; k < n; k++) s += re[k] * re[k] + im[k] * im[k]; return s * dx * dy; };
  wave.normalise = () => { const f = 1 / Math.sqrt(wave.norm()); for (let k = 0; k < n; k++) { re[k] *= f; im[k] *= f; } };

  const kick = () => {
    for (let k = 0; k < n; k++) {
      const r = re[k], i = im[k], c = vc[k], s = vs[k];
      re[k] = r * c - i * s; im[k] = r * s + i * c;
    }
  };
  wave.step = () => {
    kick();
    for (let j = 0; j < ny; j++) fft(re, im, px, false, j * nx, 1);
    fftColumns(re, im, py, nx, false);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      const c = kxc[i] * kyc[j] - kxs[i] * kys[j], s = kxc[i] * kys[j] + kxs[i] * kyc[j];
      const r = re[k], m = im[k];
      re[k] = r * c - m * s; im[k] = r * s + m * c;
    }
    fftColumns(re, im, py, nx, true);
    for (let j = 0; j < ny; j++) fft(re, im, px, true, j * nx, 1);
    kick();
    if (absorb > 0) for (let k = 0; k < n; k++) { re[k] *= mask[k]; im[k] *= mask[k]; }
    wave.t += dt;
  };

  /** Probability in the region where fn(x, y) is true. */
  wave.probability = fn => {
    let s = 0;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) if (fn(xAt(i), yAt(j))) { const k = j * nx + i; s += re[k] * re[k] + im[k] * im[k]; }
    return s * dx * dy;
  };
  /** Mean and spread of x under |ψ|². */
  wave.statsX = () => {
    let p = 0, m = 0, m2 = 0;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i, w = re[k] * re[k] + im[k] * im[k], x = xAt(i);
      p += w; m += w * x; m2 += w * x * x;
    }
    m /= p;
    return {mean: m, sd: Math.sqrt(m2 / p - m * m)};
  };
  return wave;
}

/** Transmission of a plane wave with energy E = k²/2 through a square barrier (height V0, width a). */
export function barrierTransmission(E, V0, a) {
  if (Math.abs(E - V0) < 1e-9) return 1 / (1 + V0 * a * a / 2);
  if (E < V0) {
    const kappa = Math.sqrt(2 * (V0 - E)), s = Math.sinh(kappa * a);
    return 1 / (1 + V0 * V0 * s * s / (4 * E * (V0 - E)));
  }
  const q = Math.sqrt(2 * (E - V0)), s = Math.sin(q * a);
  return 1 / (1 + V0 * V0 * s * s / (4 * E * (E - V0)));
}

/** Transmission averaged over a Gaussian packet's momenta: centre k0, |ψ|² width σx (so σk = 1/(2σx)). */
export function packetTransmission(k0, sigmaX, V0, a) {
  const sk = 1 / (2 * sigmaX);
  let num = 0, den = 0;
  for (let u = -5; u <= 5; u += .01) {
    const k = k0 + u * sk, w = Math.exp(-u * u / 2);
    if (k <= 0) continue;
    num += w * barrierTransmission(k * k / 2, V0, a);
    den += w;
  }
  return num / den;
}

// ---------------------------------------------------------------- hydrogen
const factorial = n => { let f = 1; for (let i = 2; i <= n; i++) f *= i; return f; };

/** Generalised Laguerre polynomial L_k^α(x), by recurrence. */
export function laguerre(k, alpha, x) {
  if (k === 0) return 1;
  let l0 = 1, l1 = 1 + alpha - x;
  for (let i = 1; i < k; i++) {
    const l2 = ((2 * i + 1 + alpha - x) * l1 - (i + alpha) * l0) / (i + 1);
    l0 = l1; l1 = l2;
  }
  return l1;
}

/** Normalised hydrogen radial function R_nl(r), Bohr radius a₀ = 1. */
export function radial(n, l, r) {
  const rho = 2 * r / n;
  const norm = Math.sqrt((2 / n) ** 3 * factorial(n - l - 1) / (2 * n * factorial(n + l)));
  return norm * Math.exp(-rho / 2) * rho ** l * laguerre(n - l - 1, 2 * l + 1, rho);
}

/** Real ("chemistry") angular parts, normalised over the sphere. Input is a unit vector. */
const ANGULAR = {
  s: () => 1 / Math.sqrt(4 * Math.PI),
  pz: (x, y, z) => Math.sqrt(3 / (4 * Math.PI)) * z,
  dz2: (x, y, z) => Math.sqrt(5 / (16 * Math.PI)) * (3 * z * z - 1),
  dxy: (x, y) => Math.sqrt(15 / (4 * Math.PI)) * x * y,
  fz3: (x, y, z) => Math.sqrt(7 / (16 * Math.PI)) * (5 * z * z * z - 3 * z),
};

export const ORBITALS = {
  '1s': {n: 1, l: 0, shape: 's'},
  '2s': {n: 2, l: 0, shape: 's'},
  '2p': {n: 2, l: 1, shape: 'pz'},
  '3p': {n: 3, l: 1, shape: 'pz'},
  '3d': {n: 3, l: 2, shape: 'dz2'},
  '3d xy': {n: 3, l: 2, shape: 'dxy'},
  '4f': {n: 4, l: 3, shape: 'fz3'},
};

/** ψ(x, y, z) for a named real orbital (z is the orbital's axis). */
export function orbital(name) {
  const {n, l, shape} = ORBITALS[name], Y = ANGULAR[shape];
  const psi = (x, y, z) => {
    const r = Math.hypot(x, y, z) || 1e-12;
    return radial(n, l, r) * Y(x / r, y / r, z / r);
  };
  return {...ORBITALS[name], name, psi, energy: -13.6057 / (n * n), extent: 2 * n * n + 6 * n};
}

/** Expected radius ⟨r⟩ = (3n² − l(l+1)) / 2 in Bohr radii. */
export const meanRadius = (n, l) => (3 * n * n - l * (l + 1)) / 2;
