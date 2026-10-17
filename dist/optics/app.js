// Rays and lenses: exact ray tracing on an optical bench, with pulses that slow down in glass.
import * as THREE from 'three';
import {createStage, spectrumColor} from '../shared/stage.js';
import {$, toast, setPressed, reducedMotion, createStory, bindDialog, positionLabel, bindKeys} from '../shared/shell.js';
import * as op from './physics.js';
import {steps} from './story.js';

const K = .45;                 // world units per centimetre
const RAY_H = .5;              // height of the rays above the bench (mid-glass)
const GLASS_H = 1;             // drawn thickness of the glass
const PULSE_GAP = 3.2;         // optical path between pulses, cm
const RATES = [.5, 1, 2, 4];
const SPEED = 6;               // cm of light-travel per second at 1×
const MONO = new THREE.Color(0xffe2a8);
const SPECTRUM = [410, 450, 490, 530, 570, 610, 660];
const DEG = Math.PI / 180;

const settings = {experiment: 'slab', n: 1.5, rate: 1, param: {slab: 35, refract: 25, fibre: 18, lens: 22, prism: 12}};
const layers = {pulses: true, wavefronts: true, reflections: false, angles: false};
const narrow = () => innerWidth <= 720;
let playing = !reducedMotion, clock = 0, topView = false;

const PARAMS = {
  slab: {name: 'Beam angle', min: 0, max: 60, step: 1, fmt: v => `${v}°`},
  refract: {name: 'Angle in glass', min: 0, max: 80, step: .5, fmt: v => `${v.toFixed(1)}°`},
  fibre: {name: 'Entry angle', min: 0, max: 60, step: 1, fmt: v => `${v}°`},
  lens: {name: 'Object distance', min: 16, max: 40, step: .5, fmt: v => v >= 40 ? 'far away' : `${v.toFixed(1)} cm`},
  prism: {name: 'Beam angle', min: -10, max: 30, step: .5, fmt: v => `${v.toFixed(1)}°`},
};
// Bench region shown for each experiment (cm): centre x, half-width, centre y.
const VIEW = {slab: [0, 24, 0], refract: [0, 19, -3], fibre: [0, 22, 0], lens: [-2, 40, 0], prism: [6, 26, -3]};

// ---------------------------------------------------------------- stage
const stage = createStage({
  canvas: $('scene'), fallback: $('fallback'), bloom: {strength: .35, radius: .4, threshold: .72},
  viewShift: () => {
    if (!narrow()) return [Math.min(150, innerWidth * .1), 20];
    const top = $('story').getBoundingClientRect().bottom;
    const below = [$('readout'), $('transport')].find(el => el.offsetParent);
    return [0, Math.round((top + below.getBoundingClientRect().top) / 2 - innerHeight / 2)];
  },
});
const {scene, camera, controls} = stage;
Object.assign(controls, {minDistance: 6, maxDistance: 120, maxPolarAngle: Math.PI * .46});
const W = (x, y, h = RAY_H) => new THREE.Vector3(x * K, h, -y * K);
const group = {glass: new THREE.Group(), props: new THREE.Group(), rays: new THREE.Group(), angles: new THREE.Group()};
for (const g of Object.values(group)) scene.add(g);

// ---------------------------------------------------------------- the bench
{
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshBasicMaterial({color: 0x070b12}));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -.01;
  scene.add(floor);
  const minor = [], major = [];
  for (let x = -40; x <= 40; x += 2) (x % 10 ? minor : major).push(x * K, 0, 16 * K, x * K, 0, -16 * K);
  for (let y = -16; y <= 16; y += 2) (y % 10 ? minor : major).push(-40 * K, 0, -y * K, 40 * K, 0, -y * K);
  stage.line({color: 0x6f8ca6, width: 1, opacity: .1, segments: true}).set(minor);
  stage.line({color: 0x6f8ca6, width: 1, opacity: .22, segments: true}).set(major);
}

