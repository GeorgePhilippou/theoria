// Entropy and time's arrow: a live, exactly reversible gas of colliding atoms.
import * as THREE from 'three';
import {createStage} from '../shared/stage.js';
import {$, toast, setPressed, reducedMotion, createStory, bindDialog, positionLabel, bindKeys, showTip} from '../shared/shell.js';
import * as gasLib from './physics.js';
import {steps} from './story.js';

const BOX = {w: 24, h: 14};
const BINS = 30;            // bars in the speed chart
const CELLS = {cols: 8, rows: 5};
const NUDGE = 3;            // integer units, 3 × 10⁻⁷: about a millionth of an atom's width
const TIME_RATE = 3;        // simulated time units per second at 1×
const RATES = [.5, 1, 2, 4];
const COLOR = {fwd: '#a9dfee', back: '#c9b8ff', max: '#8b9cae', left: 0xffb46b, right: 0x7fe0f0};
const HIST = {z: -BOX.h / 2 - 1.6, x0: -BOX.w / 2 + .6, x1: BOX.w / 2 - .6, height: 7};

const settings = {experiment: 'spread', atoms: 400, rate: 1, nudge: false};
const layers = {cells: true, histogram: false, origin: false, track: false};
const narrow = () => innerWidth <= 720;
let playing = !reducedMotion, stepDebt = 0, gas, kTref = 1, s0 = 0, start = null, tracked = 0;
let autoReverse = null;    // {at, nudge} from the tour, armed until it fires
let history = [];          // entropy samples [{t, s, dir}]
let latest = {total: 0, max: 0};

// ---------------------------------------------------------------- stage
const stage = createStage({
  canvas: $('scene'), fallback: $('fallback'), bloom: {strength: .45, radius: .5, threshold: .78},
  viewShift: () => {
    // Desktop: move the box right, so the half where the gas starts is not under the tour card.
    if (!narrow()) return [Math.min(170, innerWidth * .11), 30];
    const top = $('story').getBoundingClientRect().bottom;
    const below = [$('readout'), $('transport')].find(el => el.offsetParent);
    return [0, Math.round((top + below.getBoundingClientRect().top) / 2 - innerHeight / 2)];
  },
});
const {scene, camera, controls} = stage;
Object.assign(controls, {minDistance: 8, maxDistance: 150, maxPolarAngle: Math.PI * .47});
const toWorld = (x, y, target = new THREE.Vector3(), h = 0) => target.set(x - BOX.w / 2, h, BOX.h / 2 - y);

// ---------------------------------------------------------------- the box
const floorTexture = new THREE.DataTexture(new Uint8Array(CELLS.cols * CELLS.rows * 4), CELLS.cols, CELLS.rows, THREE.RGBAFormat);
floorTexture.colorSpace = THREE.SRGBColorSpace;
floorTexture.magFilter = floorTexture.minFilter = THREE.NearestFilter;
{
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(BOX.w, BOX.h), new THREE.MeshBasicMaterial({map: floorTexture}));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), new THREE.MeshBasicMaterial({color: 0x05080e}));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -.02;
  scene.add(ground);
  const glass = new THREE.MeshStandardMaterial({color: 0xbfd8ee, transparent: true, opacity: .14, roughness: .1, metalness: .1, depthWrite: false});
  const height = .55, t = .08;
  for (const [w, d, x, z] of [[BOX.w + 2 * t, t, 0, BOX.h / 2 + t / 2], [BOX.w + 2 * t, t, 0, -BOX.h / 2 - t / 2], [t, BOX.h, BOX.w / 2 + t / 2, 0], [t, BOX.h, -BOX.w / 2 - t / 2, 0]]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, height, d), glass);
    wall.position.set(x, height / 2, z);
    scene.add(wall);
  }
  const X = BOX.w / 2, Z = BOX.h / 2, rim = [];
  for (const y of [0, height]) rim.push(-X, y, -Z, X, y, -Z, X, y, -Z, X, y, Z, X, y, Z, -X, y, Z, -X, y, Z, -X, y, -Z);
  stage.line({color: 0xcfe6ff, width: 1.3, opacity: .45, segments: true}).set(rim);
}
// Faint lines between the counting cells.
const cellLines = stage.line({color: 0x8fb3d4, width: 1, opacity: .2, segments: true});
{
  const flat = [];
  for (let c = 1; c < CELLS.cols; c++) { const x = -BOX.w / 2 + c * BOX.w / CELLS.cols; flat.push(x, .004, -BOX.h / 2, x, .004, BOX.h / 2); }
  for (let r = 1; r < CELLS.rows; r++) { const z = -BOX.h / 2 + r * BOX.h / CELLS.rows; flat.push(-BOX.w / 2, .004, z, BOX.w / 2, .004, z); }
  cellLines.set(flat);
}
// The middle wall: down while the gas is confined, lifted (and faded) after.
const partition = new THREE.Mesh(new THREE.BoxGeometry(.1, .8, BOX.h), new THREE.MeshStandardMaterial({
  color: 0x9fd8ff, emissive: 0x3a7fb0, emissiveIntensity: .6, transparent: true, opacity: .6, roughness: .2,
}));
scene.add(partition);
let partitionLift = 0;

