// Light as a wave: a live Maxwell solver drawn as a glowing surface whose height is the electric field.
import * as THREE from 'three';
import {createStage} from '../shared/stage.js';
import {$, toast, setPressed, reducedMotion, createStory, bindDialog, positionLabel, bindKeys, showTip} from '../shared/shell.js';
import * as em from './physics.js';
import {steps} from './story.js';

const N = 220;             // grid cells per side
const BORDER = 24;         // absorbing border, hidden
const CELL = .1;           // world size of one cell
const W = N * CELL;        // world size of the grid
const RAIL = 2.4;          // height of the arrow rail above the surface
const ARROWS = 26;         // number of E/B arrow pairs
const COLOR = {e: 0xffc56b, b: 0x7fe0f0, glass: 0xcfe6ff, metal: 0x2a3440};
const RATES = [.5, 1, 2, 3];
const PARAM = {
  slits: {name: 'Slit gap', min: 24, max: 80, step: 2, key: 'gap', format: v => `${v} cells`},
  lens: {name: 'Glass n', min: 1.2, max: 2.4, step: .05, key: 'n', format: v => v.toFixed(2)},
};

const settings = {experiment: 'antenna', lambda: 20, gap: 44, n: 1.5, rate: 1};
const layers = {arrows: false, intensity: false};
const narrow = () => innerWidth <= 720;
let heightOn = 1, targetHeight = 1, intensityMix = 0, playing = !reducedMotion, stepDebt = 0;

// ---------------------------------------------------------------- stage
const stage = createStage({
  canvas: $('scene'), fallback: $('fallback'), bloom: {strength: .4, radius: .45, threshold: .8},
  viewShift: () => {
    if (!narrow()) return [24, 0];
    const top = $('story').getBoundingClientRect().bottom;
    const below = [$('readout'), $('transport')].find(el => el.offsetParent);
    return [0, Math.round((top + below.getBoundingClientRect().top) / 2 - innerHeight / 2)];
  },
});
const {scene, camera, controls} = stage;
Object.assign(controls, {minDistance: 6, maxDistance: 110, maxPolarAngle: Math.PI * .47});
const group = {base: new THREE.Group(), props: new THREE.Group(), arrows: new THREE.Group(), source: new THREE.Group(), screen: new THREE.Group()};
for (const g of Object.values(group)) scene.add(g);

const cellToWorld = (i, j) => [(i + .5) * CELL - W / 2, (W / 2) - (j + .5) * CELL];
const worldToCell = (x, z) => [(x + W / 2) / CELL - .5, (W / 2 - z) / CELL - .5];

// ---------------------------------------------------------------- simulation
const field = em.createField({nx: N, ny: N, border: BORDER});
const avgI = new Float32Array(N * N);
let scale = 1e-3, iScale = 1e-6, cy = N / 2;
let probe = {i0: 0, i1: 0, j: N / 2};
let lens = null;          // {x0, t, a, R} in cells, when the lens is in place
const WALL = {i: 80, width: 4, slit: 6};

function materialFor(name) {
  if (name === 'slits') {
    const {i, width, slit} = WALL, s1 = cy - settings.gap / 2, s2 = cy + settings.gap / 2;
    return (x, y) => ({metal: x >= i && x < i + width && Math.abs(y - s1) > slit / 2 && Math.abs(y - s2) > slit / 2});
  }
  if (name === 'lens') {
    const {x0, t, R} = lens;
    const c1 = x0 + R - t / 2, c2 = x0 - R + t / 2;
    return (x, y) => ((x - c1) ** 2 + (y - cy) ** 2 <= R * R && (x - c2) ** 2 + (y - cy) ** 2 <= R * R) ? {eps: settings.n ** 2} : null;
  }
  return () => null;
}

function setSources() {
  const omega = em.omegaFor(settings.lambda);
  const pulses = field.sources.filter(s => s.kind === 'pulse');
  field.sources.length = 0;
  if (settings.experiment === 'antenna') field.sources.push(em.pointSource(N / 2, N / 2, {omega, amp: 6}));
  else field.sources.push(em.lineSource(BORDER + 6, {omega, amp: 1}));
  field.sources.push(...pulses);
}

