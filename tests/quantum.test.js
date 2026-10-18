import test from 'node:test';
import assert from 'node:assert/strict';
import * as q from '../dist/quantum/physics.js';

const close = (a, b, tol, message) => assert.ok(Math.abs(a - b) < tol, `${message ?? ''} ${a} vs ${b}`);

test('FFT matches a direct Fourier sum and inverts exactly', () => {
  const n = 16, plan = q.planFor(n), re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < n; i++) { re[i] = Math.sin(i * 1.3) + .2 * i; im[i] = Math.cos(i * .7); }
  const r0 = Float64Array.from(re), i0 = Float64Array.from(im);
  q.fft(re, im, plan);
  for (const k of [0, 3, 7, 12]) {
    let sr = 0, si = 0;
    for (let j = 0; j < n; j++) { const a = -2 * Math.PI * j * k / n; sr += r0[j] * Math.cos(a) - i0[j] * Math.sin(a); si += r0[j] * Math.sin(a) + i0[j] * Math.cos(a); }
    close(re[k], sr, 1e-10); close(im[k], si, 1e-10);
  }
  q.fft(re, im, plan, true);
  for (let i = 0; i < n; i++) { close(re[i], r0[i], 1e-12); close(im[i], i0[i], 1e-12); }
});

test('total probability is conserved', () => {
  const w = q.createWave({nx: 64, ny: 64, lx: 64, ly: 64, absorb: 0});
  w.setPotential((x, y) => x > 5 && x < 7 ? 1.5 : 0);
  w.setPacket({x0: -10, kx: 1.2, sx: 4, sy: 4});
  for (let s = 0; s < 300; s++) w.step();
  close(w.norm(), 1, 1e-10);
});

test('a free packet moves at ħk/m and spreads as σ√(1 + (t/2σ²)²)', () => {
  const k = 1.2, s0 = 3, w = q.createWave({nx: 512, ny: 8, lx: 256, ly: 8, dt: .1, absorb: 0});
  w.setPacket({x0: -60, kx: k, sx: s0, sy: 1e6});
  for (let s = 0; s < 500; s++) w.step();
  const {mean, sd} = w.statsX(), t = w.t;
  close(mean, -60 + k * t, .01, 'centre');
  close(sd, s0 * Math.sqrt(1 + (t / (2 * s0 * s0)) ** 2), .01, 'width');
});

test('tunnelling through a barrier matches the exact transmission', () => {
  const k0 = 1.5, sx = 8, V0 = 1.6, a = 1, w = q.createWave({nx: 1024, ny: 8, lx: 256, ly: 8, dt: .05, absorb: 0});
  w.setPotential(x => x >= 0 && x < a ? V0 : 0);
  w.setPacket({x0: -50, kx: k0, sx, sy: 1e6});
  for (let s = 0; s < 1500; s++) w.step();
  const T = w.probability(x => x >= a);
  const expected = q.packetTransmission(k0, sx, V0, a);
  assert.ok(expected > .2 && expected < .6, 'a sizeable but partial transmission');
  close(T, expected, .01, 'transmitted probability');
});

test('hydrogen radial functions are normalised, with the right mean radius', () => {
  for (const [n, l] of [[1, 0], [2, 0], [2, 1], [3, 1], [3, 2], [4, 3]]) {
    let norm = 0, mean = 0;
    for (let r = .0005; r < 120; r += .001) { const p = q.radial(n, l, r) ** 2 * r * r * .001; norm += p; mean += p * r; }
    close(norm, 1, 1e-4, `norm ${n}${l}`);
    close(mean, q.meanRadius(n, l), 2e-3, `<r> ${n}${l}`);
  }
  close(q.orbital('2p').energy, -3.4014, 1e-3, 'E₂ = −13.6/4 eV');
});

test('orbitals 1s and 2s are orthogonal; 2p has a node in its plane', () => {
  let overlap = 0;
  for (let r = .001; r < 60; r += .002) overlap += q.radial(1, 0, r) * q.radial(2, 0, r) * r * r * .002;
  close(overlap, 0, 1e-4, '⟨1s|2s⟩');
  const p = q.orbital('2p').psi;
  close(p(1, 1, 0), 0, 1e-12, 'pz vanishes at z = 0');
  assert.ok(p(0, 0, 2) > 0 && p(0, 0, -2) < 0, 'opposite signs on the two lobes');
});

test('a measurement finds the particle with the Born probability, and collapses the wave', () => {
  const w = q.createWave({nx: 64, ny: 64, lx: 64, ly: 64, absorb: 0});
  w.setPacket({x0: 0, y0: 0, sx: 4, sy: 4});
  const right = x => x > 0, before = w.probability(right);
  const yes = w.collapse(right, 0);
  close(yes.p, before, 1e-12, 'the Born probability of the region');
  assert.ok(yes.p > .4 && yes.p < .5, 'about half the packet is on the right');
  close(w.probability(right), 1, 1e-9, 'found: all of it is there now');
  w.setPacket({x0: 0, y0: 0, sx: 4, sy: 4});
  const no = w.collapse(right, .99);
  assert.equal(no.found, false);
  close(w.probability(right), 0, 1e-12, 'not found: none of it is there');
  close(w.norm(), 1, 1e-9);
});

test('sampling follows the weights', () => {
  const weights = [0, 1, 3, 0], counts = [0, 0, 0, 0];
  for (let k = 0; k < 4000; k++) counts[q.sampleIndex(weights, (k + .5) / 4000)]++;
  assert.equal(counts[0] + counts[3], 0);
  close(counts[2] / counts[1], 3, .01);
  assert.equal(q.sampleIndex([0, 0]), -1);
});

test('a packet in a harmonic well swings back after one period without spreading', () => {
  const omega = .2, w = q.createWave({nx: 128, ny: 64, lx: 96, ly: 48, dt: .1, absorb: 0});
  w.setPotential(q.harmonic(omega));
  const s = 1 / Math.sqrt(2 * omega);
  w.setPacket({x0: -12, y0: 0, sx: s, sy: s});
  const steps = Math.round(2 * Math.PI / omega / w.dt);
  for (let n = 0; n < steps / 2; n++) w.step();
  close(w.statsX().mean, 12, .3, 'half a period: on the other side');
  for (let n = 0; n < steps / 2; n++) w.step();
  const st = w.statsX();
  close(st.mean, -12, .3, 'back where it started');
  close(st.sd, s, .05, 'same width: a coherent state');
});
