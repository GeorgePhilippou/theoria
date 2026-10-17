// Quantum waves: a live Schrödinger solver drawn as a phase-coloured probability surface,
// plus exact hydrogen orbitals as clouds of sampled positions.
import * as THREE from 'three';
import {createStage} from '../shared/stage.js';
import {$, toast, setPressed, reducedMotion, createStory, bindDialog, positionLabel, bindKeys, showTip} from '../shared/shell.js';
import * as q from './physics.js';
import {steps} from './story.js';

const NX = 256, NY = 128, LX = 128, LY = 64, DX = LX / NX, ABSORB = 16;
const S = .18;                         // world units per simulation unit
const WX = LX * S, WZ = LY * S;        // world size of the grid
const HEIGHT = 2.1;                    // surface height for the peak
const E_SCALE = .9;                    // world height per unit of energy (barrier and energy line)
const DETECTOR_X = 44, MAX_DOTS = 2400;
const RATES = [.5, 1, 2, 3];
const PARAM = {
  packet: {name: 'Momentum k', min: .6, max: 2.4, step: .05, key: 'k', format: v => v.toFixed(2)},
  slits: {name: 'Slit gap', min: 6, max: 20, step: .5, key: 'gap', format: v => `${v.toFixed(1)} units`},
  tunnel: {name: 'Barrier V₀', min: .4, max: 3, step: .05, key: 'V0', format: v => v.toFixed(2)},
};
const COLOR = {barrier: 0xb9a4ff, energy: 0xffc56b, dot: 0x9ff0ff, plus: 0xffa848, minus: 0x3a85ff};

const settings = {experiment: 'packet', k: 1.4, gap: 12, V0: 1.6, orbital: '2p', rate: 1};
const layers = {phase: true, detector: false};
const narrow = () => innerWidth <= 720;
let heightOn = 1, targetHeight = 1, playing = !reducedMotion, stepDebt = 0;

// ---------------------------------------------------------------- stage
const stage = createStage({
  canvas: $('scene'), fallback: $('fallback'), bloom: {strength: .3, radius: .45, threshold: .9},
  viewShift: () => {
    if (!narrow()) return [24, 0];
    const top = $('story').getBoundingClientRect().bottom;
    const below = [$('readout'), $('transport')].find(el => el.offsetParent);
    return [0, Math.round((top + below.getBoundingClientRect().top) / 2 - innerHeight / 2)];
  },
});
const {scene, camera, controls} = stage;
Object.assign(controls, {minDistance: 4, maxDistance: 110});
const group = {wave: new THREE.Group(), props: new THREE.Group(), dots: new THREE.Group(), atom: new THREE.Group()};
for (const g of Object.values(group)) scene.add(g);

const toWorld = (x, y, h = 0) => [x * S, h, -y * S];
const cellOf = (x, y) => [Math.round(x / DX + NX / 2), Math.round(y / DX + NY / 2)];

// ---------------------------------------------------------------- simulation
const wave = q.createWave({nx: NX, ny: NY, lx: LX, ly: LY, dt: .2, absorb: ABSORB});
const SLIT = {half: .75, width: 2.2, height: 6};
const BARRIER_A = 1;
let ampScale = 1e-3, tunnelBest = 0, tunnelLast = null, launches = 0;

