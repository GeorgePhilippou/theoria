// Entropy and time's arrow: a 2D gas of soft disks, integrated in whole numbers so it can run exactly backwards.
//
// Positions and half-step velocities are stored as integers (in units of UNIT world lengths). Each step adds a
// rounded integer force kick, so the update depends only on the current positions and can be undone bit for bit
// (the Levesque–Verlet scheme). Mass m = 1 and Boltzmann's constant k = 1 throughout.

export const UNIT = 1e-7;

/** A small seeded random number generator (mulberry32), so experiments repeat exactly. */
export function random(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A box of `n` disks of radius `radius`, `width` × `height` world units, that repel with a stiff spring
 * (stiffness `k`) when they overlap. The walls repel the same way. `partitionUntil` is the step index before
 * which a wall stands down the middle of the box.
 */
export function createGas({n = 400, width = 24, height = 14, radius = .16, k = 4000, dt = .004} = {}) {
  const x = new Float64Array(n), y = new Float64Array(n), vx = new Float64Array(n), vy = new Float64Array(n);
  const ax = new Float64Array(n), ay = new Float64Array(n);
  const origin = new Uint8Array(n);
  const W = Math.round(width / UNIT), H = Math.round(height / UNIT), R = radius / UNIT;
  const sigma = 2 * radius, kick = k * dt * dt / UNIT;
  const cellSize = Math.ceil(sigma / UNIT), cols = Math.ceil(W / cellSize), rows = Math.ceil(H / cellSize);
  const head = new Int32Array(cols * rows), next = new Int32Array(n);

  /** Integer accelerations × dt² at step `index`. Pair kicks are rounded once and applied equally and oppositely. */
  function accelerate(index) {
    ax.fill(0);
    ay.fill(0);
    head.fill(-1);
    for (let i = 0; i < n; i++) {
      const cx = Math.min(cols - 1, Math.max(0, Math.floor(x[i] / cellSize)));
      const cy = Math.min(rows - 1, Math.max(0, Math.floor(y[i] / cellSize)));
      const c = cy * cols + cx;
      next[i] = head[c];
      head[c] = i;
    }
    for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) {
      for (let i = head[cy * cols + cx]; i >= 0; i = next[i]) {
        // Visit this cell (pairs after i) and four of the eight neighbours, so each pair is seen once.
        for (const [ox, oy] of NEIGHBOURS) {
          const nx = cx + ox, ny = cy + oy;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          for (let j = ox === 0 && oy === 0 ? next[i] : head[ny * cols + nx]; j >= 0; j = next[j]) {
            const dx = (x[i] - x[j]) * UNIT, dy = (y[i] - y[j]) * UNIT, r2 = dx * dx + dy * dy;
            if (r2 >= sigma * sigma || r2 === 0) continue;
            const r = Math.sqrt(r2), s = (sigma - r) / r * kick;
            const kx = Math.round(s * dx), ky = Math.round(s * dy);
            ax[i] += kx; ay[i] += ky; ax[j] -= kx; ay[j] -= ky;
          }
        }
      }
    }
    const wall = kick * UNIT;
    // Inner walls stand for a range of step indices, so the whole history (walls included) runs backwards exactly.
    const active = gas.walls.filter(w => index >= w.from && index < w.until).map(w => ({
      x: Math.round(w.x / UNIT), gap: w.gap && [Math.round(w.gap[0] / UNIT), Math.round(w.gap[1] / UNIT)],
    }));
    for (let i = 0; i < n; i++) {
      if (x[i] < R) ax[i] += Math.round((R - x[i]) * wall);
      if (x[i] > W - R) ax[i] -= Math.round((x[i] - W + R) * wall);
      if (y[i] < R) ay[i] += Math.round((R - y[i]) * wall);
      if (y[i] > H - R) ay[i] -= Math.round((y[i] - H + R) * wall);
      for (const w of active) {
        if (w.gap && y[i] > w.gap[0] && y[i] < w.gap[1]) continue;
        if (x[i] < w.x && x[i] > w.x - R) ax[i] -= Math.round((x[i] - w.x + R) * wall);
        else if (x[i] >= w.x && x[i] < w.x + R) ax[i] += Math.round((w.x + R - x[i]) * wall);
      }
    }
  }

  const gas = {
    n, width, height, radius, k, dt, x, y, vx, vy, origin,
    /** Step counter; it counts down while time runs backwards. */
    index: 0,
    direction: 1,
    /** Inner walls: {x, from, until (step indices), gap: [y0, y1] or null}. */
    walls: [],
    /** The middle wall of the classic experiments stands until this step index. */
    get partitionUntil() { return gas.walls.find(w => w.middle)?.until ?? -Infinity; },
    set partitionUntil(index) {
      const w = gas.walls.find(v => v.middle);
      if (w) w.until = index; else gas.walls.push({x: width / 2, from: -Infinity, until: index, gap: null, middle: true});
    },
    get t() { return gas.index * dt; },
    get partitioned() { return gas.walls.some(w => gas.index >= w.from && gas.index < w.until); },
    /** Copies of the whole state, so a recording can be replayed (this is a recording, not physics). */
    save() { return {x: x.slice(), y: y.slice(), vx: vx.slice(), vy: vy.slice(), index: gas.index, direction: gas.direction, walls: gas.walls.map(w => ({...w}))}; },
    load(st) { x.set(st.x); y.set(st.y); vx.set(st.vx); vy.set(st.vy); gas.index = st.index; gas.direction = st.direction; gas.walls = st.walls.map(w => ({...w})); gas.refresh(); },
    step(count = 1) {
      for (let s = 0; s < count; s++) {
        accelerate(gas.index);
        for (let i = 0; i < n; i++) {
          vx[i] += ax[i]; vy[i] += ay[i];
          x[i] += vx[i]; y[i] += vy[i];
        }
        gas.index += gas.direction;
      }
    },
    /**
     * Flips every velocity so the next steps retrace the last ones exactly. `nudge` first moves atom `atom`
     * sideways by that many integer units, which spoils the retracing.
     */
    reverse(nudge = 0, atom = 0) {
      if (nudge) x[atom] += nudge;
      accelerate(gas.index);
      for (let i = 0; i < n; i++) { vx[i] = -vx[i] - ax[i]; vy[i] = -vy[i] - ay[i]; }
      gas.direction = -gas.direction;
    },
    /** World-unit velocity of atom i (centred at the current positions). */
    velocity(i) { return [(vx[i] + ax[i] / 2) * UNIT / dt, (vy[i] + ay[i] / 2) * UNIT / dt]; },
    /** Refreshes the accelerations at the current positions, so velocity() is centred. */
    refresh() { accelerate(gas.index); },
    position(i) { return [x[i] * UNIT, y[i] * UNIT]; },
    /** Total energy: kinetic (centred velocities) plus the spring energy of overlaps. */
    energy() {
      gas.refresh();
      let kinetic = 0, potential = 0;
      for (let i = 0; i < n; i++) { const [u, v] = gas.velocity(i); kinetic += (u * u + v * v) / 2; }
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        const r = Math.hypot(x[i] - x[j], y[i] - y[j]) * UNIT;
        if (r < sigma) potential += k * (sigma - r) ** 2 / 2;
      }
      for (let i = 0; i < n; i++) {
        const px = x[i] * UNIT, py = y[i] * UNIT;
        for (const d of [px, width - px, py, height - py]) if (d < radius) potential += k * (radius - d) ** 2 / 2;
      }
      return kinetic + potential;
    },
  };
  return gas;
}
const NEIGHBOURS = [[0, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

function gaussian(rand) {
  return Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
}

/** Puts atoms [from, to) on a jittered lattice inside the rectangle, in random order. */
function place(gas, from, to, [x0, y0, x1, y1], rand) {
  const count = to - from, w = x1 - x0 - 2 * gas.radius, h = y1 - y0 - 2 * gas.radius;
  const cols = Math.ceil(Math.sqrt(count * w / h)), rows = Math.ceil(count / cols);
  const sx = w / cols, sy = h / rows, sites = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) sites.push([c, r]);
  for (let i = sites.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [sites[i], sites[j]] = [sites[j], sites[i]]; }
  const jitter = Math.max(0, Math.min(sx, sy) - 2 * gas.radius) * .45;
  for (let a = 0; a < count; a++) {
    const [c, r] = sites[a], i = from + a;
    gas.x[i] = Math.round((x0 + gas.radius + (c + .5) * sx + (rand() - .5) * 2 * jitter) / UNIT);
    gas.y[i] = Math.round((y0 + gas.radius + (r + .5) * sy + (rand() - .5) * 2 * jitter) / UNIT);
  }
}

/** Velocities for atoms [from, to): random (Maxwell–Boltzmann) at temperature kT, or one fixed `speed`. */
function launch(gas, from, to, {kT = 1, speed = null}, rand) {
  const u = [], v = [];
  for (let i = from; i < to; i++) {
    if (speed != null) { const a = 2 * Math.PI * rand(); u.push(speed * Math.cos(a)); v.push(speed * Math.sin(a)); }
    else { u.push(gaussian(rand) * Math.sqrt(kT)); v.push(gaussian(rand) * Math.sqrt(kT)); }
  }
  if (speed == null) {
    // No overall drift, and exactly the requested temperature.
    const mu = u.reduce((s, a) => s + a, 0) / u.length, mv = v.reduce((s, a) => s + a, 0) / v.length;
    let e = 0;
    for (let a = 0; a < u.length; a++) { u[a] -= mu; v[a] -= mv; e += (u[a] ** 2 + v[a] ** 2) / 2; }
    const f = Math.sqrt(kT * u.length / e);
    for (let a = 0; a < u.length; a++) { u[a] *= f; v[a] *= f; }
  }
  for (let a = 0; a < u.length; a++) {
    gas.vx[from + a] = Math.round(u[a] * gas.dt / UNIT);
    gas.vy[from + a] = Math.round(v[a] * gas.dt / UNIT);
  }
}

export const LIFT_TIME = 1;      // the middle wall lifts at t = 1
export const HOT = 2, COLD = .25; // temperatures (kT) of the two sides in the heat experiment

/**
 * A ready experiment:
 *  'spread'  all atoms in the left half, the wall lifts at t = 1;
 *  'speeds'  atoms everywhere, all moving at the same speed in random directions;
 *  'heat'    hot atoms on the left, cold on the right, the wall lifts at t = 1.
 * Confined gases are allowed to settle first (before t = 0), so the start looks like a gas, not a lattice.
 */
export function experiment(kind, {n = 400, seed = 1, kT = 1, width = 24, height = 14, radius = .16} = {}) {
  const gas = createGas({n, width, height, radius});
  const rand = random(seed), half = width / 2;
  if (kind === 'spread') {
    place(gas, 0, n, [0, 0, half, height], rand);
    launch(gas, 0, n, {kT}, rand);
  } else if (kind === 'heat') {
    const left = n >> 1;
    place(gas, 0, left, [0, 0, half, height], rand);
    place(gas, left, n, [half, 0, width, height], rand);
    launch(gas, 0, left, {kT: HOT}, rand);
    launch(gas, left, n, {kT: COLD}, rand);
  } else if (kind === 'even') {
    place(gas, 0, n, [0, 0, width, height], rand);
    launch(gas, 0, n, {kT}, rand);
  } else {
    place(gas, 0, n, [0, 0, width, height], rand);
    launch(gas, 0, n, {speed: Math.sqrt(2 * kT)}, rand);
  }
  for (let i = 0; i < n; i++) gas.origin[i] = gas.x[i] * UNIT < half ? 0 : 1;
  if (kind === 'spread' || kind === 'heat') {
    gas.partitionUntil = Math.round(LIFT_TIME / gas.dt);
    const settle = 500;
    gas.index = -settle;
    gas.step(settle);
  }
  gas.refresh();
  return gas;
}

/** Temperature kT (mean kinetic energy per atom, in 2D) of the atoms whose x lies in [x0, x1). */
export function temperature(gas, x0 = -Infinity, x1 = Infinity) {
  let e = 0, count = 0;
  for (let i = 0; i < gas.n; i++) {
    const px = gas.x[i] * UNIT;
    if (px < x0 || px >= x1) continue;
    const [u, v] = gas.velocity(i);
    e += (u * u + v * v) / 2;
    count++;
  }
  return count ? e / count : 0;
}

/**
 * Coarse-grained entropy per atom, in units of k:
 *   position: −Σ p ln p over a cols × rows grid of cells;
 *   velocity: in each of `strips` vertical strips, −Σ p ln(p / A) over speed rings of area A, weighted by the
 *             strip's share of atoms (this captures hot and cold regions).
 * Both use the Miller–Madow correction for a finite number of atoms. `max` is the equilibrium value
 * ln(cells) + ln(2πe kT), the most the gas can reach at its energy.
 */
export function entropy(gas, {cols = 8, rows = 5, strips = 4} = {}) {
  const {n, width, height} = gas, kT = temperature(gas), w = .25 * Math.sqrt(kT), RINGS = 48;
  const cells = new Float64Array(cols * rows), ring = new Float64Array(strips * RINGS), inStrip = new Float64Array(strips);
  for (let i = 0; i < n; i++) {
    const px = gas.x[i] * UNIT, py = gas.y[i] * UNIT;
    const c = Math.min(cols - 1, Math.max(0, Math.floor(px / width * cols)));
    const r = Math.min(rows - 1, Math.max(0, Math.floor(py / height * rows)));
    cells[r * cols + c]++;
    const s = Math.min(strips - 1, Math.max(0, Math.floor(px / width * strips)));
    const [u, v] = gas.velocity(i), b = Math.min(RINGS - 1, Math.floor(Math.hypot(u, v) / w));
    ring[s * RINGS + b]++;
    inStrip[s]++;
  }
  let position = 0, occupied = 0;
  for (const count of cells) if (count) { const p = count / n; position -= p * Math.log(p); occupied++; }
  position += (occupied - 1) / (2 * n);
  let velocity = 0;
  for (let s = 0; s < strips; s++) {
    if (!inStrip[s]) continue;
    let part = 0, used = 0;
    for (let b = 0; b < RINGS; b++) {
      const count = ring[s * RINGS + b];
      if (!count) continue;
      const p = count / inStrip[s], area = Math.PI * (2 * b + 1) * w * w;
      part -= p * Math.log(p / area);
      used++;
    }
    part += (used - 1) / (2 * inStrip[s]);
    velocity += inStrip[s] / n * part;
  }
  const max = Math.log(cols * rows) + Math.log(2 * Math.PI * Math.E * kT);
  return {position, velocity, total: position + velocity, max, kT};
}

/** Speed probability density of a 2D gas in equilibrium (Maxwell–Boltzmann): f(v) = (v / kT) e^(−v² / 2kT). */
export function maxwell(v, kT) { return v / kT * Math.exp(-v * v / (2 * kT)); }

/** Counts of atom speeds in `bins` equal bins from 0 to vmax (faster atoms go in the last bin). */
export function speedHistogram(gas, bins, vmax, out = new Float64Array(bins)) {
  out.fill(0);
  for (let i = 0; i < gas.n; i++) {
    const [u, v] = gas.velocity(i);
    out[Math.min(bins - 1, Math.floor(Math.hypot(u, v) / vmax * bins))]++;
  }
  return out;
}

/** Fraction of atoms in the left half of the box. */
export function leftFraction(gas) {
  let count = 0;
  const half = gas.width / 2 / UNIT;
  for (let i = 0; i < gas.n; i++) if (gas.x[i] < half) count++;
  return count / gas.n;
}

/**
 * Odds that the gas would return by chance to a state ΔS (per atom, in k) lower: about e^(−N ΔS).
 * Returned as a power of ten, e.g. 120 for "1 in 10^120".
 */
export function oddsExponent(deltaS, n) { return Math.max(0, deltaS) * n / Math.LN10; }