// ---------------------------------------------------------------- glass
const glassMaterial = new THREE.MeshStandardMaterial({color: 0xbfe3ff, transparent: true, opacity: .16, roughness: .05, metalness: .1, depthWrite: false, side: THREE.DoubleSide});
function buildGlass(elements) {
  for (const child of [...group.glass.children]) { group.glass.remove(child); child.geometry?.dispose(); }
  for (const element of elements) {
    const shape = new THREE.Shape(element.outline.map(([x, y]) => new THREE.Vector2(x, y)));
    const geometry = new THREE.ExtrudeGeometry(shape, {depth: GLASS_H, bevelEnabled: false, curveSegments: 1});
    geometry.rotateX(-Math.PI / 2);
    geometry.scale(K, 1, K);
    group.glass.add(new THREE.Mesh(geometry, glassMaterial));
    const ring = [...element.outline, element.outline[0]];
    glassEdges[0].set(ring.flatMap(([x, y]) => W(x, y, 0).toArray()));
    glassEdges[1].set(ring.flatMap(([x, y]) => W(x, y, GLASS_H).toArray()));
  }
}
const glassEdges = [stage.line({color: 0xcfe6ff, width: 1.4, opacity: .35}), stage.line({color: 0xcfe6ff, width: 1.4, opacity: .7})];

// ---------------------------------------------------------------- experiments
let scene2d = null, glassKey = null;    // the traced scene: {elements, rays: [{start, dir, nm}], ...}
function build() {
  const name = settings.experiment, v = settings.param[name], n = settings.n, opts = {nd: n};
  const s = {name, elements: [], rays: [], wavefronts: false};
  if (name === 'slab') {
    s.elements.push(op.slab(-4, 4, -12, 12, opts));
    const d = [Math.cos(v * DEG), Math.sin(v * DEG)], centre = [-4 - 1, -Math.tan(v * DEG) * 1];
    for (let k = -5; k <= 5; k++) {
      const p = [centre[0] - 18 * d[0] - k * 1.3 * d[1], centre[1] - 18 * d[1] + k * 1.3 * d[0]];
      s.rays.push({start: p, dir: d});
    }
    s.wavefronts = true;
  } else if (name === 'refract') {
    // Flat face on top, facing up: the ray comes in from the lower left along a radius, leaves upwards
    // (between the panels) or is reflected down to the right.
    const c = [0, -3], r = 9;
    s.elements.push(op.semicircle(c[0], c[1], r, {...opts, facing: [0, 1]}));
    const d = [Math.sin(v * DEG), Math.cos(v * DEG)];
    s.rays.push({start: [c[0] - 22 * d[0], c[1] - 22 * d[1]], dir: d});
    s.centre = c;
  } else if (name === 'fibre') {
    s.elements.push(op.slab(-18, 18, -.75, .75, opts));
    const d = [Math.cos(v * DEG), Math.sin(v * DEG)];
    s.rays.push({start: [-18 - 3 * d[0], -.3 - 3 * d[1]], dir: d});
  } else if (name === 'lens') {
    const L = op.lens(0, 3.4, 5, 10, -10, opts);
    s.elements.push(L);
    s.lens = L;
    s.focus = op.lensFocus(n, 10, -10, 3.4);
    if (v >= 40) {
      for (let k = -4; k <= 4; k++) s.rays.push({start: [-30, k], dir: [1, 0]});
      s.wavefronts = true;
    } else {
      s.object = {x: -v, h: 2};
      for (let k = -4; k <= 4; k++) {
        const target = [L.surfaceX(0, k * .95), k * .95];
        s.rays.push({start: [-v, 2], dir: [target[0] + v, target[1] - 2]});
      }
    }
  } else if (name === 'prism') {
    // Dense flint glass, as in most demonstration prisms: about 2.6 times the dispersion of crown glass.
    s.elements.push(op.prism(0, -6, 13, 60, {...opts, dispersion: 2.6}));
    const d = [Math.cos(v * DEG), Math.sin(v * DEG)], target = [-3.25, -.37];
    for (const nm of SPECTRUM) s.rays.push({start: [target[0] - 18 * d[0], target[1] - 18 * d[1]], dir: d, nm});
    s.screen = 26;
  }
  for (const ray of s.rays) {
    ray.segments = op.trace(ray.start, ray.dir, s.elements, {nm: ray.nm ?? 587.6, maxLength: name === 'lens' ? 80 : 60, maxEvents: 120});
    // The prism's light stops at the screen.
    if (s.screen) ray.segments = ray.segments.flatMap(g => {
      if (g.a[0] >= s.screen) return [];
      if (g.b[0] <= s.screen) return [g];
      const f = (s.screen - g.a[0]) / (g.b[0] - g.a[0]);
      return [{...g, b: [s.screen, g.a[1] + f * (g.b[1] - g.a[1])], t1: g.t0 + f * (g.t1 - g.t0)}];
    });
    ray.length = Math.max(...ray.segments.filter(g => g.depth === 0).map(g => g.t1));
    ray.color = ray.nm ? spectrumColor(ray.nm, new THREE.Color()) : MONO;
  }
  scene2d = s;
  // The glass only changes shape with the experiment; sliders just re-trace the rays.
  if (glassKey !== name) { buildGlass(s.elements); glassKey = name; }
  buildProps();
  drawRays();
  updateControls();
}

