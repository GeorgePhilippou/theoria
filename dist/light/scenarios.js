// Experiments for the wave tank. Grid cells are 25 nm; the visible tank is cells 24–175 in each direction.
// Each sets sources, materials, probes A and B and an optional screen; after that everything can be moved or repainted.

const lensShape = (x0, t, a) => {
  const R = (a * a + t * t / 4) / t, c1 = x0 + R - t / 2, c2 = x0 - R + t / 2;
  return (i, j) => ((i - c1) ** 2 + (j - 100) ** 2 <= R * R && (i - c2) ** 2 + (j - 100) ** 2 <= R * R);
};
const slitWall = (i0, width, slits) => (i, j) => i >= i0 && i < i0 + width && slits.every(([c, w]) => Math.abs(j - c) > w / 2);

export const experiments = [
  {
    id: 'ripples', label: 'Ripples',
    title: 'Light is a ripple of electric and magnetic fields.',
    text: `<p>A tiny antenna at the centre shakes electric charge up and down 600 million million times a second. The field it makes spreads out as ripples, at the speed of light.</p>
      <p>The thin ink lines are the <b>crests</b>, where the electric field points most strongly out of the screen; between them are troughs. The distance from crest to crest is the <b>wavelength</b>. The shading fades with distance as the light spreads out.</p>`,
    formula: 'c = f λ', note: 'speed = frequency × wavelength',
    tries: ['Turn the frequency knob: higher frequency, shorter ripples, bluer light.', 'Drag probe B: when it is a whole number of wavelengths from A, the two traces move together.', 'Click Single pulse to send one ripple and watch it travel.'],
    setup(lab) { lab.point(100, 100); lab.probe('A', 118, 100); lab.probe('B', 148, 100); },
    insight(lab) {
      const d = lab.probeDistanceNm(), w = d / lab.lambdaNm();
      return `A and B are <b>${d.toFixed(0)} nm</b> apart: <b>${w.toFixed(2)}</b> wavelengths. ${Math.abs(w - Math.round(w)) < .12 ? 'They move in step.' : Math.abs(w - Math.round(w) - .5) < .12 || Math.abs(w - Math.round(w) + .5) < .12 ? 'They move in opposite directions.' : 'B lags A by part of a cycle.'}`;
    },
  },
  {
    id: 'two', label: 'Two sources',
    title: 'Waves add up: interference.',
    text: `<p>Two antennas, driven in step. Where a crest from one meets a crest from the other the light is bright; where a crest meets a trough they cancel, and it is dark.</p>
      <p>The shading shows the bright and dark bands fanning out; the screen on the right reads them. Follow the crest lines: they meet in step along the bright bands.</p>`,
    formula: 'bright where path difference = m λ', note: 'dark where it is (m + ½) λ',
    tries: ['Drag one source further from the other: more, closer lines.', 'Raise the frequency: the lines crowd together.', 'Put probe B on a dark band: its trace goes flat.'],
    setup(lab) { lab.point(56, 70); lab.point(56, 130); lab.probe('A', 150, 100); lab.probe('B', 120, 100); lab.screenAt(150); },
    insight(lab) {
      const n = lab.screenPeaks();
      return n ? `The screen shows <b>${n}</b> bright bands. Sources <b>${lab.sourceGapNm().toFixed(0)} nm</b> apart, wavelength <b>${lab.lambdaNm().toFixed(0)} nm</b>.` : 'Waiting for the pattern to build up on the screen…';
    },
  },
  {
    id: 'slits', label: 'Double slit',
    title: 'Young’s double slit.',
    text: `<p>A plane wave from the left meets a metal wall with two narrow slits. Each slit becomes a new source, and the two spread out and interfere.</p>
      <p>The screen on the right records alternating bright and dark bands. This experiment, by Thomas Young in 1801, proved that light is a wave.</p>`,
    formula: 'd sin θ = m λ', note: 'd: slit spacing, θ: angle of the m-th bright band',
    tries: ['Erase one slit’s bar of metal to make a wide gap, or paint one slit shut.', 'Turn the frequency down (redder light): the bands spread apart.', 'Paint glass over one slit: the pattern shifts sideways.'],
    gainFrom: 76,
    setup(lab) {
      lab.plane(30);
      lab.material(slitWall(70, 4, [[80, 10], [120, 10]]), 'metal');
      lab.probe('A', 150, 100); lab.probe('B', 100, 100); lab.screenAt(150);
    },
    insight(lab) {
      const n = lab.screenPeaks();
      return n ? `<b>${n}</b> bright bands on the screen. Slits 1.0 µm apart; wavelength <b>${lab.lambdaNm().toFixed(0)} nm</b>.` : 'The bands build up as light reaches the screen…';
    },
  },
  {
    id: 'glass', label: 'Into glass',
    title: 'In glass, light slows down and its waves bunch up.',
    text: `<p>A plane wave passes from air into a block of glass. Inside, it travels at <b>c / n</b>, two-thirds of its speed in air, so the crests crowd together: the wavelength shrinks by n.</p>
      <p>The frequency does not change. Compare the traces of probe A in air and B in glass: they keep exact time with each other.</p>`,
    formula: 'v = c / n,  λ = λ₀ / n', note: 'frequency unchanged',
    tries: ['Change the glass index with the slider, then repaint the block.', 'Look for the faint reflected ripple travelling back to the left.', 'Look closely in the air: about 4% is reflected, so faint stripes appear in the shading.'],
    setup(lab) {
      lab.plane(30);
      lab.material((i) => i >= 100, 'glass', 1.5);
      lab.probe('A', 70, 100); lab.probe('B', 140, 100);
    },
    insight(lab) {
      const l = lab.lambdaNm(), n = lab.indexAt('B');
      return `Wavelength <b>${l.toFixed(0)} nm</b> in air, <b>${(l / n).toFixed(0)} nm</b> in the glass (n = ${n.toFixed(2)}). Both probes oscillate at <b>${lab.freq} THz</b>.`;
    },
  },
  {
    id: 'refract', label: 'Refraction',
    title: 'Why light bends at a slanted surface.',
    text: `<p>Now the glass surface is tilted. One end of each wavefront enters the glass first and slows down while the rest is still in air, so the whole front swings round.</p>
      <p>That is <b>refraction</b>: the beam bends towards the normal. The ray picture on the Rays and lenses page is this, seen from far away.</p>`,
    formula: 'n₁ sin θ₁ = n₂ sin θ₂', note: 'Snell’s law, from the wave speeds',
    tries: ['Raise the glass index and repaint: the bend grows.', 'Paint metal in the glass to make a mirror inside it.', 'Use Ripple in the air to watch a single ripple bend.'],
    setup(lab) {
      lab.plane(30);
      lab.material((i, j) => i >= 92 + .7 * (j - 100), 'glass', 1.6);
      lab.probe('A', 60, 100); lab.probe('B', 150, 100);
    },
    insight(lab) {
      const n = 1.6, t1 = Math.atan(.7), t2 = Math.asin(Math.sin(t1) / n);
      return `The surface meets the waves at <b>${(t1 * 180 / Math.PI).toFixed(0)}°</b>; inside the glass the wavefronts turn to <b>${(t2 * 180 / Math.PI).toFixed(0)}°</b>, so the beam bends by <b>${((t1 - t2) * 180 / Math.PI).toFixed(0)}°</b>.`;
    },
  },
  {
    id: 'lens', label: 'Lens',
    title: 'A lens is a shaped delay.',
    text: `<p>A lens is thickest in the middle, so it delays the middle of each wavefront most. Flat fronts come out curved, closing in on one point: the <b>focus</b>.</p>
      <p>The light gathers into a bright spot, not a perfect point: no lens can focus light much smaller than about half a wavelength.</p>`,
    formula: 'spot size ≈ λ / (2 NA)', note: 'the diffraction limit',
    tries: ['Raise the frequency: the focal spot gets smaller.', 'Erase part of the lens and see the focus blur.', 'Paint a second lens behind the first.'],
    gainFrom: 104,
    setup(lab) {
      lab.plane(30);
      lab.material(lensShape(66, 32, 46), 'glass', 1.6);
      lab.probe('A', 138, 100); lab.probe('B', 138, 124); lab.screenAt(138);
    },
    insight(lab) {
      const w = lab.screenWidthNm();
      return w ? `The bright spot on the screen is about <b>${w.toFixed(0)} nm</b> wide (half-maximum); the wavelength is <b>${lab.lambdaNm().toFixed(0)} nm</b>.` : 'The light is gathering…';
    },
  },
  {
    id: 'mirror', label: 'Mirror',
    title: 'Metal reflects, and reflections make standing waves.',
    text: `<p>Light cannot get into a good conductor: its free electrons move and cancel the field. So the wave bounces back off the metal on the right.</p>
      <p>The outgoing and returning waves add up into a <b>standing wave</b>: bright lines half a wavelength apart, with dark lines between where the field never moves.</p>`,
    formula: 'nodes every λ / 2', note: 'and a node at the metal surface',
    tries: ['Turn off Crest lines to see the still standing-wave stripes.', 'Move probe B from a bright line to a dark one.', 'Paint a curved mirror and find where it focuses.'],
    setup(lab) {
      lab.plane(30);
      lab.material((i) => i >= 150, 'metal');
      lab.probe('A', 145, 100); lab.probe('B', 140, 100);
    },
    insight(lab) {
      return `Dark lines (nodes) every <b>${(lab.lambdaNm() / 2).toFixed(0)} nm</b>; the field is always zero at the metal surface.`;
    },
  },
  {
    id: 'free', label: 'Free tank',
    title: 'Your own experiment.',
    text: `<p>An empty tank with one source. Paint glass and metal, add up to four sources, place the probes and a screen, and see what Maxwell’s equations do.</p>
      <p>Everything you add obeys the same two equations, solved live.</p>`,
    formula: 'ε ∂E/∂t = ∇ × B,  ∂B/∂t = −∇ × E', note: 'Maxwell’s equations, in the units of the tank',
    tries: ['Paint a metal box with a small hole and put a source inside.', 'Build a glass prism and send a plane wave through it.', 'Make a slot thinner than a wavelength and see light squeeze through.'],
    setup(lab) { lab.point(70, 100); lab.probe('A', 110, 100); lab.probe('B', 140, 100); },
    insight: () => '',
  },
];
