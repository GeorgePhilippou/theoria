// Three.js stage shared by every Theoria concept: renderer, camera, orbit controls and small helpers.
import * as THREE from 'three';
import {OrbitControls} from '../vendor/OrbitControls.js';

export const BACKGROUND = 0x070b12;

/**
 * Creates the renderer on `canvas`. `viewShift()` returns [x, y]: how many pixels to move the
 * scene's centre right and down, so it sits in the space the panels leave free.
 */
export function createStage({canvas, fallback, fov = 40, viewShift = () => [0, 0]}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({canvas, antialias: true, powerPreference: 'high-performance'});
  } catch (error) {
    fallback.hidden = false;
    throw error;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(BACKGROUND);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(fov, 1, .1, 220);
  const controls = new OrbitControls(camera, renderer.domElement);
  Object.assign(controls, {enableDamping: true, dampingFactor: .07, enablePan: false, rotateSpeed: .6});

  const glow = glowTexture();
  const stage = {
    THREE, renderer, scene, camera, controls,
    onContextLost: null,
    resize() {
      const w = innerWidth, h = innerHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      const [dx, dy] = viewShift();
      if (dx || dy) camera.setViewOffset(w, h, -dx, -dy, w, h); else camera.clearViewOffset();
      camera.updateProjectionMatrix();
    },
    render() { renderer.render(scene, camera); },
    /** Soft additive glow, for points of light. */
    sprite(color, size, parent = scene) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glow, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      s.scale.set(size, size, 1);
      parent.add(s);
      return s;
    },
    /** A line with a preallocated buffer of `capacity` points, filled later with setPoints(). */
    dynamicLine(capacity, color, opacity, {parent = scene, segments = false, vertexColors = false, additive = false} = {}) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(capacity * 3), 3));
      if (vertexColors) geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(capacity * 3), 3));
      geometry.setDrawRange(0, 0);
      const material = new THREE.LineBasicMaterial({
        color: vertexColors ? 0xffffff : color, vertexColors, transparent: true, opacity, depthWrite: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      });
      const line = new (segments ? THREE.LineSegments : THREE.Line)(geometry, material);
      line.frustumCulled = false;
      parent.add(line);
      return line;
    },
  };
  addEventListener('resize', () => stage.resize());
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    fallback.hidden = false;
    stage.onContextLost?.();
  });
  stage.resize();
  return stage;
}

/** Writes flat [x, y, z, …] values into a dynamicLine and sets how many points to draw. */
export function setPoints(line, flat, colors) {
  const position = line.geometry.attributes.position;
  const count = Math.min(Math.floor(flat.length / 3), position.count);
  for (let i = 0; i < count * 3; i++) position.array[i] = flat[i];
  position.needsUpdate = true;
  if (colors) {
    const color = line.geometry.attributes.color;
    for (let i = 0; i < count * 3; i++) color.array[i] = colors[i];
    color.needsUpdate = true;
  }
  line.geometry.setDrawRange(0, count);
}

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d'), g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(.12, 'rgba(255,255,255,.8)');
  g.addColorStop(.32, 'rgba(255,255,255,.2)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/** Sparse, deterministic background stars. Decorative only: they are not a real sky. */
export function addStarfield(scene, {count = 700, seed = 21, radius = 80} = {}) {
  const random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const positions = [];
  for (let i = 0; i < count; i++) {
    const a = random() * Math.PI * 2, z = random() * 2 - 1, d = radius + random() * 25, s = Math.sqrt(1 - z * z);
    positions.push(d * s * Math.cos(a), d * z, d * s * Math.sin(a));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const stars = new THREE.Points(geometry, new THREE.PointsMaterial({
    color: 0x9fb4cf, size: .08, transparent: true, opacity: .5, sizeAttenuation: true,
  }));
  scene.add(stars);
  return stars;
}

/** Visible-spectrum colour for a wavelength in nm (a common approximation), dimmed beyond 380–750 nm. */
export function spectrumColor(nm, target = new THREE.Color()) {
  let r = 0, g = 0, b = 0;
  if (nm < 440) { r = (440 - Math.max(nm, 380)) / 60; b = 1; }
  else if (nm < 490) { g = (nm - 440) / 50; b = 1; }
  else if (nm < 510) { g = 1; b = (510 - nm) / 20; }
  else if (nm < 580) { r = (nm - 510) / 70; g = 1; }
  else if (nm < 645) { r = 1; g = (645 - nm) / 65; }
  else r = 1;
  const edge = nm < 420 ? .35 + .65 * Math.max(0, nm - 380) / 40 : nm > 700 ? .35 + .65 * Math.max(0, 780 - nm) / 80 : 1;
  return target.setRGB(r * edge, g * edge, b * edge, THREE.SRGBColorSpace);
}