// ---------------------------------------------------------------- rays
const rayLines = stage.line({width: 1.7, segments: true, vertexColors: true, additive: true, parent: group.rays});
function drawRays() {
  const flat = [], colors = [];
  for (const ray of scene2d.rays) for (const g of ray.segments) {
    if (g.depth > 0 && !layers.reflections) continue;
    const k = (g.depth ? .2 + .5 * Math.sqrt(g.weight) : .3 + .25 * g.weight) * (scene2d.name === 'prism' ? 1.6 : 1);
    flat.push(...W(...g.a).toArray(), ...W(...g.b).toArray());
    for (let j = 0; j < 2; j++) colors.push(ray.color.r * k, ray.color.g * k, ray.color.b * k);
  }
  rayLines.set(flat, colors);
}

// Pulses: glowing points travelling along each ray at c/n, a train spaced PULSE_GAP of light-travel apart.
const glowTexture = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d'), g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.2, 'rgba(255,255,255,.85)'); g.addColorStop(.5, 'rgba(255,255,255,.2)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
const MAX_PULSES = 600;
const pulseGeometry = new THREE.BufferGeometry();
pulseGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_PULSES * 3), 3));
pulseGeometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAX_PULSES * 3), 3));
const pulses = new THREE.Points(pulseGeometry, new THREE.PointsMaterial({
  map: glowTexture, size: .5, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
}));
pulses.frustumCulled = false;
group.rays.add(pulses);
const wavefrontLines = stage.line({color: 0x7fb8e8, width: 1.6, opacity: .6, segments: true, parent: group.rays});
const wavefrontLabelAt = new THREE.Vector3();
let wavefrontShown = false;

function updatePulses() {
  const pos = pulseGeometry.attributes.position.array, col = pulseGeometry.attributes.color.array;
  const phase = (clock * SPEED) % PULSE_GAP, rows = [];
  let count = 0;
  for (const ray of scene2d.rays) {
    const row = [];
    for (let k = 0; ; k++) {
      const t = phase + k * PULSE_GAP;
      if (t > ray.length) break;
      const p = op.pointAtTime(ray.segments, t);
      row[k] = p;
      if (!p || count >= MAX_PULSES || !layers.pulses) continue;
      W(...p, RAY_H + .02).toArray(pos, count * 3);
      col[count * 3] = ray.color.r; col[count * 3 + 1] = ray.color.g; col[count * 3 + 2] = ray.color.b;
      count++;
    }
    rows.push(row);
  }
  pulseGeometry.setDrawRange(0, count);
  pulseGeometry.attributes.position.needsUpdate = pulseGeometry.attributes.color.needsUpdate = true;

  // Wavefronts: pulses that left together, joined across neighbouring rays.
  const flat = [];
  wavefrontShown = layers.wavefronts && scene2d.wavefronts;
  if (wavefrontShown) {
    const kMax = Math.max(...rows.map(r => r.length));
    let labelK = -1;
    for (let k = 0; k < kMax; k++) for (let r = 0; r < rows.length - 1; r++) {
      const a = rows[r][k], b = rows[r + 1][k];
      if (!a || !b) continue;
      flat.push(...W(...a, RAY_H + .03).toArray(), ...W(...b, RAY_H + .03).toArray());
      if (r === rows.length - 2 && labelK < 0 && a[0] > -2) { labelK = k; wavefrontLabelAt.copy(W(...b, RAY_H + .3)); }
    }
  }
  wavefrontLines.set(flat);
}

