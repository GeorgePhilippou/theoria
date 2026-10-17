// Rays and lenses: exact 2D ray tracing through glass, with Snell's law, Fresnel reflection and dispersion.
//
// Lengths are in centimetres on a bench; x runs along the optical axis, y across it. An element is a closed
// boundary made of straight pieces and circular arcs (exact normals, no faceting), filled with glass.
// Elements must not overlap; outside every element is air (n = 1).

export const C_KM_S = 299792.458;

/**
 * Refractive index of glass at wavelength λ (nm), from a two-term Cauchy formula fixed by its index n_d at the
 * helium d line (587.6 nm). `dispersion` scales the λ-dependence: 1 is a crown glass like BK7 (Abbe number ≈ 64).
 */
export function glassIndex(nd, nm = 587.6, dispersion = 1) {
  const B = .0042 * dispersion, um = nm / 1000;
  return nd + B * (1 / (um * um) - 1 / (.5876 * .5876));
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const norm = a => { const l = Math.hypot(a[0], a[1]); return [a[0] / l, a[1] / l]; };

/** A straight boundary piece from a to b. */
export const line = (a, b) => ({type: 'line', a, b});
/** A circular arc (centre, radius), the part whose points satisfy `keep(point)`. */
export const arc = (centre, r, keep) => ({type: 'arc', centre, r, keep});

/** Smallest positive distance s along the ray p + s·d to the piece, with the outward-agnostic normal there. */
function hitPiece(p, d, piece) {
  if (piece.type === 'line') {
    const e = sub(piece.b, piece.a), den = d[0] * e[1] - d[1] * e[0];
    if (Math.abs(den) < 1e-12) return null;
    const w = sub(piece.a, p), s = (w[0] * e[1] - w[1] * e[0]) / den, u = (w[0] * d[1] - w[1] * d[0]) / den;
    if (s <= 1e-7 || u < -1e-9 || u > 1 + 1e-9) return null;
    return {s, normal: norm([-e[1], e[0]])};
  }
  const w = sub(p, piece.centre), b = dot(w, d), c = dot(w, w) - piece.r * piece.r, disc = b * b - c;
  if (disc < 0) return null;
  const root = Math.sqrt(disc);
  for (const s of [-b - root, -b + root]) {
    if (s <= 1e-7) continue;
    const q = [p[0] + s * d[0], p[1] + s * d[1]];
    if (piece.keep(q)) return {s, normal: norm(sub(q, piece.centre))};
  }
  return null;
}

/** Nearest boundary hit among all elements. */
function nearestHit(p, d, elements) {
  let best = null;
  for (const element of elements) for (const piece of element.pieces) {
    const h = hitPiece(p, d, piece);
    if (h && (!best || h.s < best.s)) best = {...h, element};
  }
  return best;
}

/**
 * Refraction (vector Snell's law) and reflection at a boundary. `normal` may point either way.
 * Returns {reflected, transmitted (null for total internal reflection), R (Fresnel reflectance, unpolarised), cosI, cosT}.
 */
export function interact(d, normal, n1, n2) {
  let nrm = normal;
  if (dot(d, nrm) > 0) nrm = [-nrm[0], -nrm[1]];
  const cosI = -dot(d, nrm), eta = n1 / n2, k = 1 - eta * eta * (1 - cosI * cosI);
  const reflected = [d[0] + 2 * cosI * nrm[0], d[1] + 2 * cosI * nrm[1]];
  if (k < 0) return {reflected, transmitted: null, R: 1, cosI, cosT: 0};
  const cosT = Math.sqrt(k);
  const transmitted = norm([eta * d[0] + (eta * cosI - cosT) * nrm[0], eta * d[1] + (eta * cosI - cosT) * nrm[1]]);
  const rs = ((n1 * cosI - n2 * cosT) / (n1 * cosI + n2 * cosT)) ** 2;
  const rp = ((n1 * cosT - n2 * cosI) / (n1 * cosT + n2 * cosI)) ** 2;
  return {reflected, transmitted, R: (rs + rp) / 2, cosI, cosT};
}

/**
 * Traces a ray (start point, direction, wavelength in nm) through the elements.
 * Returns a list of segments {a, b, n, weight, t0, t1, depth}: t is the travel time in units of (cm / c),
 * that is optical path length, so a pulse sits where t = c·time. Partial reflections are followed while their
 * weight stays above `minWeight`; the main (transmitted or totally reflected) path is always followed.
 */
export function trace(start, direction, elements, {nm = 587.6, maxLength = 200, maxEvents = 40, minWeight = .03, reflections = true} = {}) {
  const segments = [];
  const queue = [{p: start, d: norm(direction), inside: null, weight: 1, t: 0, depth: 0, travelled: 0}];
  let events = 0;
  while (queue.length && events < maxEvents * 4) {
    const ray = queue.shift();
    let {p, d, inside, weight, t, depth, travelled} = ray;
    for (let step = 0; step < maxEvents; step++) {
      events++;
      const n1 = inside ? inside.index(nm) : 1;
      const hit = nearestHit(p, d, inside ? [inside] : elements);
      const s = hit ? hit.s : maxLength - travelled;
      if (s <= 0) break;
      const end = [p[0] + s * d[0], p[1] + s * d[1]];
      segments.push({a: p, b: end, n: n1, weight, t0: t, t1: t + n1 * s, depth});
      t += n1 * s;
      travelled += s;
      if (!hit || travelled >= maxLength) break;
      if (hit.element.mirror) { d = interact(d, hit.normal, 1, 1).reflected; p = end; continue; }
      const next = inside ? null : hit.element;
      const n2 = next ? next.index(nm) : 1, out = interact(d, hit.normal, n1, n2);
      if (out.transmitted) {
        if (reflections && weight * out.R >= minWeight && depth < 3) {
          queue.push({p: end, d: out.reflected, inside, weight: weight * out.R, t, depth: depth + 1, travelled});
        }
        d = out.transmitted; inside = next; weight *= 1 - out.R;
      } else d = out.reflected;   // total internal reflection: all the light stays inside
      p = end;
    }
  }
  return segments;
}

/** Point along a traced path (main branch, depth 0) where the travel time equals t, or null. */
export function pointAtTime(segments, t) {
  for (const s of segments) {
    if (s.depth !== 0 || t < s.t0 || t > s.t1) continue;
    const f = (t - s.t0) / (s.t1 - s.t0 || 1);
    return [s.a[0] + f * (s.b[0] - s.a[0]), s.a[1] + f * (s.b[1] - s.a[1])];
  }
  return null;
}

// ---------------------------------------------------------------- elements

function glass(pieces, {nd = 1.5, dispersion = 1, name}) {
  return {name, pieces, nd, dispersion, index: nm => glassIndex(nd, nm, dispersion)};
}

/** A rectangular block from x0 to x1, y0 to y1. */
export function slab(x0, x1, y0, y1, options = {}) {
  const c = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  return Object.assign(glass([0, 1, 2, 3].map(i => line(c[i], c[(i + 1) % 4])), {name: 'slab', ...options}), {outline: c});
}

/** A triangular prism with apex angle A (degrees), base on y = y0, apex above x = xc, side length L. */
export function prism(xc, y0, L, A, options = {}) {
  const half = A * Math.PI / 360, h = L * Math.cos(half), w = L * Math.sin(half);
  const apex = [xc, y0 + h], left = [xc - w, y0], right = [xc + w, y0];
  return Object.assign(glass([line(left, apex), line(apex, right), line(right, left)], {name: 'prism', ...options}), {outline: [left, right, apex]});
}

/**
 * A semicircular block centred at (x0, y0): its flat face passes through the centre, with outward normal `facing`
 * (default [−1, 0]: flat face on the left, round face to the right).
 */
export function semicircle(x0, y0, r, {facing = [-1, 0], ...options} = {}) {
  const [fx, fy] = norm(facing), along = [-fy, fx];
  const ends = [[x0 + r * along[0], y0 + r * along[1]], [x0 - r * along[0], y0 - r * along[1]]];
  const back = Math.atan2(-fy, -fx);
  const outline = [ends[1], ...Array.from({length: 97}, (_, k) => {
    const a = back - Math.PI / 2 + Math.PI * k / 96;
    return [x0 + r * Math.cos(a), y0 + r * Math.sin(a)];
  })];
  const keep = q => (q[0] - x0) * -fx + (q[1] - y0) * -fy >= -1e-9;
  return Object.assign(glass([line(ends[0], ends[1]), arc([x0, y0], r, keep)], {name: 'semicircle', ...options}), {outline, centre: [x0, y0], r, facing: [fx, fy]});
}

/**
 * A lens centred at x0 on the axis, centre thickness t, half-aperture h, surface radii R1 (front) and R2 (back),
 * in the usual sign convention: a radius is positive when its centre lies to the right of the surface.
 * Biconvex: R1 > 0, R2 < 0. Biconcave: R1 < 0, R2 > 0. Infinity gives a flat face.
 */
export function lens(x0, t, h, R1, R2, options = {}) {
  const v1 = x0 - t / 2, v2 = x0 + t / 2;
  const surfaceX = (v, R, y) => !Number.isFinite(R) ? v : v + R - Math.sign(R) * Math.sqrt(R * R - y * y);
  const face = (v, R) => {
    if (!Number.isFinite(R)) return line([v, -h], [v, h]);
    const c = [v + R, 0], dir = -Math.sign(R);
    return arc(c, Math.abs(R), q => Math.abs(q[1]) <= h + 1e-9 && (q[0] - c[0]) * dir >= 0);
  };
  const e1 = surfaceX(v1, R1, h), e2 = surfaceX(v2, R2, h);
  const pieces = [face(v1, R1), face(v2, R2)];
  if (e2 - e1 > 1e-6) pieces.push(line([e1, h], [e2, h]), line([e1, -h], [e2, -h]));
  const element = glass(pieces, {name: 'lens', ...options});
  // Outline, anticlockwise: down the back face, then up the front face.
  const outline = [];
  for (let k = 0; k <= 48; k++) { const y = h - 2 * h * k / 48; outline.push([surfaceX(v2, R2, y), y]); }
  for (let k = 0; k <= 48; k++) { const y = -h + 2 * h * k / 48; outline.push([surfaceX(v1, R1, y), y]); }
  Object.assign(element, {x0, t, h, R1, R2, outline, edge: [e1, e2], surfaceX: (side, y) => side === 0 ? surfaceX(v1, R1, y) : surfaceX(v2, R2, y)});
  return element;
}

/**
 * Thick-lens focal length, front and back focal distances (from the vertices) and principal planes, from the lensmaker's equation.
 * f: 1/f = (n − 1)[1/R1 − 1/R2 + (n − 1) t / (n R1 R2)].
 */
export function lensFocus(n, R1, R2, t) {
  const inv = x => Number.isFinite(x) ? 1 / x : 0;
  const power = (n - 1) * (inv(R1) - inv(R2) + (n - 1) * t * inv(R1) * inv(R2) / n);
  const f = 1 / power, back = f * (1 - (n - 1) * t * inv(R1) / n), front = f * (1 + (n - 1) * t * inv(R2) / n);
  // Principal planes, as offsets from the front and back vertices: thin-lens formulas hold if u is measured from H
  // and v from H′.
  return {f, back, front, H: f - front, H2: back - f};
}

/** Where a ray (segments) crosses the axis y = 0 after x > xFrom, or null. */
export function axisCrossing(segments, xFrom) {
  for (const s of segments) {
    if (s.depth !== 0) continue;
    const [ax, ay] = s.a, [bx, by] = s.b;
    if (bx <= xFrom || ay * by > 0 || ay === by) continue;
    const f = ay / (ay - by), x = ax + f * (bx - ax);
    if (x > xFrom) return x;
  }
  return null;
}

/** Critical angle (degrees) for light going from glass of index n into air. */
export const criticalAngle = n => Math.asin(1 / n) * 180 / Math.PI;