// ---------------------------------------------------------------- atoms
const MAX_ATOMS = 600;
const atoms = new THREE.InstancedMesh(new THREE.SphereGeometry(.16, 18, 12), new THREE.MeshStandardMaterial({roughness: .32, metalness: .05}), MAX_ATOMS);
atoms.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
atoms.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_ATOMS * 3), 3);
atoms.frustumCulled = false;
scene.add(atoms);
{
  const m = new THREE.Matrix4();
  for (let i = 0; i < MAX_ATOMS; i++) atoms.setMatrixAt(i, m);
}
const glow = stage.sprite(0xffffff, 1.1);
const trail = stage.line({color: 0xffffff, width: 1.6, opacity: .7, additive: true});
const TRAIL = 360;
let trailPoints = [];

const tmpColor = new THREE.Color();
/** Blue (slow) through pale (typical) to amber (fast), by speed relative to the gas's temperature. */
function speedColor(v, target = tmpColor) {
  const u = Math.min(1, v / (2.6 * Math.sqrt(kTref)));
  const a = [.12, .3, 1], b = [.78, .86, 1], c = [1, .52, .14];
  const [p, q, k] = u < .42 ? [a, b, u / .42] : [b, c, (u - .42) / .58];
  return target.setRGB(p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k, p[2] + (q[2] - p[2]) * k, THREE.SRGBColorSpace);
}

const position = new THREE.Vector3();
function updateAtoms() {
  const m = atoms.instanceMatrix.array, c = atoms.instanceColor.array;
  // On small screens the atoms are drawn larger than life so they stay visible.
  const size = narrow() ? 1.7 : 1;
  for (let i = 0; i < gas.n; i++) {
    m[i * 16] = m[i * 16 + 5] = m[i * 16 + 10] = size;
    const [x, y] = gas.position(i);
    toWorld(x, y, position, .16);
    m[i * 16 + 12] = position.x; m[i * 16 + 13] = position.y; m[i * 16 + 14] = position.z;
    if (layers.origin) tmpColor.set(gas.origin[i] ? COLOR.right : COLOR.left);
    else speedColor(Math.hypot(...gas.velocity(i)));
    c[i * 3] = tmpColor.r; c[i * 3 + 1] = tmpColor.g; c[i * 3 + 2] = tmpColor.b;
  }
  atoms.count = gas.n;
  atoms.instanceMatrix.needsUpdate = true;
  atoms.instanceColor.needsUpdate = true;

  const [tx, ty] = gas.position(tracked);
  toWorld(tx, ty, glow.position, .16);
  glow.visible = layers.track;
  if (layers.track) {
    const last = trailPoints.length ? trailPoints.slice(-3) : null;
    if (!last || Math.hypot(last[0] - glow.position.x, last[2] - glow.position.z) > .02) trailPoints.push(glow.position.x, .17, glow.position.z);
    if (trailPoints.length > TRAIL * 3) trailPoints.splice(0, trailPoints.length - TRAIL * 3);
    trail.set(trailPoints);
  }
  trail.setVisible(layers.track);
}