// ---------------------------------------------------------------- props: normals, angles, object and image, screen
const normalLine = stage.line({color: 0xc9b8ff, width: 1.4, opacity: .7, dashed: true, dash: [.2, .14], parent: group.angles});
const angleArcs = stage.line({color: 0xc9b8ff, width: 1.6, opacity: .9, segments: true, parent: group.angles});
const objectArrow = stage.line({color: 0xffe2a8, width: 3, segments: true, parent: group.props});
const imageArrow = stage.line({color: 0x9fd8ff, width: 3, opacity: .9, dashed: true, dash: [.15, .1], segments: true, parent: group.props});
const focusMark = stage.sprite(0xffffff, 1.2, group.props);
const screenLine = stage.line({color: 0xd8e2ea, width: 2.4, opacity: .7, parent: group.props});
const screenDots = stage.line({width: 6, segments: true, vertexColors: true, additive: true, parent: group.props});
const at = {a1: new THREE.Vector3(), a2: new THREE.Vector3(), focus: new THREE.Vector3(), object: new THREE.Vector3(), image: new THREE.Vector3(), glass: new THREE.Vector3(), screen: new THREE.Vector3(), normal: new THREE.Vector3()};
const results = {};

function arcPoints(c, r, a0, a1) {
  const pts = [];
  for (let k = 0; k <= 24; k++) { const a = a0 + (a1 - a0) * k / 24; pts.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]); }
  const flat = [];
  for (let k = 0; k < pts.length - 1; k++) flat.push(...W(...pts[k], RAY_H + .02).toArray(), ...W(...pts[k + 1], RAY_H + .02).toArray());
  return flat;
}

