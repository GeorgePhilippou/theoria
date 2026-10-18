// Exposures for the particle darkroom. Chamber coordinates: x from −64 to 64, y from −32 to 32 (ħ = m = 1).
// Each sets the walls, the emitter and the plate; after that you can aim, paint walls, look, and fire away.
import * as q from './physics.js';

const f2 = x => x.toFixed(2), f1 = x => x.toFixed(1);
export const WALL = 12;
const slitWall = (gap, open = [true, true]) => (x, y) => {
  if (Math.abs(x + 2) > .75) return 0;
  const s = gap / 2, a = Math.abs(y - s) < 1.1, b = Math.abs(y + s) < 1.1;
  return (a && open[0]) || (b && open[1]) ? 0 : WALL;
};

export const exposures = [
  {
    id: 'packet', label: 'A particle',
    title: 'A particle travels as a wave.',
    text: `<p>Press <b>Fire one</b>. The particle leaves the emitter as a <b>wave packet</b>: the dots show how likely it is to be found at each place. The packet moves and slowly spreads.</p>
      <p>When it reaches the plate it is found at <b>one</b> spot, never smeared out. Fire again: the next one lands somewhere else. Only the pattern of many is predictable.</p>`,
    formula: 'P(x) = |ψ(x)|²', note: 'the Born rule: probability from the wave',
    tries: ['Fire 100 and compare the spread of dots with the width of the wave.', 'Make the packet narrower: it spreads faster (the uncertainty principle).', 'Choose Look and click on the packet: you either find it or remove that part.'],
    emitter: {x: -40, y: 0, angle: 0, k: 1.4, width: 5}, plate: true,
    setup() {},
    insight(lab) {
      if (!lab.detections.length) return 'No particles yet: press <b>Fire one</b>.';
      const ys = lab.detections, m = ys.reduce((a, b) => a + b, 0) / ys.length, sd = Math.sqrt(ys.reduce((a, b) => a + (b - m) ** 2, 0) / ys.length);
      return `<b>${ys.length}</b> particles found. Their spread: <b>${f1(sd)}</b> units; the wave’s width at the plate: <b>${f1(lab.plateWidth())}</b>.`;
    },
  },
  {
    id: 'slits', label: 'Two slits',
    title: 'One particle at a time, through both slits.',
    text: `<p>Particles are fired at a wall with two slits, <b>one at a time</b>. Each lands on the plate as a single dot, apparently at random.</p>
      <p>Keep firing and bands appear: places no particle ever goes. Each particle’s wave went through <b>both</b> slits and interfered with itself.</p>`,
    formula: 'band spacing ≈ λ L / d,  λ = 2π / k', note: 'L: slits to plate, d: between the slits',
    tries: ['Press Keep firing and watch the bands build up dot by dot.', 'Raise the momentum: shorter waves, closer bands.', 'Try the next exposure, with one slit closed.'],
    emitter: {x: -40, y: 0, angle: 0, k: 2, width: 12}, plate: true,
    setup(lab) { lab.base((x, y) => slitWall(12)(x, y)); },
    insight(lab) {
      const lambda = 2 * Math.PI / lab.k, spacing = lambda * (lab.PLATE + 2) / 12;
      return `<b>${lab.detections.length}</b> particles. Predicted band spacing: <b>${f1(spacing)}</b> units (λ = ${f2(lambda)}).`;
    },
  },
  {
    id: 'oneslit', label: 'One slit',
    title: 'Close one slit and the bands vanish.',
    text: `<p>The same experiment with the lower slit closed. The wave spreads out from one slit only, and the particles land in a single broad patch.</p>
      <p>Opening the second slit gives the particles somewhere <b>more</b> to go, yet makes some places on the plate <b>less</b> likely. That only makes sense for waves.</p>`,
    formula: 'P₁₂ ≠ P₁ + P₂', note: 'probabilities do not add; waves do',
    tries: ['Fire 100, then go back to Two slits and compare.', 'Use Erase to reopen the closed slit.', 'Paint a wall to close the other slit too.'],
    emitter: {x: -40, y: 0, angle: 0, k: 2, width: 12}, plate: true,
    setup(lab) { lab.base((x, y) => slitWall(12, [true, false])(x, y)); },
    insight: lab => `<b>${lab.detections.length}</b> particles. One slit: one broad patch, no dark bands.`,
  },
  {
    id: 'tunnel', label: 'Tunnelling',
    title: 'Through a wall it cannot climb.',
    text: `<p>The particle’s energy is <b>below</b> the top of the barrier, so a ball would always bounce back. The wave mostly does, but a small part leaks through.</p>
      <p>Fire many: a few particles turn up on the far side. This <b>tunnelling</b> powers the Sun’s fusion and every flash memory chip.</p>`,
    formula: 'T ≈ e^(−2κa),  κ = √(2(V₀ − E))', note: 'falls off fast with barrier height and width',
    tries: ['Fire 100 and compare the share that got through with the exact value.', 'Lower the barrier height V₀: more get through.', 'Paint a thicker barrier and watch tunnelling all but stop.'],
    emitter: {x: -34, y: 0, angle: 0, k: 1.5, width: 7}, plate: true, barrier: 1.6,
    setup(lab) { lab.base(x => (x >= 0 && x < 1 ? lab.V0 : 0)); },
    insight(lab) {
      const E = lab.k * lab.k / 2, T = q.packetTransmission(lab.k, lab.SX, lab.V0, 1);
      const fired = lab.fired, got = lab.detections.length;
      return `Energy E = <b>${f2(E)}</b> is below the barrier V₀ = <b>${f2(lab.V0)}</b>. Exact share through: <b>${(T * 100).toFixed(1)}%</b>${lab.through != null ? `; the wave here: <b>${(lab.through * 100).toFixed(1)}%</b>` : ''}.${fired ? ` Plate: <b>${got}</b> of ${fired} particles (some that tunnel spread out of the chamber).` : ''}`;
    },
  },
  {
    id: 'well', label: 'In a well',
    title: 'A particle held in a bowl swings back and forth.',
    text: `<p>Here the particle sits in a bowl-shaped potential, like a ball on a spring. Released off-centre, its packet swings from side to side.</p>
      <p>This particular packet does not spread at all: it is a <b>coherent state</b>, the most classical a quantum particle can be. Fire a narrower or wider one and it breathes instead.</p>`,
    formula: 'period T = 2π / ω', note: 'the same for any swing size',
    tries: ['Drag the emitter further out: a bigger swing, the same period.', 'Change the packet width: it now breathes as it swings.', 'Aim the emitter sideways to make it circle.'],
    emitter: {x: -24, y: 0, angle: 0, k: .6, width: 2.9, still: true}, plate: false, omega: .06,
    setup(lab) { lab.base(q.harmonic(.06)); },
    insight(lab) {
      const T = 2 * Math.PI / .06;
      return `Period: <b>${f1(T)}</b> time units. Time since release: <b>${f1(lab.waveTime())}</b> (${f2(lab.waveTime() / T)} swings).`;
    },
  },
  {
    id: 'atom', label: 'Atom',
    title: 'An electron in an atom is a standing wave.',
    text: `<p>Inside a hydrogen atom the electron’s wave cannot travel away; it settles into fixed shapes called <b>orbitals</b>, each with its own energy. This print is a slice through the nucleus.</p>
      <p><b>Look</b> repeatedly: each look finds the electron at one spot. The dots build up the orbital. Ink and orange dots in the print mark the two signs of the wave.</p>`,
    formula: 'Eₙ = −13.6 eV / n²', note: 'n: the shell number',
    tries: ['Look 100 times, then switch orbital.', 'Find the nodes: surfaces where the electron is never found.', 'Compare 1s and 2s: 2s has a hidden inner shell.'],
    atom: true, orbital: '2p',
    setup() {},
    insight(lab) {
      const o = q.orbital(lab.orbital);
      return `${lab.orbital}: energy <b>${f2(o.energy)} eV</b>, average distance <b>${f1(q.meanRadius(o.n, o.l) * .0529)} nm</b>. <b>${lab.atomDots.length}</b> looks so far.`;
    },
  },
  {
    id: 'free', label: 'Free room',
    title: 'Your own experiment.',
    text: `<p>An empty chamber with an emitter and a plate. Paint walls and barriers, aim, set the momentum, and fire.</p>
      <p>Every particle obeys the same equation; the plate shows what many of them do together.</p>`,
    formula: 'i ∂ψ/∂t = −½ ∇²ψ + V ψ', note: 'the Schrödinger equation (ħ = m = 1)',
    tries: ['Build three slits.', 'Bounce the wave off a slanted wall onto the plate.', 'Make a corridor and send the wave down it.'],
    emitter: {x: -40, y: 0, angle: 0, k: 1.6, width: 6}, plate: true,
    setup() {},
    insight: lab => lab.fired ? `<b>${lab.fired}</b> fired, <b>${lab.detections.length}</b> found on the plate.` : '',
  },
];