// ---------------------------------------------------------------- counting cells
const cellT = new Float32Array(CELLS.cols * CELLS.rows);
function updateCells() {
  const counts = new Float32Array(CELLS.cols * CELLS.rows), expect = gas.n / counts.length;
  for (let i = 0; i < gas.n; i++) {
    const [x, y] = gas.position(i);
    const c = Math.min(CELLS.cols - 1, Math.max(0, Math.floor(x / BOX.w * CELLS.cols)));
    const r = Math.min(CELLS.rows - 1, Math.max(0, Math.floor(y / BOX.h * CELLS.rows)));
    counts[r * CELLS.cols + c]++;
  }
  const data = floorTexture.image.data, base = [10, 15, 24], lit = [44, 82, 120];
  // In the heat experiment the cells become a thermal map: each is tinted by its atoms' average energy (kT),
  // smoothed over a few frames, from blue (cold, kT = 0.25) to amber (hot, kT = 2).
  const thermal = settings.experiment === 'heat';
  if (thermal) {
    const energy = new Float32Array(counts.length);
    for (let i = 0; i < gas.n; i++) {
      const [x, y] = gas.position(i), [u, v] = gas.velocity(i);
      const c = Math.min(CELLS.cols - 1, Math.max(0, Math.floor(x / BOX.w * CELLS.cols)));
      const r = Math.min(CELLS.rows - 1, Math.max(0, Math.floor(y / BOX.h * CELLS.rows)));
      energy[r * CELLS.cols + c] += (u * u + v * v) / 2;
    }
    for (let k = 0; k < counts.length; k++) if (counts[k]) cellT[k] += (energy[k] / counts[k] - cellT[k]) * .15;
  }
  // Texture row 0 lies along the floor's near edge, which is the gas's y = 0 edge.
  for (let k = 0; k < counts.length; k++) {
    if (thermal && layers.cells) {
      const u = Math.min(1, Math.max(0, Math.log(cellT[k] / gasLib.COLD) / Math.log(gasLib.HOT / gasLib.COLD)));
      const cold = [40, 80, 200], hot = [235, 140, 50];
      for (let j = 0; j < 3; j++) data[k * 4 + j] = base[j] + (cold[j] + (hot[j] - cold[j]) * u - base[j]) * .5;
    } else {
      const u = layers.cells ? Math.min(1, counts[k] / (2 * expect)) : 0;
      for (let j = 0; j < 3; j++) data[k * 4 + j] = base[j] + (lit[j] - base[j]) * u;
    }
    data[k * 4 + 3] = 255;
  }
  floorTexture.needsUpdate = true;
  cellLines.setVisible(layers.cells);
}

// ---------------------------------------------------------------- speed chart behind the box
const histGroup = new THREE.Group();
scene.add(histGroup);
const bars = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({roughness: .5, emissive: 0x111822}), BINS);
bars.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(BINS * 3), 3);
bars.frustumCulled = false;
histGroup.add(bars);
const curve = stage.line({color: 0xffffff, width: 2.4, opacity: .9, parent: histGroup});
const axis = stage.line({color: 0x8fb3d4, width: 1.2, opacity: .5, parent: histGroup});
axis.set([HIST.x0, .01, HIST.z, HIST.x1, .01, HIST.z]);
const histogram = new Float64Array(BINS), rawHistogram = new Float64Array(BINS);
let histScale = 1, vmax = 4, mbOverlap = 0;
const barMatrix = new THREE.Matrix4();
const peakPoint = new THREE.Vector3();