function setupExperiment(restart = true) {
  const name = settings.experiment;
  lens = name === 'lens' ? (() => { const t = 40, a = 50; return {x0: 96, t, a, R: (a * a + t * t / 4) / t}; })() : null;
  if (restart) { field.clear(); avgI.fill(0); field.sources.length = 0; }
  field.setMaterial(materialFor(name));
  setSources();
  const start = {antenna: N / 2 + 4, plane: BORDER + 14, slits: WALL.i + 10, lens: BORDER + 14}[name];
  probe = {i0: start, i1: N - BORDER - 6, j: N / 2};
  buildProps();
  updateControls();
}

// ---------------------------------------------------------------- the field surface
const texture = new THREE.DataTexture(new Uint8Array(N * N * 4), N, N, THREE.RGBAFormat);
texture.magFilter = texture.minFilter = THREE.LinearFilter;
const surfaceGeometry = new THREE.PlaneGeometry(W - CELL, W - CELL, N - 1, N - 1);
surfaceGeometry.rotateX(-Math.PI / 2);
{
  // Put each vertex's uv exactly on its cell centre.
  const p = surfaceGeometry.attributes.position, uv = surfaceGeometry.attributes.uv;
  for (let k = 0; k < p.count; k++) uv.setXY(k, (p.getX(k) + W / 2) / W, (W / 2 - p.getZ(k)) / W);
}
const surfaceMaterial = new THREE.ShaderMaterial({
  transparent: true, side: THREE.DoubleSide,
  uniforms: {
    map: {value: texture}, texel: {value: 1 / N}, cell: {value: CELL}, heightScale: {value: 1.15},
    mode: {value: 0}, edge: {value: (BORDER + 2) / N}, fade: {value: 8 / N},
    light: {value: new THREE.Vector3(.4, 1, .55).normalize()},
  },
  vertexShader: `
    uniform sampler2D map; uniform float texel, cell, heightScale;
    varying vec2 vUv; varying vec3 vNormal; varying vec3 vView; varying float vVal; varying float vInt; varying float vMat;
    float h(vec2 uv) { return texture2D(map, uv).r * 2.0 - 1.0; }
    void main() {
      vUv = uv;
      vec4 t = texture2D(map, uv);
      vVal = t.r * 2.0 - 1.0; vInt = t.g; vMat = t.b;
      vec3 p = position;
      p.y += vVal * heightScale;
      float hl = h(uv - vec2(texel, 0.0)), hr = h(uv + vec2(texel, 0.0));
      float hd = h(uv - vec2(0.0, texel)), hu = h(uv + vec2(0.0, texel));
      vNormal = normalize(vec3((hl - hr) * heightScale / (2.0 * cell), 1.0, (hu - hd) * heightScale / (2.0 * cell)));
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      vView = normalize(-mv.xyz);
      vNormal = normalize(normalMatrix * vNormal);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: `
    uniform float mode, edge, fade; uniform vec3 light;
    varying vec2 vUv; varying vec3 vNormal; varying vec3 vView; varying float vVal; varying float vInt; varying float vMat;
    vec3 diverging(float v) {
      vec3 mid = vec3(0.035, 0.05, 0.085);
      return v < 0.0 ? mix(mid, vec3(0.12, 0.36, 0.92), pow(-v, 0.8)) : mix(mid, vec3(0.92, 0.55, 0.2), pow(v, 0.8));
    }
    vec3 heat(float x) {
      vec3 c = mix(vec3(0.02, 0.02, 0.05), vec3(0.30, 0.12, 0.58), smoothstep(0.0, 0.35, x));
      c = mix(c, vec3(0.98, 0.46, 0.34), smoothstep(0.3, 0.72, x));
      return mix(c, vec3(1.0, 0.95, 0.82), smoothstep(0.72, 1.0, x));
    }
    void main() {
      float d = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
      float alpha = smoothstep(edge, edge + fade, d);
      if (alpha <= 0.0) discard;
      vec3 base = mix(diverging(vVal), heat(vInt), mode);
      vec3 n = normalize(vNormal);
      vec3 l = normalize((viewMatrix * vec4(light, 0.0)).xyz);
      float diff = max(dot(n, l), 0.0);
      float spec = pow(max(dot(reflect(-l, n), vView), 0.0), 48.0);
      vec3 color = base * (0.38 + 0.7 * diff) + spec * 0.28 * (1.0 - 0.6 * mode);
      if (vMat > 0.3 && vMat < 0.7) color = mix(color, vec3(0.78, 0.9, 1.0), 0.1);
      if (vMat > 0.9) color = vec3(0.05, 0.06, 0.08);
      gl_FragColor = vec4(color, alpha);
    }`,
});
const surface = new THREE.Mesh(surfaceGeometry, surfaceMaterial);
group.base.add(surface);
// A dark floor under the surface, and a faint frame round the visible area.
{
  const inner = (N - 2 * BORDER - 4) * CELL;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(inner * 1.6, inner * 1.6), new THREE.MeshBasicMaterial({color: 0x05080e}));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.4;
  group.base.add(floor);
}

// ---------------------------------------------------------------- props: the slit wall and the lens
function buildProps() {
  for (const child of [...group.props.children]) { group.props.remove(child); child.geometry?.dispose(); }
  if (settings.experiment === 'slits') {
    const {i, width, slit} = WALL, s1 = cy - settings.gap / 2, s2 = cy + settings.gap / 2;
    const spans = [[BORDER, s1 - slit / 2], [s1 + slit / 2, s2 - slit / 2], [s2 + slit / 2, N - BORDER]];
    const material = new THREE.MeshStandardMaterial({color: COLOR.metal, metalness: .8, roughness: .35});
    for (const [a, b] of spans) {
      if (b <= a) continue;
      const [x] = cellToWorld(i + width / 2 - .5, 0), z1 = cellToWorld(0, a)[1], z2 = cellToWorld(0, b)[1];
      const box = new THREE.Mesh(new THREE.BoxGeometry(width * CELL, 1.1, Math.abs(z2 - z1)), material);
      box.position.set(x, 0, (z1 + z2) / 2);
      group.props.add(box);
    }
  }
  if (lens) {
    const {x0, t, a, R} = lens, alpha = Math.asin(a / R);
    const c1 = x0 + R - t / 2, c2 = x0 - R + t / 2;
    const outline = [];
    for (let k = 0; k <= 60; k++) { const q = Math.PI - alpha + 2 * alpha * k / 60; outline.push([c1 + R * Math.cos(q), cy + R * Math.sin(q)]); }
    for (let k = 0; k <= 60; k++) { const q = -alpha + 2 * alpha * k / 60; outline.push([c2 + R * Math.cos(q), cy + R * Math.sin(q)]); }
    const shape = new THREE.Shape(outline.map(([i, j]) => { const [x, z] = cellToWorld(i, j); return new THREE.Vector2(x, -z); }));
    const depth = 1.5, geometry = new THREE.ExtrudeGeometry(shape, {depth, bevelEnabled: false, curveSegments: 1});
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, -depth / 2, 0);
    group.props.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
      color: COLOR.glass, transparent: true, opacity: .1, roughness: .05, metalness: .1, depthWrite: false,
    })));
    const ring = outline.flatMap(([i, j]) => { const [x, z] = cellToWorld(i, j); return [x, 0, z]; });
    for (const y of [-depth / 2, depth / 2]) {
      const line = stage.line({color: COLOR.glass, width: 1.6, opacity: .55, parent: group.props});
      line.set([...ring, ...ring.slice(0, 3)].map((v, k) => k % 3 === 1 ? y : v));
    }
  }
}

// ---------------------------------------------------------------- the source: an antenna, or an emitter along the left edge
const antenna = new THREE.Mesh(new THREE.CylinderGeometry(.045, .045, 1.5, 16), new THREE.MeshStandardMaterial({
  color: 0x3a3220, emissive: 0xffc56b, emissiveIntensity: .6, metalness: .6, roughness: .3,
}));
antenna.position.set(...cellToWorld(N / 2, N / 2).flatMap((v, k) => k === 0 ? [v, .75] : [v]));
group.source.add(antenna);
const antennaGlow = stage.sprite(0xffd28a, 1.4, group.source);
antennaGlow.position.set(antenna.position.x, 1.5, antenna.position.z);
const emitter = stage.line({color: 0xffc56b, width: 3.2, additive: true, parent: group.source});
function updateSource() {
  const antennaOn = settings.experiment === 'antenna';
  antenna.visible = antennaGlow.visible = antennaOn;
  const swing = Math.abs(Math.sin(em.omegaFor(settings.lambda) * field.t));
  antennaGlow.material.opacity = .35 + .65 * swing;
  antennaGlow.scale.setScalar(1 + .8 * swing);
  antenna.material.emissiveIntensity = .3 + .9 * swing;
  if (antennaOn) { emitter.setVisible(false); return; }
  const [x] = cellToWorld(BORDER + 6, 0), z0 = cellToWorld(0, BORDER + 2)[1], z1 = cellToWorld(0, N - BORDER - 3)[1];
  emitter.setVisible(true);
  emitter.material.opacity = .25 + .6 * swing;
  emitter.set([x, .06, z0, x, .06, z1]);
}

// ---------------------------------------------------------------- the screen behind two slits: where the light lands
const SCREEN = {i: N - BORDER, from: BORDER + 2, to: N - BORDER - 2, sample: N - BORDER - 6};
const screenCount = SCREEN.to - SCREEN.from;
const screenTexture = new THREE.DataTexture(new Uint8Array(screenCount * 4), 1, screenCount, THREE.RGBAFormat);
screenTexture.colorSpace = THREE.SRGBColorSpace;
screenTexture.magFilter = screenTexture.minFilter = THREE.LinearFilter;
{
  const length = screenCount * CELL, strip = new THREE.Mesh(new THREE.PlaneGeometry(.45, length), new THREE.MeshBasicMaterial({map: screenTexture}));
  strip.rotation.x = -Math.PI / 2;
  const [x] = cellToWorld(SCREEN.i, 0), z = (cellToWorld(0, SCREEN.from)[1] + cellToWorld(0, SCREEN.to - 1)[1]) / 2;
  strip.position.set(x, .02, z);
  group.screen.add(strip);
}
const profile = stage.line({color: 0xffe2b8, width: 1.8, opacity: .75, parent: group.screen});
const screenLevels = new Float32Array(screenCount);
let screenMax = 1e-9;
const screenTop = new THREE.Vector3();
function heatColor(u) {
  const stops = [[.02, .02, .05], [.3, .12, .58], [.98, .46, .34], [1, .95, .82]], at = [0, .35, .72, 1];
  let k = 0;
  while (k < 2 && u > at[k + 1]) k++;
  const f = Math.min(1, Math.max(0, (u - at[k]) / (at[k + 1] - at[k])));
  return stops[k].map((a, c) => a + (stops[k + 1][c] - a) * f);
}
function updateScreen() {
  group.screen.visible = settings.experiment === 'slits';
  if (!group.screen.visible) return;
  let peak = 0;
  for (let n = 0; n < screenCount; n++) {
    let sum = 0;
    for (let di = -2; di <= 2; di++) sum += avgI[(SCREEN.from + n) * N + SCREEN.sample + di];
    screenLevels[n] = sum / 5;
    peak = Math.max(peak, screenLevels[n]);
  }
  screenMax += (Math.max(peak, 1e-12) - screenMax) * .05;
  const data = screenTexture.image.data, [x] = cellToWorld(SCREEN.i, 0), flat = [];
  for (let n = 0; n < screenCount; n++) {
    const u = Math.min(1, screenLevels[n] / screenMax), [r, g, b] = heatColor(u);
    data[n * 4] = r * 200; data[n * 4 + 1] = g * 200; data[n * 4 + 2] = b * 200; data[n * 4 + 3] = 255;
    flat.push(x, .05 + u * 1.4 * heightOn, cellToWorld(0, SCREEN.from + n)[1]);
  }
  screenTexture.needsUpdate = true;
  profile.set(flat);
  screenTop.set(x, .3, cellToWorld(0, SCREEN.from + 4)[1]);
}

// ---------------------------------------------------------------- E and B arrows along one line
const arrows = {
  e: stage.line({color: COLOR.e, width: 2.4, segments: true, parent: group.arrows}),
  b: stage.line({color: COLOR.b, width: 2.4, segments: true, parent: group.arrows}),
  eCurve: stage.line({color: COLOR.e, width: 1.6, opacity: .75, parent: group.arrows}),
  bCurve: stage.line({color: COLOR.b, width: 1.6, opacity: .75, parent: group.arrows}),
  rail: stage.line({color: 0xb7c6d6, width: 1.2, opacity: .4, dashed: true, dash: [.12, .1], parent: group.arrows}),
  drop: stage.line({color: 0xb7c6d6, width: 1, opacity: .25, dashed: true, dash: [.1, .1], segments: true, parent: group.arrows}),
};
function heads(color) {
  const mesh = new THREE.InstancedMesh(new THREE.ConeGeometry(.055, .16, 12), new THREE.MeshBasicMaterial({color}), ARROWS);
  mesh.frustumCulled = false;
  group.arrows.add(mesh);
  return mesh;
}
const eHeads = heads(COLOR.e), bHeads = heads(COLOR.b);
const dummy = new THREE.Object3D(), up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3();
const arrowTips = {e: new THREE.Vector3(), b: new THREE.Vector3()};

function updateArrows() {
  const {i0, i1, j} = probe, len = 1.15, flatE = [], flatB = [], ce = [], cb = [];
  const z = cellToWorld(0, j)[1];
  const value = i => {
    const k = j * N + Math.round(i);
    return [field.ez[k] / scale, field.hx[k] / scale, field.hy[k] / scale].map(v => Math.max(-1.6, Math.min(1.6, v)));
  };
  for (let i = i0; i <= i1; i++) {
    const [e, hx, hy] = value(i), [x] = cellToWorld(i, j);
    ce.push(x, RAIL + e * len, z);
    cb.push(x + hx * len, RAIL, z - hy * len);
  }
  arrows.eCurve.set(ce);
  arrows.bCurve.set(cb);
  for (let a = 0; a < ARROWS; a++) {
    const i = i0 + (i1 - i0) * a / (ARROWS - 1), [e, hx, hy] = value(i), [x] = cellToWorld(i, j);
    flatE.push(x, RAIL, z, x, RAIL + e * len, z);
    flatB.push(x, RAIL, z, x + hx * len, RAIL, z - hy * len);
    const place = (mesh, tip, vx, vy, vz, mag) => {
      dir.set(vx, vy, vz);
      if (dir.lengthSq() < 1e-6) dir.set(0, 1, 0);
      dummy.position.copy(tip);
      dummy.quaternion.setFromUnitVectors(up, dir.normalize());
      dummy.scale.setScalar(Math.min(1, Math.abs(mag) * 4));
      dummy.updateMatrix();
      mesh.setMatrixAt(a, dummy.matrix);
    };
    const tipE = new THREE.Vector3(x, RAIL + e * len, z), tipB = new THREE.Vector3(x + hx * len, RAIL, z - hy * len);
    place(eHeads, tipE, 0, e, 0, e);
    place(bHeads, tipB, hx, 0, -hy, Math.hypot(hx, hy));
    if (a === Math.round(ARROWS * .45)) { arrowTips.e.copy(tipE); arrowTips.b.copy(tipB); }
  }
  eHeads.instanceMatrix.needsUpdate = bHeads.instanceMatrix.needsUpdate = true;
  arrows.e.set(flatE);
  arrows.b.set(flatB);
  const [xa] = cellToWorld(i0, j), [xb] = cellToWorld(i1, j);
  arrows.rail.set([xa, RAIL, z, xb, RAIL, z]);
  arrows.drop.set([xa, RAIL, z, xa, 0, z, xb, RAIL, z, xb, 0, z]);
}

// ---------------------------------------------------------------- measurements
const ratioWindow = {e: 0, h: 0, steps: 0, value: null};
function measure() {
  const k = probe.j * N + Math.round((probe.i0 + probe.i1) / 2);
  ratioWindow.e = Math.max(ratioWindow.e, Math.abs(field.ez[k]));
  ratioWindow.h = Math.max(ratioWindow.h, Math.hypot(field.hx[k], field.hy[k]));
  if (++ratioWindow.steps >= 2 * settings.lambda / em.COURANT) {
    if (field.t > 6 * settings.lambda + (probe.i1 - BORDER)) ratioWindow.value = ratioWindow.e / ratioWindow.h;
    ratioWindow.e = ratioWindow.h = ratioWindow.steps = 0;
  }
}

/** Write the field, the average brightness and the materials into the surface texture. */
function writeTexture() {
  // Scale the colours to the region that matters: behind the wall for the slits, everywhere otherwise.
  let sum = 0, count = 0, isum = 0;
  const iFrom = settings.experiment === 'slits' ? WALL.i + WALL.width + 6 : BORDER;
  for (let j = BORDER; j < N - BORDER; j += 3) for (let i = iFrom; i < N - BORDER; i += 3) {
    const k = j * N + i;
    sum += field.ez[k] ** 2;
    isum += avgI[k];
    count++;
  }
  const rms = Math.sqrt(sum / count);
  scale += (Math.max(rms * 4.2, 1e-4) - scale) * .05;
  iScale += (Math.max(isum / count * 3.2, 1e-8) - iScale) * .05;
  const data = texture.image.data;
  const dimBefore = settings.experiment === 'slits' ? WALL.i : -1;
  for (let k = 0; k < N * N; k++) {
    // In front of the slit wall the light is far stronger; it is drawn at 35% so the fringes behind stay readable.
    const v = Math.tanh(field.ez[k] / scale * (k % N < dimBefore ? .35 : 1));
    data[k * 4] = (v * .5 + .5) * 255;
    // In front of the slit wall the light is far brighter; dim it there so the fringes stay readable.
    data[k * 4 + 1] = Math.tanh(avgI[k] / iScale * (k % N < dimBefore ? .025 : 1)) * 255;
    data[k * 4 + 2] = field.metal[k] ? 255 : field.eps[k] > 1.01 ? 128 : 0;
    data[k * 4 + 3] = 255;
  }
  texture.needsUpdate = true;
}

function simulate(dtFrame) {
  if (!playing) return;
  stepDebt += RATES[settings.rate] * Math.min(dtFrame * 60, 3);
  const decay = 1 / (3 * settings.lambda / em.COURANT);
  while (stepDebt >= 1) {
    field.step();
    for (let k = 0; k < avgI.length; k++) avgI[k] += (field.ez[k] * field.ez[k] - avgI[k]) * decay;
    measure();
    stepDebt -= 1;
  }
  // Forget ripples that have finished.
  for (let s = field.sources.length - 1; s >= 0; s--) {
    const src = field.sources[s];
    if (src.kind === 'pulse' && field.t > src.t0 + 6 * src.width) field.sources.splice(s, 1);
  }
}

// ---------------------------------------------------------------- readout, labels, tooltip
const labelPoint = new THREE.Vector3();
function lensFocus() {
  if (!lens) return null;
  const {x0, t, R} = lens, n = settings.n;
  const power = (n - 1) * (2 / R - (n - 1) * t / (n * R * R));
  const f = 1 / power, back = f * (1 - (n - 1) * t / (n * R));
  return x0 + t / 2 + back;
}
function updateReadout() {
  const lambdaWorld = settings.lambda * CELL;
  $('lambda').textContent = `${settings.lambda} cells`;
  $('lambda-note').textContent = `period ${(2 * settings.lambda).toFixed(0)} time steps · ${(lambdaWorld).toFixed(1)} on the grid`;
  $('speed').textContent = lens ? `c / ${settings.n.toFixed(2)}` : 'c';
  $('speed-note').textContent = lens ? `in the glass: ${(1 / settings.n).toFixed(2)} c · in air: c` : 'the same in every direction';
  $('row-ratio').hidden = !layers.arrows;
  $('ratio').textContent = ratioWindow.value ? ratioWindow.value.toFixed(2) : '…';
}
function updateLabels() {
  const rects = [$('story'), $('panel'), $('readout'), $('transport')].filter(el => el.offsetParent).map(el => el.getBoundingClientRect());
  const pin = (id, p, show) => positionLabel($(id), labelPoint.copy(p), camera, {show, avoid: rects});
  pin('label-e', arrowTips.e, layers.arrows);
  pin('label-b', arrowTips.b, layers.arrows);
  pin('label-screen', screenTop, group.screen.visible);
  if (lens) {
    const [x, z] = cellToWorld(lens.x0, cy - lens.a - 4);
    pin('label-glass', labelPoint.set(x, .8, z), true);
    const focus = lensFocus(), visible = focus < N - BORDER - 4;
    const [fx, fz] = cellToWorld(Math.min(focus, N - BORDER - 4), cy);
    pin('label-focus', labelPoint.set(fx, .3, fz), visible && heightOn > .5);
  } else {
    $('label-glass').style.visibility = $('label-focus').style.visibility = 'hidden';
  }
}

const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2(), floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
function cellAt(clientX, clientY) {
  pointer.set(clientX / innerWidth * 2 - 1, -(clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  if (!raycaster.ray.intersectPlane(floorPlane, hit)) return null;
  const [i, j] = worldToCell(hit.x, hit.z).map(Math.round);
  if (i < BORDER + 2 || j < BORDER + 2 || i > N - BORDER - 3 || j > N - BORDER - 3) return null;
  return [i, j];
}
function describe([i, j]) {
  const k = j * N + i, e = field.ez[k] / scale, b = Math.hypot(field.hx[k], field.hy[k]) / scale;
  const material = field.metal[k] ? 'metal (no field inside)' : field.eps[k] > 1.01 ? `glass, n = ${Math.sqrt(field.eps[k]).toFixed(2)}` : 'air, n = 1';
  return `<h4>Here</h4>
    <div class="row"><span>Electric field E</span><span>${e >= 0 ? '+' : '−'}${Math.abs(e).toFixed(2)}</span></div>
    <div class="row"><span>Magnetic field c·B</span><span>${b.toFixed(2)}</span></div>
    <div class="row"><span>Average brightness</span><span>${Math.round(texture.image.data[k * 4 + 1] / 2.55)}%</span></div>
    <div class="row"><span>Material</span><span>${material}</span></div>
    <div class="note">Fields relative to the wave’s typical strength. Tap to make a ripple here.</div>`;
}
function ripple([i, j]) {
  field.sources.push(em.pulse({i, j, t0: field.t + 8, width: 2.6, amp: 40}));
}
let downAt = null, rippleHinted = false;
$('scene').addEventListener('pointermove', event => {
  if (event.pointerType !== 'mouse' || event.buttons) return;
  const c = cellAt(event.clientX, event.clientY);
  showTip(event.clientX, event.clientY, c && describe(c));
  $('scene').classList.toggle('pointing', !!c);
});
$('scene').addEventListener('pointerdown', event => { downAt = [event.clientX, event.clientY]; });
$('scene').addEventListener('pointerup', event => {
  if (!downAt || Math.hypot(event.clientX - downAt[0], event.clientY - downAt[1]) > 6) return;
  const c = cellAt(event.clientX, event.clientY);
  if (!c) return;
  ripple(c);
  if (!playing) setPlaying(true);
  if (!rippleHinted) { toast('A single ripple: it spreads at the speed of light.'); rippleHinted = true; }
  if (event.pointerType !== 'mouse') showTip(event.clientX, event.clientY, describe(c));
});
$('scene').addEventListener('pointerleave', () => showTip(0, 0, null));

// ---------------------------------------------------------------- camera
const FRAMING = {
  surface: () => narrow() ? [0, 28, 27] : [0, 15, 17.5],
  top: () => narrow() ? [0, 40, .5] : [0, 24, .5],
};
const offset = new THREE.Vector3(), target = new THREE.Vector3(0, 0, 0);
let offsetTween = null;
/** Pulls the camera back on narrow-aspect windows so the whole visible grid stays in view. */
function fitted(v) {
  const halfWidth = (N - 2 * BORDER) * CELL / 2 + .6, tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect;
  return v.multiplyScalar(Math.max(1, halfWidth / tanHalf * (narrow() ? 1.08 : 1.7) / v.length()));
}
function setFraming(name, animate = true) {
  const to = fitted(new THREE.Vector3(...FRAMING[name]()));
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
  group.arrows.visible = layers.arrows;
  for (const chip of document.querySelectorAll('.chip')) setPressed(chip, layers[chip.dataset.layer]);
}
function setView(top, announce = false) {
  targetHeight = top ? 0 : 1;
  if (reducedMotion) heightOn = targetHeight;
  setPressed($('view-surface'), !top);
  setPressed($('view-top'), top);
  if (announce) {
    setFraming(top ? 'top' : 'surface');
    toast(top ? 'Seen from above: colour shows the field.' : 'Height shows the electric field.');
  }
}
function updateControls() {
  for (const b of document.querySelectorAll('[data-experiment]')) setPressed(b, b.dataset.experiment === settings.experiment);
  $('out-lambda').textContent = `${settings.lambda} cells`;
  $('wavelength').value = settings.lambda;
  $('wavelength').style.setProperty('--progress', `${(settings.lambda - 14) / 20 * 100}%`);
  const p = PARAM[settings.experiment];
  $('param-group').hidden = !p;
  if (p) {
    const input = $('param');
    Object.assign(input, {min: p.min, max: p.max, step: p.step});
    input.value = settings[p.key];
    input.style.setProperty('--progress', `${(settings[p.key] - p.min) / (p.max - p.min) * 100}%`);
    $('param-name').textContent = p.name;
    $('out-param').textContent = p.format(settings[p.key]);
  }
  $('out-rate').textContent = `${RATES[settings.rate]}×`;
  $('rate').value = settings.rate;
  $('rate').style.setProperty('--progress', `${settings.rate / 3 * 100}%`);
}
function chooseExperiment(name) {
  settings.experiment = name;
  setupExperiment(true);
  ratioWindow.value = null;
  if (!playing) setPlaying(true);
}

$('play').onclick = () => setPlaying(!playing);
$('reset').onclick = () => chooseExperiment(settings.experiment);
$('view-surface').onclick = () => setView(false, true);
$('view-top').onclick = () => setView(true, true);
$('reset-camera').onclick = () => setFraming(targetHeight > .5 ? 'surface' : 'top');
for (const b of document.querySelectorAll('[data-experiment]')) b.onclick = () => chooseExperiment(b.dataset.experiment);
for (const chip of document.querySelectorAll('.chip')) chip.onclick = () => { layers[chip.dataset.layer] = !layers[chip.dataset.layer]; applyLayers(); };
// Wavelength, slit gap and glass index change live, without clearing the waves already travelling.
$('wavelength').addEventListener('input', e => { settings.lambda = +e.target.value; setSources(); ratioWindow.value = null; updateControls(); });
$('param').addEventListener('input', e => {
  const p = PARAM[settings.experiment];
  settings[p.key] = +e.target.value;
  setupExperiment(false);
  ratioWindow.value = null;
});
$('rate').addEventListener('input', e => { settings.rate = +e.target.value; updateControls(); });
function showPanel(open) {
  $('panel').classList.toggle('sheet-closed', !open);
  $('panel-toggle').setAttribute('aria-expanded', String(open));
}
$('panel-toggle').onclick = () => showPanel($('panel').classList.contains('sheet-closed'));
bindDialog($('notes'), $('about'), () => setPlaying(false));
stage.onContextLost = () => setPlaying(false);
const toggleView = () => setView(targetHeight > .5, true);
bindKeys({
  ' ': () => setPlaying(!playing),
  1: () => chooseExperiment('antenna'), 2: () => chooseExperiment('plane'),
  3: () => chooseExperiment('slits'), 4: () => chooseExperiment('lens'),
  t: toggleView, T: toggleView,
  r: () => chooseExperiment(settings.experiment), R: () => chooseExperiment(settings.experiment),
});

const story = createStory({
  steps,
  onEnter(step, index) {
    settings.experiment = step.experiment;
    setupExperiment(true);
    ratioWindow.value = null;
    setView(step.view === 'top');
    applyLayers(step.layers);
    showPanel(index === steps.length - 1 && !narrow());
    setFraming(step.view === 'top' ? 'top' : 'surface');
    showTip(0, 0, null);
    setPlaying(!reducedMotion);
  },
});

offset.copy(fitted(new THREE.Vector3(...FRAMING.surface())));
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
  if (!document.hidden) simulate(dt);
  heightOn += (targetHeight - heightOn) * Math.min(1, dt * 4);
  intensityMix += ((layers.intensity ? 1 : 0) - intensityMix) * Math.min(1, dt * 4);
  surfaceMaterial.uniforms.heightScale.value = 1.25 * heightOn * (1 - .75 * intensityMix);
  surfaceMaterial.uniforms.mode.value = intensityMix;
  group.props.scale.y = .25 + .75 * heightOn;
  writeTexture();
  if (layers.arrows) updateArrows();
  updateSource();
  updateScreen();

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

// With ?debug in the URL, expose a hook for advancing the simulation quickly during checks.
if (new URLSearchParams(location.search).has('debug')) {
  window.__light = {field, settings, run(steps) { stepDebt += steps; const was = playing; playing = true; simulate(0); playing = was; }};
}