function buildProps() {
  const s = scene2d;
  for (const key of Object.keys(results)) delete results[key];
  normalLine.set([]); angleArcs.set([]); objectArrow.set([]); imageArrow.set([]); screenLine.set([]); screenDots.set([]);
  focusMark.visible = false;
  const main = ray => ray.segments.filter(g => g.depth === 0);
  const dirOf = g => { const d = [g.b[0] - g.a[0], g.b[1] - g.a[1]], l = Math.hypot(...d); return [d[0] / l, d[1] / l]; };
  const low = s.elements[0].outline.reduce((m, p) => p[1] < m[1] ? p : m);
  at.glass.copy(W(low[0], low[1] - 1.2, GLASS_H));
  if (s.name === 'refract') {
    const c = s.centre, segs = main(s.rays[0]);
    normalLine.set([...W(c[0], c[1] - 10.5, RAY_H + .01).toArray(), ...W(c[0], c[1] + 9, RAY_H + .01).toArray()]);
    at.normal.copy(W(c[0] + .3, c[1] + 9.6));
    // Angles are measured from the normal (the y axis here).
    const inside = dirOf(segs[1] ?? segs[0]);
    const theta1 = Math.atan2(Math.abs(inside[0]), Math.abs(inside[1])) / DEG;
    // The ray after the flat face: out into the air (upwards) or reflected back in.
    const after = segs[2] ? dirOf(segs[2]) : null, out = after && after[1] > 0;
    const theta2 = out ? Math.atan2(Math.abs(after[0]), Math.abs(after[1])) / DEG : null;
    const flat = arcPoints(c, 3.2, -Math.PI / 2 - theta1 * DEG, -Math.PI / 2);
    if (out) flat.push(...arcPoints(c, 3.2, Math.PI / 2 - theta2 * DEG, Math.PI / 2));
    angleArcs.set(flat);
    at.a1.copy(W(c[0] - 4.4 * Math.sin(theta1 * DEG / 2), c[1] - 4.4 * Math.cos(theta1 * DEG / 2)));
    if (out) at.a2.copy(W(c[0] + 4.4 * Math.sin(theta2 * DEG / 2), c[1] + 4.4 * Math.cos(theta2 * DEG / 2)));
    const fres = op.interact([Math.sin(theta1 * DEG), Math.cos(theta1 * DEG)], [0, 1], settings.n, 1);
    Object.assign(results, {theta1, theta2, R: fres.R, crit: op.criticalAngle(settings.n)});
  }
  if (s.name === 'slab') {
    const segs = main(s.rays[5]), d0 = dirOf(segs[0]), d1 = segs[1] ? dirOf(segs[1]) : d0;
    Object.assign(results, {theta1: Math.atan2(Math.abs(d0[1]), d0[0]) / DEG, theta2: Math.atan2(Math.abs(d1[1]), d1[0]) / DEG});
  }
  if (s.name === 'fibre') {
    const segs = main(s.rays[0]), inside = segs.filter(g => g.n > 1.01);
    const d = inside[0] ? dirOf(inside[0]) : [1, 0];
    const wall = 90 - Math.atan2(Math.abs(d[1]), Math.abs(d[0])) / DEG;
    const exitX = segs.at(-1).a[0];
    Object.assign(results, {bounces: Math.max(0, inside.length - 1), wall, crit: op.criticalAngle(settings.n), through: exitX > 17.9});
  }
  if (s.name === 'lens') {
    const L = s.lens, back = L.x0 + L.t / 2;
    // Focal point: where a paraxial ray parallel to the axis crosses it.
    const traced = op.axisCrossing(op.trace([-30, .25], [1, 0], s.elements, {reflections: false}), back);
    results.f = s.focus.f; results.focusX = traced;
    if (traced) { focusMark.visible = true; focusMark.position.copy(W(traced, 0)); at.focus.copy(W(traced, 0, RAY_H + .2)); }
    if (s.object) {
      const {x, h} = s.object;
      objectArrow.set([...W(x, 0).toArray(), ...W(x, h).toArray(), ...W(x, h).toArray(), ...W(x - .5, h - .8).toArray(), ...W(x, h).toArray(), ...W(x + .5, h - .8).toArray()]);
      at.object.copy(W(x, -1.2));
      // Image: the point nearest to all the exit rays (least squares), using the inner rays.
      let a11 = 0, a12 = 0, a22 = 0, b1 = 0, b2 = 0;
      // The near-axis rays, as the lens formula assumes; the outer rays cross shorter (spherical aberration).
      for (const ray of s.rays.slice(3, 6)) {
        const last = main(ray).at(-1), d = dirOf(last), p = last.a, nx = -d[1], ny = d[0], c = nx * p[0] + ny * p[1];
        a11 += nx * nx; a12 += nx * ny; a22 += ny * ny; b1 += nx * c; b2 += ny * c;
      }
      const det = a11 * a22 - a12 * a12, ix = (b1 * a22 - b2 * a12) / det, iy = (a11 * b2 - a12 * b1) / det;
      if (Number.isFinite(ix) && ix > back) {
        imageArrow.set([...W(ix, 0).toArray(), ...W(ix, iy).toArray(), ...W(ix, iy).toArray(), ...W(ix - .5, iy + .8).toArray(), ...W(ix, iy).toArray(), ...W(ix + .5, iy + .8).toArray()]);
        at.image.copy(W(ix, iy - 1.2));
        // Lens formula with u and v measured from the principal planes H and H′ of the thick lens.
        const H = L.x0 - L.t / 2 + s.focus.H, H2 = L.x0 + L.t / 2 + s.focus.H2;
        const vPredicted = H2 + 1 / (1 / s.focus.f - 1 / (H - x));
        Object.assign(results, {u: -x, v: ix, m: iy / h, vPredicted});
      }
    }
  }
  if (s.name === 'prism') {
    const X = s.screen;
    screenLine.set([...W(X, -18, .02).toArray(), ...W(X, -4, .02).toArray()]);
    at.screen.copy(W(X, -19.2));
    const flat = [], colors = [];
    const deviations = {};
    for (const ray of s.rays) {
      const segs = main(ray), last = segs.at(-1), d = dirOf(last);
      deviations[ray.nm] = (Math.atan2(ray.dir[1], ray.dir[0]) - Math.atan2(d[1], d[0])) / DEG;
      if (d[0] <= 0) continue;
      const y = last.a[1] + (X - last.a[0]) * d[1] / d[0];
      if (Math.abs(y) > 14) continue;
      flat.push(...W(X, y - .35, .05).toArray(), ...W(X, y + .35, .05).toArray());
      for (let j = 0; j < 2; j++) colors.push(ray.color.r, ray.color.g, ray.color.b);
    }
    screenDots.set(flat, colors);
    Object.assign(results, {red: deviations[660], violet: deviations[410]});
  }
}