function updateHistogram(fresh) {
  vmax = 4 * Math.sqrt(kTref);
  gasLib.speedHistogram(gas, BINS, vmax, rawHistogram);
  const width = vmax / BINS, k = fresh ? 1 : .2;
  for (let b = 0; b < BINS; b++) histogram[b] += (rawHistogram[b] - histogram[b]) * k;
  // Heights as a probability density, so the bars and the curve share one scale.
  const kT = gasLib.temperature(gas);
  let tallest = 0, overlap = 0;
  for (let b = 0; b < BINS; b++) {
    tallest = Math.max(tallest, histogram[b] / gas.n / width);
    const lo = b * width, hi = b === BINS - 1 ? Infinity : lo + width;
    const exact = Math.exp(-lo * lo / (2 * kT)) - (hi === Infinity ? 0 : Math.exp(-hi * hi / (2 * kT)));
    overlap += Math.min(histogram[b] / gas.n, exact);
  }
  mbOverlap = overlap;
  const peak = gasLib.maxwell(Math.sqrt(kT), kT);
  const target = HIST.height / Math.max(tallest, peak * 1.1);
  histScale = fresh ? target : histScale + (target - histScale) * .08;
  const span = HIST.x1 - HIST.x0, bw = span / BINS;
  const c = bars.instanceColor.array;
  for (let b = 0; b < BINS; b++) {
    const h = Math.max(.002, histogram[b] / gas.n / width * histScale);
    barMatrix.makeScale(bw * .78, h, .3).setPosition(HIST.x0 + (b + .5) * bw, h / 2, HIST.z);
    bars.setMatrixAt(b, barMatrix);
    speedColor((b + .5) * width);
    c[b * 3] = tmpColor.r; c[b * 3 + 1] = tmpColor.g; c[b * 3 + 2] = tmpColor.b;
  }
  bars.instanceMatrix.needsUpdate = bars.instanceColor.needsUpdate = true;
  const flat = [];
  for (let s = 0; s <= 120; s++) {
    const v = vmax * s / 120;
    flat.push(HIST.x0 + span * s / 120, gasLib.maxwell(v, kT) * histScale, HIST.z + .2);
  }
  curve.set(flat);
  // The curve's label sits just above its tail, clear of the bars.
  const vLabel = 2.1 * Math.sqrt(kT);
  peakPoint.set(HIST.x0 + span * vLabel / vmax + 1.5, gasLib.maxwell(vLabel, kT) * histScale + 1.1, HIST.z + .2);
}

// ---------------------------------------------------------------- experiments and time
function setupExperiment() {
  gas = gasLib.experiment(settings.experiment, {n: settings.atoms, seed: 1 + settings.atoms});
  kTref = gasLib.temperature(gas);
  s0 = gasLib.entropy(gas, CELLS).total;
  start = Float64Array.from(gas.x);
  tracked = 0;
  trailPoints = [];
  history = [];
  stepDebt = 0;
  partitionLift = gas.partitioned ? 0 : 1;
  cellT.fill(0);
  for (let k = 0; k < cellT.length; k++) cellT[k] = (k % CELLS.cols) < CELLS.cols / 2 ? gasLib.HOT : gasLib.COLD;
  sample();
  updateHistogram(true);
  updateControls();
}

function sample() {
  latest = gasLib.entropy(gas, CELLS);
  const s = latest.total - s0;
  history.push({t: gas.t, s, dir: gas.direction});
  if (history.length > 4000) history = history.filter((_, k) => k % 2 === 0 || k === history.length - 1);
}