function potentialFor(name) {
  if (name === 'slits') {
    const {half, width, height} = SLIT, s = settings.gap / 2;
    return (x, y) => Math.abs(x) < half && Math.abs(y - s) > width / 2 && Math.abs(y + s) > width / 2 ? height : 0;
  }
  if (name === 'tunnel') return x => x >= 0 && x < BARRIER_A ? settings.V0 : 0;
  return () => 0;
}
function launch() {
  const name = settings.experiment;
  if (name === 'packet') wave.setPacket({x0: -28, y0: 0, kx: settings.k, sx: 5, sy: 5});
  if (name === 'slits') wave.setPacket({x0: -36, y0: 0, kx: 2, sx: 5, sy: 12});
  if (name === 'tunnel') wave.setPacket({x0: -30, y0: 0, kx: 1.5, sx: 6, sy: 7});
  if (tunnelBest > .001) tunnelLast = tunnelBest;
  tunnelBest = 0;
  launches++;
}
function setupExperiment(restart = true) {
  const name = settings.experiment, isAtom = name === 'atom';
  group.wave.visible = group.props.visible = !isAtom;
  group.atom.visible = isAtom;
  group.dots.visible = !isAtom && layers.detector && name === 'slits';
  controls.autoRotate = isAtom && !reducedMotion;
  if (restart) tunnelLast = null;
  if (isAtom) buildAtom();
  else {
    wave.setPotential(potentialFor(name));
    if (restart) { launch(); clearDots(); }
    buildProps();
  }
  updateControls();
}

