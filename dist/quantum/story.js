// Guided tour for quantum waves.
const sw = color => `<i class="swatch" style="--c:${color}"></i>`;

export const steps = [
  {
    title: 'A particle is a wave.',
    body: `<p>In quantum mechanics an electron is described by a wave, ψ. The <b>height</b> shows where you are likely to find it: the probability, |ψ|². The <b>colours</b> show the wave’s phase, the hidden rhythm that makes it interfere.</p>
      <p>The faster the particle, the tighter the colour bands. Left alone, the wave also <b>spreads out</b>.</p>`,
    notice: 'The bracket above the wave shows its spread. Press Measure: the wave collapses to one spot, then spreads again.',
    maths: 'λ = h / p  (de Broglie)',
    experiment: 'packet', view: 'surface', layers: {phase: true},
  },
  {
    title: 'Through two slits at once.',
    body: `<p>Fire electrons at a wall with two slits. The wave goes through <b>both</b> and interferes on the far side, just like light.</p>
      <p>But each electron arrives as a <b>single dot</b> at a random place. Only after many dots does the pattern of bright and dark stripes appear: the wave sets the odds, each detection is a roll of the dice.</p>`,
    notice: 'Watch the screen fill dot by dot. The curve on it counts the dots: its bumps are the stripes.',
    maths: 'probability of a dot ∝ |ψ|²',
    experiment: 'slits', view: 'surface', layers: {phase: true, detector: true},
  },
  {
    title: 'Through walls.',
    body: `<p>This barrier is higher than the particle’s energy. A ball would always bounce back.</p>
      <p>The wave <b>leaks into</b> the barrier and part of it comes out the other side: the particle <b>tunnels</b>. This is how the Sun fuses hydrogen and how some microchips store data.</p>`,
    notice: 'The labels split the wave into reflected and tunnelled parts. The readout compares the measured share with the exact formula. Raise the barrier and watch it fall.',
    maths: 'T ≈ e^(−2κa),  κ = √(2m(V₀ − E)) / ħ',
    experiment: 'tunnel', view: 'surface', layers: {phase: true},
  },
  {
    title: 'The shape of an atom.',
    body: `<p>An electron in an atom does not orbit like a planet. It forms a <b>standing wave</b> around the nucleus, and only certain shapes fit: these are the <b>orbitals</b>.</p>
      <p>Each dot is a place the electron could be found, drawn in proportion to the exact probability. ${sw('#c8541f')} and ${sw('#56612a')} mark opposite signs of the wave.</p>`,
    notice: 'Try 2s and 3p: the gaps (nodes) are places the electron is never found.',
    maths: 'Eₙ = −13.6 eV / n²',
    experiment: 'atom', orbital: '2p', view: 'surface', layers: {phase: true},
  },
  {
    eyebrow: 'Explore freely',
    title: 'Your experiment.',
    body: `<p>Change the momentum, the slit gap or the barrier, press <b>Measure</b> mid-flight, or pick any orbital.</p>
      <p>Switch to <b>Top</b> view to read the interference like a map. Hover over the wave to read its probability and phase.</p>`,
    experiment: 'slits', view: 'surface', layers: {phase: true, detector: true},
  },
];