// ---------------------------------------------------------------- readout and labels
const fmt = (x, d = 1) => x.toFixed(d);
function setRow(i, name, note, value) {
  $(`r${i}-name`).textContent = name;
  $(`r${i}-note`).textContent = note;
  $(`r${i}`).textContent = value;
}
function updateReadout() {
  const n = settings.n, r = results;
  switch (scene2d.name) {
    case 'slab':
      setRow(1, 'Speed in the glass', `c / n, with c = ${Math.round(op.C_KM_S).toLocaleString('en-GB')} km/s`, `${Math.round(op.C_KM_S / n).toLocaleString('en-GB')} km/s`);
      setRow(2, 'Angle in air → in glass', 'from the normal, measured on the traced ray', `${fmt(r.theta1)}° → ${fmt(r.theta2)}°`);
      setRow(3, 'Extra time to cross', 'the 8 cm block, compared with air', `${fmt((n - 1) * .08 / op.C_KM_S * 1e9, 0)} ps`);
      break;
    case 'refract':
      setRow(1, 'Angle in the glass θ₁', `n₁ sin θ₁ = ${(n * Math.sin(r.theta1 * DEG)).toFixed(3)}`, `${fmt(r.theta1)}°`);
      setRow(2, 'Angle in the air θ₂', r.theta2 == null ? 'beyond the critical angle: no ray gets out' : `n₂ sin θ₂ = ${Math.sin(r.theta2 * DEG).toFixed(3)}`, r.theta2 == null ? 'none' : `${fmt(r.theta2)}°`);
      setRow(3, 'Reflected back', `critical angle ${fmt(r.crit)}° for n = ${n.toFixed(2)}`, r.theta2 == null ? '100% (total)' : `${fmt(r.R * 100)}%`);
      break;
    case 'fibre':
      setRow(1, 'Angle at the wall', `trapped while above the critical angle, ${fmt(r.crit)}°`, `${fmt(r.wall)}°`);
      setRow(2, 'Bounces', r.through ? 'every one a total internal reflection' : 'the light escapes through the wall', `${r.bounces}`);
      setRow(3, 'Light delivered', 'to the far end, ignoring absorption', r.through && r.wall > r.crit ? '100%' : 'leaks out');
      break;
    case 'lens':
      setRow(1, 'Focal length f', `lensmaker’s equation; traced focus at ${r.focusX ? fmt(r.focusX) : '–'} cm`, `${fmt(r.f)} cm`);
      if (r.u != null) {
        setRow(2, 'Object distance u', 'from the lens centre', `${fmt(r.u)} cm`);
        setRow(3, 'Image distance v', `where the traced rays cross; an ideal lens would give ${fmt(r.vPredicted)} cm (real spherical lenses focus a little short) · magnification ${fmt(r.m, 2)}`, `${fmt(r.v)} cm`);
      } else {
        setRow(2, 'Object', 'so far away that its rays arrive parallel', 'far away');
        setRow(3, 'Image', 'at the focus', r.focusX ? `${fmt(r.focusX)} cm` : '–');
      }
      break;
    case 'prism':
      setRow(1, 'Red light bent by', '660 nm', `${fmt(r.red)}°`);
      setRow(2, 'Violet light bent by', '410 nm', `${fmt(r.violet)}°`);
      setRow(3, 'Spread of the spectrum', 'dense flint glass, made to disperse strongly', `${fmt(r.violet - r.red, 2)}°`);
      break;
  }
}