function reverseTime(nudge = settings.nudge) {
  // Sample the moment of reversal itself, so the chart's two curves meet there.
  gas.refresh();
  sample();
  gas.reverse(nudge ? NUDGE : 0, tracked);
  history.push({t: gas.t, s: history.at(-1).s, dir: gas.direction});
  const back = gas.direction < 0;
  toast(back ? (nudge ? 'Every velocity flipped, and one atom nudged by a millionth of its width.' : 'Every velocity flipped: time runs backwards.') : 'Time runs forwards again.');
  if (!playing) setPlaying(true);
  updateControls();
}

function simulate(dtFrame) {
  if (!playing) return;
  stepDebt += RATES[settings.rate] * TIME_RATE * Math.min(dtFrame, .05) / gas.dt;
  let stepped = false;
  while (stepDebt >= 1) {
    if (gas.direction < 0 && gas.index <= 0) {
      stepDebt = 0;
      setPlaying(false);
      const exact = gas.x.every((v, i) => v === start[i]);
      toast(exact ? 'Back to the start, exactly: every atom is where it began.' : 'The clock is back at zero, but the atoms are not back where they began.', 5200);
      break;
    }
    gas.step();
    stepDebt -= 1;
    stepped = true;
    if (autoReverse && gas.direction > 0 && gas.t >= autoReverse.at) {
      const {nudge} = autoReverse;
      autoReverse = null;
      reverseTime(nudge);
    }
  }
  if (stepped) { gas.refresh(); sample(); }
}

// ---------------------------------------------------------------- readout and chart
const chart = $('chart'), ctx = chart.getContext('2d');
function drawChart() {
  const dpr = Math.min(devicePixelRatio, 2), w = chart.clientWidth, h = chart.clientHeight;
  if (!w || !h) return;
  if (chart.width !== Math.round(w * dpr) || chart.height !== Math.round(h * dpr)) { chart.width = Math.round(w * dpr); chart.height = Math.round(h * dpr); }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const ceiling = Math.max(.05, latest.max - s0), tMax = Math.max(20, ...history.map(p => p.t)) * 1.04;
  const top = ceiling * 1.18, pad = 4;
  const X = t => pad + t / tMax * (w - 2 * pad), Y = s => h - pad - Math.max(-.05 * top, s) / top * (h - 2 * pad);
  ctx.strokeStyle = 'rgba(255,255,255,.08)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(pad, Y(0)); ctx.lineTo(w - pad, Y(0)); ctx.stroke();
  ctx.setLineDash([3, 4]);
  ctx.strokeStyle = COLOR.max;
  ctx.beginPath(); ctx.moveTo(pad, Y(ceiling)); ctx.lineTo(w - pad, Y(ceiling)); ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineWidth = 1.6;
  ctx.lineJoin = 'round';
  for (const dir of [1, -1]) {
    ctx.strokeStyle = dir > 0 ? COLOR.fwd : COLOR.back;
    ctx.beginPath();
    let drawing = false;
    for (let k = 1; k < history.length; k++) {
      const a = history[k - 1], b = history[k];
      if (b.dir !== dir) { drawing = false; continue; }
      if (!drawing) { ctx.moveTo(X(a.t), Y(a.s)); drawing = true; }
      ctx.lineTo(X(b.t), Y(b.s));
    }
    ctx.stroke();
  }
  const last = history.at(-1);
  if (last) {
    ctx.fillStyle = last.dir > 0 ? COLOR.fwd : COLOR.back;
    ctx.beginPath(); ctx.arc(X(last.t), Y(last.s), 3, 0, 2 * Math.PI); ctx.fill();
  }
}

