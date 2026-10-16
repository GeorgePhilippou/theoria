// Rendering stage shared by Theoria concepts: renderer with bloom, lighting, fog,
// thick anti-aliased lines, glow sprites, sky and stars.
import * as THREE from 'three';
import {OrbitControls} from '../vendor/OrbitControls.js';
import {EffectComposer} from '../vendor/jsm/postprocessing/EffectComposer.js';
import {RenderPass} from '../vendor/jsm/postprocessing/RenderPass.js';
import {UnrealBloomPass} from '../vendor/jsm/postprocessing/UnrealBloomPass.js';
import {OutputPass} from '../vendor/jsm/postprocessing/OutputPass.js';
import {LineSegments2} from '../vendor/jsm/lines/LineSegments2.js';
import {LineSegmentsGeometry} from '../vendor/jsm/lines/LineSegmentsGeometry.js';
import {LineMaterial} from '../vendor/jsm/lines/LineMaterial.js';

export const BACKGROUND = 0x060a11;

/**
 * `viewShift()` returns [x, y] pixels to move the scene's centre, so it sits in the space
 * the interface panels leave free.
 */
export function createStage({canvas, fallback, fov = 38, viewShift = () => [0, 0], bloom = {}}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({canvas, antialias: true, powerPreference: 'high-performance'});
  } catch (error) {
    fallback.hidden = false;
    throw error;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BACKGROUND);
  scene.fog = new THREE.Fog(BACKGROUND, 30, 90);
  const camera = new THREE.PerspectiveCamera(fov, 1, .05, 400);
  const controls = new OrbitControls(camera, renderer.domElement);
  Object.assign(controls, {enableDamping: true, dampingFactor: .08, enablePan: false, rotateSpeed: .55, zoomSpeed: .8});

  scene.add(new THREE.HemisphereLight(0xc6dcff, 0x0a0e16, 1.1));
  const sun = new THREE.DirectionalLight(0xfff4e6, 2.2);
  sun.position.set(8, 14, 10);
  scene.add(sun);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(256, 256), bloom.strength ?? .7, bloom.radius ?? .6, bloom.threshold ?? .55);
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());

  const lineMaterials = new Set();
  const glow = glowTexture();

  const stage = {
    THREE, renderer, scene, camera, controls, composer, bloomPass, onContextLost: null,
    resize() {
      const w = innerWidth, h = innerHeight;
      renderer.setSize(w, h);
      composer.setSize(w, h);
      camera.aspect = w / h;
      const [dx, dy] = viewShift();
      if (dx || dy) camera.setViewOffset(w, h, -dx, -dy, w, h); else camera.clearViewOffset();
      camera.updateProjectionMatrix();
      for (const m of lineMaterials) m.resolution.set(w, h);
    },
    render() { composer.render(); },
    /** Fades the far end of the scene; call with the camera's distance to its target. */
    setFogFor(distance) {
      scene.fog.near = distance * .9;
      scene.fog.far = distance * 2.6;
    },
    /** Soft additive glow, for points of light. Bright enough to bloom. */
    sprite(color, size, parent = scene, {opacity = 1} = {}) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glow, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      s.scale.set(size, size, 1);
      parent.add(s);
      return s;
    },
    /**
     * A thick, anti-aliased line (width in CSS pixels). Returns a handle with set(flat, colors).
     * Points are a polyline, or pairs of separate segments when `segments` is true.
     * Buffers are reused between frames and grow only when needed.
     */
    line({color = 0xffffff, width = 2, opacity = 1, dashed = false, dash = [.3, .2], segments = false,
      vertexColors = false, additive = false, parent = scene} = {}) {
      const material = new LineMaterial({
        color: vertexColors ? 0xffffff : color, linewidth: width, transparent: true, opacity, dashed,
        dashSize: dash[0], gapSize: dash[1], vertexColors, depthWrite: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      });
      material.resolution.set(innerWidth, innerHeight);
      lineMaterials.add(material);
      let geometry = new LineSegmentsGeometry();
      const object = new LineSegments2(geometry, material);
      object.frustumCulled = false;
      object.visible = false;
      parent.add(object);
      let capacity = 0, positions, colorsBuffer, distances;
      function grow(n) {
        // A fresh geometry: three.js caches the instance limit of the first buffers it sees.
        geometry.dispose();
        geometry = new LineSegmentsGeometry();
        object.geometry = geometry;
        capacity = Math.max(16, 2 ** Math.ceil(Math.log2(n)));
        positions = new THREE.InstancedInterleavedBuffer(new Float32Array(capacity * 6), 6, 1);
        geometry.setAttribute('instanceStart', new THREE.InterleavedBufferAttribute(positions, 3, 0));
        geometry.setAttribute('instanceEnd', new THREE.InterleavedBufferAttribute(positions, 3, 3));
        if (vertexColors) {
          colorsBuffer = new THREE.InstancedInterleavedBuffer(new Float32Array(capacity * 6), 6, 1);
          geometry.setAttribute('instanceColorStart', new THREE.InterleavedBufferAttribute(colorsBuffer, 3, 0));
          geometry.setAttribute('instanceColorEnd', new THREE.InterleavedBufferAttribute(colorsBuffer, 3, 3));
        }
        if (dashed) {
          distances = new THREE.InstancedInterleavedBuffer(new Float32Array(capacity * 2), 2, 1);
          geometry.setAttribute('instanceDistanceStart', new THREE.InterleavedBufferAttribute(distances, 1, 0));
          geometry.setAttribute('instanceDistanceEnd', new THREE.InterleavedBufferAttribute(distances, 1, 1));
        }
      }
      const handle = {
        material, object, hidden: false,
        /** Replace the points (flat [x, y, z, …]) and optional per-point colours. */
        set(flat, colors) {
          const points = flat.length / 3 | 0;
          const count = segments ? points >> 1 : points - 1;
          if (count < 1) { object.visible = false; return handle; }
          if (count > capacity) grow(count);
          const p = positions.array, c = colorsBuffer?.array, d = distances?.array;
          let run = 0;
          for (let k = 0; k < count; k++) {
            const a = (segments ? 2 * k : k) * 3, b = a + 3;
            for (let j = 0; j < 3; j++) { p[k * 6 + j] = flat[a + j]; p[k * 6 + 3 + j] = flat[b + j]; }
            if (c && colors) for (let j = 0; j < 3; j++) { c[k * 6 + j] = colors[a + j]; c[k * 6 + 3 + j] = colors[b + j]; }
            if (d) {
              const len = Math.hypot(flat[b] - flat[a], flat[b + 1] - flat[a + 1], flat[b + 2] - flat[a + 2]);
              d[k * 2] = segments ? 0 : run;
              d[k * 2 + 1] = (segments ? 0 : run) + len;
              run += len;
            }
          }
          positions.needsUpdate = true;
          if (colorsBuffer) colorsBuffer.needsUpdate = true;
          if (distances) distances.needsUpdate = true;
          geometry.instanceCount = count;
          object.visible = !handle.hidden;
          return handle;
        },
        setVisible(on) { handle.hidden = !on; if (!on) object.visible = false; return handle; },
      };
      return handle;
    },
  };

  addSky(scene);
  addEventListener('resize', () => stage.resize());
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    fallback.hidden = false;
    stage.onContextLost?.();
  });
  stage.resize();
  return stage;
}

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d'), g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(.08, 'rgba(255,255,255,.9)');
  g.addColorStop(.25, 'rgba(255,255,255,.28)');
  g.addColorStop(.55, 'rgba(255,255,255,.06)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** A dark gradient sky with sparse stars. Decorative only: not a real sky. */
function addSky(scene) {
  const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {top: {value: new THREE.Color(0x0d1626)}, middle: {value: new THREE.Color(BACKGROUND)}, bottom: {value: new THREE.Color(0x030508)}},
    vertexShader: 'varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 middle; uniform vec3 bottom; varying vec3 vDir;
      void main() { float h = vDir.y; vec3 c = h > 0.0 ? mix(middle, top, smoothstep(0.0, 0.8, h)) : mix(middle, bottom, smoothstep(0.0, 0.6, -h));
      gl_FragColor = vec4(c, 1.0); }`,
  }));
  sky.renderOrder = -10;
  scene.add(sky);

  let seed = 7;
  const random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const positions = [], sizes = [];
  for (let i = 0; i < 1400; i++) {
    const a = random() * Math.PI * 2, z = random() * 2 - 1, d = 250, s = Math.sqrt(1 - z * z);
    positions.push(d * s * Math.cos(a), d * z, d * s * Math.sin(a));
    sizes.push(.4 + random() ** 4 * 2.2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));
  const stars = new THREE.Points(geometry, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false,
    vertexShader: `attribute float size; varying float vSize; void main() { vSize = size;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * 1.6; }`,
    fragmentShader: `varying float vSize; void main() { float d = length(gl_PointCoord - 0.5);
      gl_FragColor = vec4(vec3(0.72, 0.8, 0.95), smoothstep(0.5, 0.0, d) * min(1.0, 0.25 + vSize * 0.3)); }`,
  }));
  stars.renderOrder = -9;
  scene.add(stars);
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