// ---------------------------------------------------------------- the probability surface
const texture = new THREE.DataTexture(new Uint8Array(NX * NY * 4), NX, NY, THREE.RGBAFormat);
texture.magFilter = texture.minFilter = THREE.LinearFilter;
const surfaceGeometry = new THREE.PlaneGeometry(WX - DX * S, WZ - DX * S, NX - 1, NY - 1);
surfaceGeometry.rotateX(-Math.PI / 2);
{
  const p = surfaceGeometry.attributes.position, uv = surfaceGeometry.attributes.uv;
  for (let k = 0; k < p.count; k++) uv.setXY(k, (p.getX(k) + WX / 2) / WX, (-p.getZ(k) + WZ / 2) / WZ);
}
const surfaceMaterial = new THREE.ShaderMaterial({
  transparent: true, side: THREE.DoubleSide,
  uniforms: {
    map: {value: texture}, texel: {value: new THREE.Vector2(1 / NX, 1 / NY)}, cell: {value: DX * S},
    heightScale: {value: HEIGHT}, phaseMix: {value: 1}, edge: {value: new THREE.Vector2(ABSORB / NX, ABSORB / NY)},
    size: {value: new THREE.Vector2(LX, LY)},
    light: {value: new THREE.Vector3(.35, 1, .5).normalize()},
  },
  vertexShader: `
    uniform sampler2D map; uniform vec2 texel; uniform float cell, heightScale;
    varying vec2 vUv; varying vec3 vNormal; varying vec3 vView; varying vec4 vData;
    float h(vec2 uv) { return pow(texture2D(map, uv).r, 1.4); }
    void main() {
      vUv = uv;
      vData = texture2D(map, uv);
      vec3 p = position;
      p.y += h(uv) * heightScale;
      float hl = h(uv - vec2(texel.x, 0.0)), hr = h(uv + vec2(texel.x, 0.0));
      float hd = h(uv - vec2(0.0, texel.y)), hu = h(uv + vec2(0.0, texel.y));
      vec3 n = normalize(vec3((hl - hr) * heightScale / (2.0 * cell), 1.0, (hu - hd) * heightScale / (2.0 * cell)));
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      vView = normalize(-mv.xyz);
      vNormal = normalize(normalMatrix * n);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: `
    uniform float phaseMix; uniform vec2 edge, size; uniform vec3 light;
    varying vec2 vUv; varying vec3 vNormal; varying vec3 vView; varying vec4 vData;
    vec3 hsv(float h, float s, float v) { vec3 k = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); return v * mix(vec3(1.0), k, s); }
    void main() {
      vec2 d2 = min(vUv, 1.0 - vUv) - edge;
      float alpha = smoothstep(0.0, 0.03, min(d2.x * 0.5, d2.y));
      if (alpha <= 0.0) discard;
      float a = vData.r;
      float phase = atan(vData.b * 2.0 - 1.0, vData.g * 2.0 - 1.0) / 6.2831853 + 0.5;
      // An empty region is a dark sheet with a faint grid, 8 units apart, that fades where the wave is.
      vec2 q = vUv * size / 8.0;
      vec2 g = abs(fract(q - 0.5) - 0.5) / fwidth(q);
      float grid = 1.0 - min(min(g.x, g.y), 1.0);
      vec3 dark = mix(vec3(0.09, 0.12, 0.18), vec3(0.24, 0.32, 0.44), grid * 0.6);
      vec3 hue = hsv(phase, 0.6, 0.95);
      vec3 plain = vec3(0.72, 0.9, 1.0);
      vec3 base = mix(dark, mix(plain, hue, phaseMix), smoothstep(0.0, 0.9, pow(a, 0.75)));
      vec3 n = normalize(vNormal);
      vec3 l = normalize((viewMatrix * vec4(light, 0.0)).xyz);
      float diff = max(dot(n, l), 0.0);
      float spec = pow(max(dot(reflect(-l, n), vView), 0.0), 40.0);
      vec3 color = base * (0.4 + 0.6 * diff) + spec * 0.2 * smoothstep(0.05, 0.4, a);
      if (vData.a > 0.5) color = mix(color, vec3(0.62, 0.52, 0.95), 0.25);
      // Colours above are written in display (sRGB) terms; convert to linear for the renderer.
      gl_FragColor = vec4(pow(max(color, 0.0), vec3(2.2)), alpha);
    }`,
});
group.wave.add(new THREE.Mesh(surfaceGeometry, surfaceMaterial));
{
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(WX * 1.4, WZ * 1.8), new THREE.MeshBasicMaterial({color: 0x05080e}));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -.05;
  group.wave.add(floor);
  // A faint rim round the simulated region (the absorbing margin outside it is hidden).
  const x = (LX / 2 - ABSORB * DX) * S, z = (LY / 2 - ABSORB * DX) * S;
  stage.line({color: 0x8fb3d4, width: 1.2, opacity: .35, parent: group.wave}).set([-x, .01, -z, x, .01, -z, x, .01, z, -x, .01, z, -x, .01, -z]);
}

// ---------------------------------------------------------------- props: walls, barrier, energy line, detector screen
const barrierMaterial = new THREE.MeshStandardMaterial({color: COLOR.barrier, transparent: true, opacity: .28, roughness: .2, metalness: .1, depthWrite: false});
const energyLine = stage.line({color: COLOR.energy, width: 2, opacity: .9, dashed: true, dash: [.18, .12], parent: group.props});
const zMin = -(LY / 2 - ABSORB * DX) * S, zMax = -zMin;
function box(x0, x1, y0, y1, h) {
  const [ax, , az] = toWorld(x0, y0), [bx, , bz] = toWorld(x1, y1);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(bx - ax), h, Math.abs(bz - az)), barrierMaterial);
  mesh.position.set((ax + bx) / 2, h / 2, (az + bz) / 2);
  group.props.add(mesh);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({color: COLOR.barrier, transparent: true, opacity: .7}));
  edges.position.copy(mesh.position);
  group.props.add(edges);
}
const screen = new THREE.Mesh(new THREE.PlaneGeometry(zMax - zMin, 1.9), new THREE.MeshStandardMaterial({
  color: 0x0c1420, transparent: true, opacity: .85, side: THREE.DoubleSide, roughness: .9,
}));
screen.rotation.y = Math.PI / 2;
screen.position.set(DETECTOR_X * S + .02, .95, 0);
group.dots.add(screen);
const dots = new THREE.InstancedMesh(new THREE.SphereGeometry(.035, 8, 6), new THREE.MeshBasicMaterial({color: COLOR.dot}), MAX_DOTS);
dots.count = 0;
dots.frustumCulled = false;
group.dots.add(dots);
const dotMatrix = new THREE.Matrix4();
let dotBudget = 0;
function clearDots() { dots.count = 0; dots.instanceMatrix.needsUpdate = true; dotBudget = 0; }

function buildProps() {
  for (const child of [...group.props.children]) if (child !== energyLine.object) { group.props.remove(child); child.geometry?.dispose(); }
  const yEdge = LY / 2 - ABSORB * DX;
  if (settings.experiment === 'slits') {
    const {half, width, height} = SLIT, s = settings.gap / 2, h = height * .32;
    for (const [a, b] of [[-yEdge, -s - width / 2], [-s + width / 2, s - width / 2], [s + width / 2, yEdge]]) if (b > a) box(-half, half, a, b, h);
  }
  if (settings.experiment === 'tunnel') {
    box(0, BARRIER_A, -yEdge, yEdge, settings.V0 * E_SCALE);
    const E = 1.5 ** 2 / 2, y = E * E_SCALE;
    energyLine.set([...toWorld(-yEdge * 1.4, -yEdge, y), ...toWorld(yEdge * 1.4, -yEdge, y)].map((v, i) => i % 3 === 2 ? zMax + .15 : v));
  } else energyLine.set([]);
}

// ---------------------------------------------------------------- hydrogen orbitals
const dotTexture = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const ctx = c.getContext('2d'), g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.4, 'rgba(255,255,255,.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
})();
const atomPoints = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({
  size: .085, map: dotTexture, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
}));
group.atom.add(atomPoints);
const nucleus = stage.sprite(0xffffff, .45, group.atom);
const axis = stage.line({color: 0x9fb4cf, width: 1, opacity: .3, dashed: true, dash: [.15, .15], parent: group.atom});
let atomInfo = null;
function buildAtom() {
  const orb = q.orbital(settings.orbital), R = orb.extent, count = narrow() ? 16000 : 26000;
  let seed = 11;
  const random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  // Estimate the peak of |ψ|², then sample by rejection.
  let peak = 0;
  for (let i = 0; i < 40000; i++) {
    const x = (random() * 2 - 1) * R, y = (random() * 2 - 1) * R, z = (random() * 2 - 1) * R;
    peak = Math.max(peak, orb.psi(x, y, z) ** 2);
  }
  peak *= 1.3;
  const positions = new Float32Array(count * 3), colors = new Float32Array(count * 3), scale = 5.5 / R;
  const plus = new THREE.Color(COLOR.plus), minus = new THREE.Color(COLOR.minus);
  for (let n = 0, tries = 0; n < count && tries < 8e6; tries++) {
    const x = (random() * 2 - 1) * R, y = (random() * 2 - 1) * R, z = (random() * 2 - 1) * R;
    const psi = orb.psi(x, y, z);
    if (random() * peak > psi * psi) continue;
    // The orbital's z axis points up in the scene.
    positions.set([x * scale, z * scale, -y * scale], n * 3);
    const c = psi >= 0 ? plus : minus, k = .35 + .45 * random();
    colors.set([c.r * k, c.g * k, c.b * k], n * 3);
    n++;
  }
  atomPoints.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  atomPoints.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  atomPoints.geometry.computeBoundingSphere();
  axis.set([0, -6.5, 0, 0, 6.5, 0]);
  atomInfo = {...orb, scale};
}

// ---------------------------------------------------------------- per frame: simulate and draw
function writeTexture() {
  const {re, im, V} = wave, data = texture.image.data;
  // With the slits, scale to the wave beyond the wall (once some has got through) and dim the
  // far stronger wave in front of it, so the interference stays visible.
  const slits = settings.experiment === 'slits', iWall = NX / 2 + Math.ceil(SLIT.half / DX) + 2;
  let peak = 0, peakBeyond = 0;
  for (let k = 0; k < re.length; k += 2) {
    const a = re[k] * re[k] + im[k] * im[k];
    if (a > peak) peak = a;
    if (slits && k % NX > iWall && a > peakBeyond) peakBeyond = a;
  }
  peak = Math.sqrt(slits && peakBeyond > peak * .004 ? peakBeyond : peak);
  ampScale = peak > ampScale ? peak : ampScale + (peak - ampScale) * .03;
  const inv = 1 / Math.max(ampScale, 1e-9), dimFront = slits && peakBeyond > 0 ? .3 : 1;
  for (let k = 0; k < re.length; k++) {
    const a = Math.hypot(re[k], im[k]), c = a > 1e-12 ? re[k] / a : 1, s = a > 1e-12 ? im[k] / a : 0;
    data[k * 4] = Math.min(1, a * inv * (slits && k % NX <= iWall ? dimFront : 1)) * 255;
    data[k * 4 + 1] = (c * .5 + .5) * 255;
    data[k * 4 + 2] = (s * .5 + .5) * 255;
    data[k * 4 + 3] = V[k] > .01 ? 255 : 0;
  }
  texture.needsUpdate = true;
}

function detect() {
  // Dots arrive at a rate proportional to the probability at the screen line.
  const i = Math.round(DETECTOR_X / DX + NX / 2), weights = [];
  let total = 0;
  for (let j = 0; j < NY; j++) {
    const k = j * NX + i, w = wave.re[k] ** 2 + wave.im[k] ** 2;
    weights.push(w);
    total += w;
  }
  dotBudget += total * DX * 90;
  while (dotBudget >= 1 && dots.count < MAX_DOTS) {
    dotBudget -= 1;
    let r = Math.random() * total, j = 0;
    while (j < NY - 1 && r > weights[j]) { r -= weights[j]; j++; }
    const y = (j - NY / 2 + Math.random() - .5) * DX;
    const [x, , z] = toWorld(DETECTOR_X, y);
    dotMatrix.makeTranslation(x - .03, .12 + Math.random() * 1.66, z);
    dots.setMatrixAt(dots.count++, dotMatrix);
    dots.instanceMatrix.needsUpdate = true;
  }
}

function simulate(dtFrame) {
  if (!playing || settings.experiment === 'atom') return;
  stepDebt += RATES[settings.rate] * Math.min(dtFrame * 60, 3);
  while (stepDebt >= 1) {
    wave.step();
    if (settings.experiment === 'slits' && layers.detector) detect();
    if (settings.experiment === 'tunnel') tunnelBest = Math.max(tunnelBest, wave.probability(x => x >= BARRIER_A + 2));
    stepDebt -= 1;
  }
  // When the wave has (almost) all left the grid, send another.
  if (wave.norm() < .04) launch();
}

// ---------------------------------------------------------------- measurement
const flash = stage.sprite(0xffffff, 2, scene, {opacity: 0});
function measure() {
  if (settings.experiment === 'atom') {
    toast('In the atom view the dots already are many measurements: each is one possible result.');
    return;
  }
  const {re, im} = wave;
  let total = 0;
  for (let k = 0; k < re.length; k++) total += re[k] * re[k] + im[k] * im[k];
  let r = Math.random() * total, k = 0;
  while (k < re.length - 1 && r > re[k] * re[k] + im[k] * im[k]) { r -= re[k] * re[k] + im[k] * im[k]; k++; }
  const x0 = wave.xAt(k % NX), y0 = wave.yAt(Math.floor(k / NX));
  const nearby = wave.probability((x, y) => Math.hypot(x - x0, y - y0) < 1);
  // A position measurement of finite precision: multiply by a narrow Gaussian there, and renormalise.
  const w = 1.2;
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const kk = j * NX + i, d2 = (wave.xAt(i) - x0) ** 2 + (wave.yAt(j) - y0) ** 2, f = Math.exp(-d2 / (4 * w * w));
    re[kk] *= f; im[kk] *= f;
  }
  wave.normalise();
  ampScale = 1e-9;
  flash.position.set(...toWorld(x0, y0, .6));
  flash.material.opacity = 1;
  toast(`Found at x = ${x0.toFixed(1)}, y = ${y0.toFixed(1)}. Beforehand, the chance of finding it within 1 unit of there was ${nearby < .001 ? 'under 0.1' : (nearby * 100).toFixed(1)}%.`);
}

// ---------------------------------------------------------------- readout, labels, tooltip
const fmt = (x, d = 2) => x.toFixed(d);
function setRow(n, name, note, value) {
  $(`r${n}-name`).textContent = name;
  $(`r${n}-note`).textContent = note;
  $(`r${n}`).textContent = value;
}
let statsCache = {mean: 0, sd: 0}, statsFrame = 0;
function updateReadout() {
  const name = settings.experiment;
  if (name === 'packet') {
    if (++statsFrame % 6 === 0) statsCache = wave.statsX();
    setRow(1, 'Momentum', 'p = ħk, in units where ħ = m = 1', `k = ${fmt(settings.k)}`);
    setRow(2, 'Wavelength', 'λ = h/p = 2π/k: one trip round the colours', `${fmt(2 * Math.PI / settings.k)}`);
    setRow(3, 'Spread', 'standard deviation of position along x, measured', `${fmt(statsCache.sd, 1)}`);
  } else if (name === 'slits') {
    const lambda = 2 * Math.PI / 2, D = DETECTOR_X;
    setRow(1, 'Electrons detected', layers.detector ? 'each dot is one arrival' : 'turn on the detector screen', `${dots.count}`);
    setRow(2, 'Wavelength', 'λ = 2π/k for k = 2', `${fmt(lambda)}`);
    setRow(3, 'Fringe spacing', 'expected λD/d, D = distance to the screen', `${fmt(lambda * D / settings.gap, 1)}`);
  } else if (name === 'tunnel') {
    const E = 1.5 ** 2 / 2;
    setRow(1, 'Energy vs barrier', E < settings.V0 ? 'the barrier is higher: a ball would bounce' : 'the barrier is lower than the energy', `${fmt(E)} vs ${fmt(settings.V0)}`);
    const showing = tunnelBest > .002 || tunnelLast === null ? tunnelBest : tunnelLast;
    setRow(2, 'Transmitted, measured', tunnelBest > .002 || tunnelLast === null ? 'probability found beyond the barrier' : 'last run (the next packet is on its way)', `${(showing * 100).toFixed(1)}%`);
    setRow(3, 'Transmitted, exact theory', 'square-barrier formula, averaged over the packet', `${(q.packetTransmission(1.5, 6, settings.V0, BARRIER_A) * 100).toFixed(1)}%`);
  } else if (atomInfo) {
    setRow(1, 'Orbital', `n = ${atomInfo.n}, l = ${atomInfo.l} · ${atomInfo.n - atomInfo.l - 1} radial and ${atomInfo.l} angular nodes`, settings.orbital);
    setRow(2, 'Energy', 'Eₙ = −13.6 eV / n²', `${fmt(atomInfo.energy)} eV`);
    setRow(3, 'Average distance', '⟨r⟩ from the nucleus, in Bohr radii (0.053 nm)', `${fmt(q.meanRadius(atomInfo.n, atomInfo.l), 1)} a₀`);
  }
}
const labelPoint = new THREE.Vector3();
function updateLabels() {
  const rects = [$('story'), $('panel'), $('readout'), $('transport')].filter(el => el.offsetParent).map(el => el.getBoundingClientRect());
  const pin = (id, p, show) => positionLabel($(id), labelPoint.set(...p), camera, {show, avoid: rects});
  const name = settings.experiment, yEdge = LY / 2 - ABSORB * DX;
  $('label-barrier-text').textContent = name === 'tunnel' ? `Barrier V₀ = ${fmt(settings.V0)}` : 'Wall with two slits';
  pin('label-barrier', toWorld(.5, -yEdge, name === 'tunnel' ? settings.V0 * E_SCALE + .2 : 2.1), name === 'tunnel' || name === 'slits');
  pin('label-energy', toWorld(-yEdge * 1.2, yEdge, 1.125 * E_SCALE + .15).map((v, i) => i === 2 ? zMax + .15 : v), name === 'tunnel');
  pin('label-screen', toWorld(DETECTOR_X, yEdge, 2.05), name === 'slits' && layers.detector);
  pin('label-nucleus', [0, -.35, 0], name === 'atom');
}

const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
function cellAt(clientX, clientY) {
  if (settings.experiment === 'atom') return null;
  pointer.set(clientX / innerWidth * 2 - 1, -(clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  if (!raycaster.ray.intersectPlane(plane, hit)) return null;
  const [i, j] = cellOf(hit.x / S, -hit.z / S);
  if (i < ABSORB || j < ABSORB || i >= NX - ABSORB || j >= NY - ABSORB) return null;
  return [i, j];
}
function describe([i, j]) {
  const k = j * NX + i, p = wave.re[k] ** 2 + wave.im[k] ** 2, phase = Math.atan2(wave.im[k], wave.re[k]) * 180 / Math.PI;
  return `<h4>Here</h4>
    <div class="row"><span>Probability density |ψ|²</span><span>${(p * 1000).toFixed(2)} per 1000 units²</span></div>
    <div class="row"><span>Phase of ψ</span><span>${phase.toFixed(0)}°</span></div>
    <div class="row"><span>Potential V</span><span>${wave.V[k].toFixed(2)}</span></div>
    <div class="note">The chance of finding the particle in a small patch is |ψ|² × its area.</div>`;
}
let downAt = null;
$('scene').addEventListener('pointermove', event => {
  if (event.pointerType !== 'mouse' || event.buttons) return;
  const c = cellAt(event.clientX, event.clientY);
  showTip(event.clientX, event.clientY, c && describe(c));
});
$('scene').addEventListener('pointerdown', event => { downAt = [event.clientX, event.clientY]; controls.autoRotate = false; });
$('scene').addEventListener('pointerup', event => {
  if (!downAt || Math.hypot(event.clientX - downAt[0], event.clientY - downAt[1]) > 6 || event.pointerType === 'mouse') return;
  const c = cellAt(event.clientX, event.clientY);
  showTip(event.clientX, event.clientY, c && describe(c));
});
$('scene').addEventListener('pointerleave', () => showTip(0, 0, null));

// ---------------------------------------------------------------- camera
const FRAMING = {
  surface: () => narrow() ? [0, 26, 25] : [0, 13, 15.5],
  // For the slits, look from the source side so the detector screen faces the camera.
  slits: () => narrow() ? [-14, 23, 23] : [-9.5, 12, 14.5],
  top: () => narrow() ? [0, 40, .5] : [0, 24, .5],
  atom: () => narrow() ? [0, 5, 24] : [0, 4, 15],
};
const offset = new THREE.Vector3(), target = new THREE.Vector3();
let offsetTween = null;
const TARGETS = {slits: [2, 0, 0]};
/** Pulls the camera back on narrow-aspect windows so the whole simulated area stays in view. */
function fitted(v, name) {
  if (name === 'atom') return v;
  const halfWidth = (LX / 2 - ABSORB * DX) * S + .5, tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect;
  return v.multiplyScalar(Math.max(1, halfWidth / tanHalf * (narrow() ? 1.08 : 1.35) / v.length()));
}
function setFraming(name, animate = true) {
  target.set(...(TARGETS[name] ?? [0, 0, 0]));
  const to = fitted(new THREE.Vector3(...FRAMING[name]()), name);
  if (animate && !reducedMotion) offsetTween = {from: offset.clone(), to, u: 0};
  else { offset.copy(to); offsetTween = null; }
}
const framingNow = () => settings.experiment === 'atom' ? 'atom' : targetHeight < .5 ? 'top' : settings.experiment === 'packet' ? 'surface' : 'slits';
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
  group.dots.visible = layers.detector && settings.experiment === 'slits';
  for (const chip of document.querySelectorAll('.chip')) setPressed(chip, layers[chip.dataset.layer]);
}
function setView(top, announce = false) {
  targetHeight = top ? 0 : 1;
  if (reducedMotion) heightOn = targetHeight;
  setPressed($('view-surface'), !top);
  setPressed($('view-top'), top);
  if (announce) { setFraming(framingNow()); toast(top ? 'Seen from above: brightness is probability, colour is phase.' : 'Height shows probability.'); }
}
for (const name of Object.keys(q.ORBITALS)) {
  const b = document.createElement('button');
  b.textContent = name;
  b.dataset.orbital = name;
  b.onclick = () => { settings.orbital = name; buildAtom(); updateControls(); };
  $('orbitals').append(b);
}
function updateControls() {
  const name = settings.experiment;
  for (const b of document.querySelectorAll('[data-experiment]')) setPressed(b, b.dataset.experiment === name);
  for (const b of document.querySelectorAll('[data-orbital]')) setPressed(b, b.dataset.orbital === settings.orbital);
  const p = PARAM[name];
  $('param-group').hidden = !p;
  $('orbital-group').hidden = name !== 'atom';
  $('measure').hidden = name === 'atom';
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
  setFraming(framingNow());
  if (!playing) setPlaying(true);
}

$('play').onclick = () => setPlaying(!playing);
$('reset').onclick = () => chooseExperiment(settings.experiment);
$('measure').onclick = measure;
$('view-surface').onclick = () => setView(false, true);
$('view-top').onclick = () => setView(true, true);
$('reset-camera').onclick = () => setFraming(framingNow());
for (const b of document.querySelectorAll('[data-experiment]')) b.onclick = () => chooseExperiment(b.dataset.experiment);
for (const chip of document.querySelectorAll('.chip')) chip.onclick = () => { layers[chip.dataset.layer] = !layers[chip.dataset.layer]; applyLayers(); };
$('param').addEventListener('input', e => {
  const p = PARAM[settings.experiment];
  settings[p.key] = +e.target.value;
  // The slit gap changes live; momentum and barrier height send a fresh packet.
  setupExperiment(settings.experiment !== 'slits');
  if (settings.experiment === 'slits') clearDots();
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
  1: () => chooseExperiment('packet'), 2: () => chooseExperiment('slits'),
  3: () => chooseExperiment('tunnel'), 4: () => chooseExperiment('atom'),
  m: measure, M: measure, t: toggleView, T: toggleView,
  r: () => chooseExperiment(settings.experiment), R: () => chooseExperiment(settings.experiment),
});

const story = createStory({
  steps,
  onEnter(step, index) {
    settings.experiment = step.experiment;
    if (step.orbital) settings.orbital = step.orbital;
    applyLayers(step.layers);
    setupExperiment(true);
    setView(step.view === 'top');
    showPanel(index === steps.length - 1 && !narrow());
    setFraming(framingNow());
    showTip(0, 0, null);
    setPlaying(!reducedMotion);
  },
});

offset.copy(fitted(new THREE.Vector3(...FRAMING.surface()), 'surface'));
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
  surfaceMaterial.uniforms.heightScale.value = HEIGHT * heightOn;
  surfaceMaterial.uniforms.phaseMix.value += ((layers.phase ? 1 : 0) - surfaceMaterial.uniforms.phaseMix.value) * Math.min(1, dt * 4);
  group.props.scale.y = .2 + .8 * heightOn;
  flash.material.opacity *= .94;
  if (settings.experiment !== 'atom') writeTexture();

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
  window.__quantum = {wave, settings, measure, run(steps) { stepDebt += steps; const was = playing; playing = true; simulate(0); playing = was; }};
}
