// Guided tour for light as a wave. Each step picks an experiment, a view and the layers.
const sw = color => `<i class="swatch" style="--c:${color}"></i>`;
export const SWATCH = {up: '#c8541f', down: '#56612a', e: '#c8541f', b: '#2f3614', glass: '#e7a57f'};

export const steps = [
  {
    title: 'Light is a ripple of fields.',
    body: `<p>A charge shaking up and down, like the current in an antenna, tugs on the electric field around it. The disturbance spreads outward as a wave.</p>
      <p>The surface shows the electric field: ${sw(SWATCH.up)} up one way, ${sw(SWATCH.down)} down the other. It moves at the <b>speed of light</b>, because it <b>is</b> light. Here the frequency is 600 THz, about 600 million million wiggles a second: green light.</p>`,
    notice: 'The bracket is one wavelength long: its two markers ride the wave and rise and fall together. Change the frequency and the waves bunch up or stretch out.',
    maths: 'λ = c / f:  300 000 km/s ÷ 600 THz = 500 nm',
    experiment: 'antenna', view: 'surface', layers: {ruler: true},
  },
  {
    title: 'Electric and magnetic, together.',
    body: `<p>Far from its source, light becomes a straight-fronted wave. The arrows sample it along one line: ${sw(SWATCH.e)} the <b>electric</b> field points up and down, ${sw(SWATCH.b)} the <b>magnetic</b> field side to side.</p>
      <p>They rise and fall together, at right angles to each other and to the direction of travel. A changing electric field makes a magnetic one, and a changing magnetic field makes an electric one. That is what keeps light going.</p>`,
    notice: 'The readout measures E / cB from the simulation: it stays at 1. The dark arrow marks the direction of travel.',
    maths: 'E = c B,  E ⟂ B ⟂ direction of travel',
    experiment: 'plane', view: 'surface', layers: {arrows: true, ruler: true},
  },
  {
    title: 'Waves add up.',
    body: `<p>Send a wave at a wall with two narrow slits. Each slit becomes a new source, and their waves overlap.</p>
      <p>Where crest meets crest the waves add into a <b>bright</b> band. Where crest meets trough they cancel into a <b>dark</b> one. The colours now show the average brightness.</p>`,
    notice: 'Bright and dark bands fan out and land on the screen at the far side. Narrow the slit gap and they spread further apart.',
    maths: 'bright where d sin θ = m λ',
    experiment: 'slits', view: 'top', layers: {intensity: true},
  },
  {
    title: 'Glass slows light down.',
    body: `<p>Inside glass ${sw(SWATCH.glass)} light travels at c / n, about two-thirds of its speed in air, so the waves <b>bunch up</b>.</p>
      <p>A lens is thickest in the middle, so the centre of each wavefront is held back the most. The fronts curve, and the light converges to a <b>focus</b>.</p>`,
    notice: 'Wavefronts tighten inside the glass and close in beyond it. Raise n to pull the focus closer.',
    maths: 'v = c / n,  λ in glass = λ / n',
    experiment: 'lens', view: 'surface', layers: {intensity: false},
  },
  {
    eyebrow: 'Explore freely',
    title: 'Your experiment.',
    body: `<p>Pick an experiment, change the <b>frequency</b> (and so the colour), the slit gap or the glass, and tap the surface to add ripples.</p>
      <p>Switch to <b>Top</b> view to read the pattern like a map, or turn on <b>Brightness</b> to see where the light ends up.</p>`,
    experiment: 'slits', view: 'surface', layers: {arrows: false, intensity: true},
  },
];