function updateLabels() {
  const rects = [$('story'), $('panel'), $('readout'), $('transport')].filter(el => el.offsetParent).map(el => el.getBoundingClientRect());
  const pin = (id, p, show) => positionLabel($(id), p, camera, {show, avoid: rects});
  const name = scene2d.name, r = results;
  $('label-glass-text').textContent = `${name === 'prism' ? 'Flint glass' : 'Glass'} · n = ${settings.n.toFixed(2)}`;
  // On phones the lens's own labels need the room.
  pin('label-glass', at.glass, name !== 'fibre' && !(narrow() && name === 'lens'));
  pin('label-normal', at.normal, name === 'refract' && layers.angles);
  $('label-a1-text').textContent = r.theta1 != null ? `θ₁ ${fmt(r.theta1)}°` : '';
  $('label-a2-text').textContent = r.theta2 != null ? `θ₂ ${fmt(r.theta2)}°` : '';
  pin('label-a1', at.a1, name === 'refract' && layers.angles);
  pin('label-a2', at.a2, name === 'refract' && layers.angles && r.theta2 != null);
  pin('label-focus', at.focus, name === 'lens' && !!r.focusX);
  pin('label-object', at.object, name === 'lens' && r.u != null);
  $('label-image-text').textContent = 'Image · real, upside down';
  pin('label-image', at.image, name === 'lens' && r.v != null);
  pin('label-screen', at.screen, name === 'prism');
  pin('label-wavefront', wavefrontLabelAt, wavefrontShown);
}

// ---------------------------------------------------------------- camera
const offset = new THREE.Vector3(), target = new THREE.Vector3();
let offsetTween = null;
function framing() {
  const [cx, half, cy] = VIEW[settings.experiment];
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect;
  const dist = half * K / tanHalf * (narrow() ? 1.12 : 1.5);
  target.set(cx * K, 0, -cy * K);
  return topView ? new THREE.Vector3(0, dist * .95, .01) : new THREE.Vector3(0, dist * .78, dist * .62);
}
function setFraming(animate = true) {
  const to = framing();
  if (animate && !reducedMotion) offsetTween = {from: offset.clone(), to, u: 0};
  else { offset.copy(to); offsetTween = null; }
}
controls.addEventListener('start', () => { offsetTween = null; });

// ---------------------------------------------------------------- controls
const ICON_PLAY = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9.5-5.5z" fill="currentColor"/></svg>';
const ICON_PAUSE = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 2.5h3v11h-3zM9.5 2.5h3v11h-3z" fill="currentColor"/></svg>';
function setPlaying(on) {
  playing = on;
  $('play').innerHTML = on ? ICON_PAUSE : ICON_PLAY;
  $('play').setAttribute('aria-label', on ? 'Pause' : 'Play');
}
function applyLayers(next) {
  if (next) for (const key of Object.keys(layers)) layers[key] = !!next[key];
  group.angles.visible = layers.angles;
  for (const chip of document.querySelectorAll('.chip')) setPressed(chip, layers[chip.dataset.layer]);
  if (scene2d) drawRays();
}
function updateControls() {
  const name = settings.experiment, p = PARAMS[name], v = settings.param[name], input = $('param');
  for (const b of document.querySelectorAll('[data-experiment]')) setPressed(b, b.dataset.experiment === name);
  Object.assign(input, {min: p.min, max: p.max, step: p.step});
  input.value = v;
  input.style.setProperty('--progress', `${(v - p.min) / (p.max - p.min) * 100}%`);
  $('param-name').textContent = p.name;
  $('out-param').textContent = p.fmt(v);
  $('out-n').textContent = settings.n.toFixed(2);
  $('index').value = settings.n;
  $('index').style.setProperty('--progress', `${(settings.n - 1.3) / 1.12 * 100}%`);
  $('out-rate').textContent = `${RATES[settings.rate]}×`;
  $('rate').value = settings.rate;
  $('rate').style.setProperty('--progress', `${settings.rate / 3 * 100}%`);
}
function chooseExperiment(name) {
  settings.experiment = name;
  build();
  setFraming();
}
function setView(top, animate = true) {
  topView = top;
  setPressed($('view-bench'), !top);
  setPressed($('view-top'), top);
  setFraming(animate);
}