// Tiny negative values are statistical noise around zero; they are shown as 0.00 rather than as a loss.
const fmt = (v, d = 2) => Math.abs(v) < .03 ? (0).toFixed(d) : `${v < 0 ? '−' : '+'}${Math.abs(v).toFixed(d)}`;
function updateReadout() {
  const gain = latest.total - s0, ceiling = latest.max - s0;
  $('r1').textContent = fmt(gain);
  $('r1-note').textContent = `per atom, in units of k · most possible ${fmt(ceiling)}`;
  if (settings.experiment === 'spread') {
    $('r2-name').textContent = 'In the left half';
    $('r2-note').textContent = gas.partitioned ? 'held by the wall' : 'half would be even';
    $('r2').textContent = `${Math.round(gasLib.leftFraction(gas) * 100)}%`;
    $('r2').className = '';
  } else if (settings.experiment === 'speeds') {
    $('r2-name').textContent = 'Like Maxwell–Boltzmann';
    $('r2-note').textContent = 'overlap of the speeds with the curve';
    $('r2').textContent = `${Math.round(mbOverlap * 100)}%`;
    $('r2').className = '';
  } else {
    const half = BOX.w / 2;
    $('r2-name').textContent = 'Temperature, left · right';
    $('r2-note').textContent = 'kT, the average energy per atom';
    $('r2').textContent = `${gasLib.temperature(gas, 0, half).toFixed(2)} · ${gasLib.temperature(gas, half, BOX.w).toFixed(2)}`;
    $('r2').className = 'text-value';
  }
  const exponent = gasLib.oddsExponent(gain, gas.n);
  $('r3').innerHTML = exponent < .3 ? 'even' : exponent < 3 ? `1 in ${Math.round(10 ** exponent)}` : `1 in 10<sup>${Math.round(exponent)}</sup>`;
  $('out-time').textContent = gas.t.toFixed(1);
  const back = gas.direction < 0;
  if ($('direction').classList.contains('back') !== back || !$('direction').innerHTML) {
    $('direction').innerHTML = back ? '← <span class="wide-only">backwards</span>' : '<span class="wide-only">forwards</span> →';
    $('direction').classList.toggle('back', back);
    $('time-badge').hidden = !back;
  }
  drawChart();
}

// ---------------------------------------------------------------- labels and tooltip
const labelPoint = new THREE.Vector3();
function updateLabels() {
  const rects = [$('story'), $('panel'), $('readout'), $('transport')].filter(el => el.offsetParent).map(el => el.getBoundingClientRect());
  const pin = (id, p, show) => positionLabel($(id), labelPoint.copy(p), camera, {show, avoid: rects});
  pin('label-wall', labelPoint.set(0, .9 + partitionLift * 2.2, BOX.h / 2), partitionLift < .5);
  pin('label-hist', labelPoint.set(HIST.x0 + 4, HIST.height + .9, HIST.z), layers.histogram);
  pin('label-mb', peakPoint, layers.histogram);
  $('label-atom-text').textContent = settings.nudge ? 'Nudged atom' : 'One atom';
  pin('label-atom', glow.position, layers.track);
}