$('play').onclick = () => setPlaying(!playing);
$('view-bench').onclick = () => setView(false);
$('view-top').onclick = () => setView(true);
$('reset-camera').onclick = () => setFraming();
for (const b of document.querySelectorAll('[data-experiment]')) b.onclick = () => chooseExperiment(b.dataset.experiment);
for (const chip of document.querySelectorAll('.chip')) chip.onclick = () => { layers[chip.dataset.layer] = !layers[chip.dataset.layer]; applyLayers(); };
// Every change is re-traced at once: the rays are exact, so there is nothing to wait for.
$('param').addEventListener('input', e => { settings.param[settings.experiment] = +e.target.value; build(); });
$('index').addEventListener('input', e => { settings.n = +e.target.value; build(); });
$('rate').addEventListener('input', e => { settings.rate = +e.target.value; updateControls(); });
function showPanel(open) {
  $('panel').classList.toggle('sheet-closed', !open);
  $('panel-toggle').setAttribute('aria-expanded', String(open));
}
$('panel-toggle').onclick = () => showPanel($('panel').classList.contains('sheet-closed'));
bindDialog($('notes'), $('about'), () => setPlaying(false));
stage.onContextLost = () => setPlaying(false);
const toggleView = () => setView(!topView);
bindKeys({
  ' ': () => setPlaying(!playing),
  1: () => chooseExperiment('slab'), 2: () => chooseExperiment('refract'), 3: () => chooseExperiment('fibre'),
  4: () => chooseExperiment('lens'), 5: () => chooseExperiment('prism'),
  t: toggleView, T: toggleView,
});

const story = createStory({
  steps,
  onEnter(step, index) {
    settings.experiment = step.experiment;
    if (step.param != null) settings.param[step.experiment] = step.param;
    if (index === 0) settings.n = 1.5;
    applyLayers(step.layers);
    build();
    showPanel(index === steps.length - 1 && !narrow());
    topView = false;
    setPressed($('view-bench'), true);
    setPressed($('view-top'), false);
    setFraming();
    setPlaying(!reducedMotion);
  },
});

offset.copy(framing());
camera.position.copy(target).add(offset);
controls.target.copy(target);
controls.update();
story.show(0);
new ResizeObserver(() => stage.resize()).observe($('story'));
new ResizeObserver(() => stage.resize()).observe($('readout'));
new ResizeObserver(() => {
  document.documentElement.style.setProperty('--dock-h', `${$('transport').offsetHeight}px`);
  stage.resize();
}).observe($('transport'));

let lastFrame = performance.now();
function frame(time) {
  requestAnimationFrame(frame);
  const dt = Math.max(0, Math.min((time - lastFrame) / 1000, .08));
  lastFrame = time;
  if (playing && !document.hidden) clock += dt * RATES[settings.rate];
  updatePulses();

  controls.update();
  offset.copy(camera.position).sub(controls.target);
  if (offsetTween) {
    offsetTween.u = Math.min(1, offsetTween.u + dt / 1.2);
    const k = offsetTween.u < .5 ? 2 * offsetTween.u ** 2 : 1 - (-2 * offsetTween.u + 2) ** 2 / 2;
    offset.lerpVectors(offsetTween.from, offsetTween.to, k);
    if (offsetTween.u === 1) offsetTween = null;
  }
  controls.target.copy(target);
  camera.position.copy(target).add(offset);
  stage.setFogFor(offset.length() * 1.4);

  updateReadout();
  updateLabels();
  stage.render();
}
setPlaying(playing);
requestAnimationFrame(frame);

// With ?debug in the URL, expose hooks for checks.
if (new URLSearchParams(location.search).has('debug')) {
  window.__optics = {settings, story, results, get scene() { return scene2d; }, build, snap() { if (offsetTween) offsetTween.u = .999; }, advance(s) { clock += s; }};
}