const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2(), atomPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -.16), hit = new THREE.Vector3();
function atomAt(clientX, clientY) {
  pointer.set(clientX / innerWidth * 2 - 1, -(clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  if (!raycaster.ray.intersectPlane(atomPlane, hit)) return -1;
  let best = -1, bestD = .45;
  for (let i = 0; i < gas.n; i++) {
    const [x, y] = gas.position(i);
    toWorld(x, y, position, .16);
    const d = Math.hypot(position.x - hit.x, position.z - hit.z);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}
function describe(i) {
  const v = Math.hypot(...gas.velocity(i)), e = v * v / 2;
  return `<h4>${i === tracked && layers.track ? 'The atom you are following' : 'An atom'}</h4>
    <div class="row"><span>Speed</span><span>${v.toFixed(2)}</span></div>
    <div class="row"><span>Energy, ½mv²</span><span>${(e / kTref).toFixed(2)} kT</span></div>
    <div class="row"><span>Started on the</span><span>${gas.origin[i] ? 'right' : 'left'}</span></div>
    <div class="note">Typical speed √(2kT) ≈ ${Math.sqrt(2 * kTref).toFixed(2)}. Click to follow this atom.</div>`;
}
let downAt = null;
$('scene').addEventListener('pointermove', event => {
  if (event.pointerType !== 'mouse' || event.buttons) return;
  const i = atomAt(event.clientX, event.clientY);
  showTip(event.clientX, event.clientY, i >= 0 && describe(i));
  $('scene').classList.toggle('pointing', i >= 0);
});
$('scene').addEventListener('pointerdown', event => { downAt = [event.clientX, event.clientY]; });
$('scene').addEventListener('pointerup', event => {
  if (!downAt || Math.hypot(event.clientX - downAt[0], event.clientY - downAt[1]) > 6) return;
  const i = atomAt(event.clientX, event.clientY);
  if (i < 0) { showTip(0, 0, null); return; }
  tracked = i;
  trailPoints = [];
  layers.track = true;
  applyLayers();
  showTip(event.clientX, event.clientY, describe(i));
});
$('scene').addEventListener('pointerleave', () => showTip(0, 0, null));

// ---------------------------------------------------------------- camera
const FRAMING = {
  surface: () => narrow() ? [0, 40, 30] : [0, 17, 20],
  chart: () => narrow() ? [0, 20, 42] : [0, 8, 25],
  top: () => narrow() ? [0, 52, .5] : [0, 30, .5],
};
const TARGET = {surface: [0, 0, -.8], chart: [0, 2.8, -3], top: [0, 0, -.8]};
const offset = new THREE.Vector3(), target = new THREE.Vector3(0, 0, -.8);
let targetTween = null;
let offsetTween = null, topView = false;
/** Pulls the camera back on narrow-aspect windows so the whole box (and the chart behind it) stays in view. */
function fitted(v) {
  const halfWidth = (BOX.w + 3) / 2, tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect;
  return v.multiplyScalar(Math.max(1, halfWidth / tanHalf * (narrow() ? 1.12 : 1.6) / v.length()));
}
let framing = 'surface';
function setFraming(name, animate = true) {
  framing = name;
  const to = fitted(new THREE.Vector3(...FRAMING[name]())), aim = new THREE.Vector3(...TARGET[name]);
  if (animate && !reducedMotion) { offsetTween = {from: offset.clone(), to, u: 0}; targetTween = {from: target.clone(), to: aim}; }
  else { offset.copy(to); target.copy(aim); offsetTween = targetTween = null; }
}
controls.addEventListener('start', () => { offsetTween = targetTween = null; });

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
  histGroup.visible = layers.histogram;
  for (const chip of document.querySelectorAll('.chip')) setPressed(chip, layers[chip.dataset.layer]);
}
function setView(top, announce = false) {
  topView = top;
  setPressed($('view-surface'), !top);
  setPressed($('view-top'), top);
  if (announce) setFraming(top ? 'top' : layers.histogram ? 'chart' : 'surface');
}
function updateControls() {
  for (const b of document.querySelectorAll('[data-experiment]')) setPressed(b, b.dataset.experiment === settings.experiment);
  $('out-atoms').textContent = settings.atoms;
  $('atoms').value = settings.atoms;
  $('atoms').style.setProperty('--progress', `${(settings.atoms - 100) / 500 * 100}%`);
  $('out-rate').textContent = `${RATES[settings.rate]}×`;
  $('rate').value = settings.rate;
  $('rate').style.setProperty('--progress', `${settings.rate / 3 * 100}%`);
  $('nudge').checked = settings.nudge;
  $('reverse').classList.toggle('active', gas?.direction < 0);
}
function chooseExperiment(name) {
  settings.experiment = name;
  autoReverse = null;
  setupExperiment();
  if (!playing) setPlaying(true);
}
function restart() {
  setupExperiment();
  const step = steps[story.index];
  if (step.reverseAt && step.experiment === settings.experiment) autoReverse = {at: step.reverseAt, nudge: step.nudge};
  if (!playing) setPlaying(true);
}

$('play').onclick = () => {
  // Stopped at t = 0 while running backwards: play means "forwards again".
  if (!playing && gas.direction < 0 && gas.index <= 0) reverseTime(false);
  else setPlaying(!playing);
};
$('reset').onclick = restart;
$('reverse').onclick = () => { autoReverse = null; reverseTime(); };
$('view-surface').onclick = () => setView(false, true);
$('view-top').onclick = () => setView(true, true);
$('reset-camera').onclick = () => setFraming(topView ? 'top' : layers.histogram ? 'chart' : 'surface');
for (const b of document.querySelectorAll('[data-experiment]')) b.onclick = () => chooseExperiment(b.dataset.experiment);
for (const chip of document.querySelectorAll('.chip')) chip.onclick = () => {
  layers[chip.dataset.layer] = !layers[chip.dataset.layer];
  if (chip.dataset.layer === 'track') trailPoints = [];
  applyLayers();
};
$('atoms').addEventListener('input', e => { settings.atoms = +e.target.value; $('out-atoms').textContent = settings.atoms; });
$('atoms').addEventListener('change', () => { autoReverse = null; setupExperiment(); });
$('rate').addEventListener('input', e => { settings.rate = +e.target.value; updateControls(); });
$('nudge').addEventListener('change', e => { settings.nudge = e.target.checked; });
function showPanel(open) {
  $('panel').classList.toggle('sheet-closed', !open);
  $('panel-toggle').setAttribute('aria-expanded', String(open));
}
$('panel-toggle').onclick = () => showPanel($('panel').classList.contains('sheet-closed'));
bindDialog($('notes'), $('about'), () => setPlaying(false));
stage.onContextLost = () => setPlaying(false);
const toggleView = () => setView(!topView, true);
const reverseKey = () => { autoReverse = null; reverseTime(); };
bindKeys({
  ' ': () => $('play').onclick(),
  1: () => chooseExperiment('spread'), 2: () => chooseExperiment('speeds'), 3: () => chooseExperiment('heat'),
  b: reverseKey, B: reverseKey,
  t: toggleView, T: toggleView,
  r: restart, R: restart,
});

const story = createStory({
  steps,
  onEnter(step, index) {
    settings.experiment = step.experiment;
    if (step.nudge != null) settings.nudge = step.nudge;
    setupExperiment();
    autoReverse = step.reverseAt ? {at: step.reverseAt, nudge: step.nudge} : null;
    applyLayers(step.layers);
    showPanel(index === steps.length - 1 && !narrow());
    setView(false);
    setFraming(step.layers.histogram && index < steps.length - 1 ? 'chart' : 'surface');
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
  partitionLift += ((gas.partitioned ? 0 : 1) - partitionLift) * Math.min(1, dt * 5);
  partition.position.set(0, .4 + partitionLift * 2.4, 0);
  partition.material.opacity = .6 * (1 - partitionLift);
  partition.visible = partitionLift < .98;
  updateAtoms();
  updateCells();
  if (layers.histogram) updateHistogram(false);

  controls.update();
  offset.copy(camera.position).sub(controls.target);
  if (offsetTween) {
    offsetTween.u = Math.min(1, offsetTween.u + dt / 1.2);
    const k = offsetTween.u < .5 ? 2 * offsetTween.u ** 2 : 1 - (-2 * offsetTween.u + 2) ** 2 / 2;
    offset.lerpVectors(offsetTween.from, offsetTween.to, k);
    if (targetTween) target.lerpVectors(targetTween.from, targetTween.to, k);
    if (offsetTween.u === 1) offsetTween = targetTween = null;
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
  window.__entropy = {get gas() { return gas; }, settings, story, reverseTime, stage, partition, snap() { if (offsetTween) offsetTween.u = .999; partitionLift = gas.partitioned ? 0 : 1; }, run(seconds) { const was = playing; playing = true; simulate(0); stepDebt += seconds * RATES[settings.rate] * TIME_RATE / gas.dt; simulate(0); playing = was; }};
}
