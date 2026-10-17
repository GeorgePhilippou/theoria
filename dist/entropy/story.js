// Guided tour for entropy and time's arrow.
const sw = color => `<i class="swatch" style="--c:${color}"></i>`;

export const steps = [
  {
    title: 'Order spreads out.',
    body: `<p>Every atom of this gas starts in the left half of the box. When the wall lifts, they spread until they fill it, and they never crowd back into one side on their own.</p>
      <p><b>Entropy</b> counts the ways the atoms can be arranged that look the same to us. There are vastly more ways to be spread out than bunched up, so spreading is overwhelmingly likely.</p>`,
    notice: 'The entropy curve climbs, then levels off about ln 2 per atom higher. The shaded squares are the cells used to count arrangements.',
    maths: 'S = k ln W   ·   free expansion: ΔS = N k ln 2',
    experiment: 'spread', layers: {cells: true, histogram: false, origin: false, track: false},
  },
  {
    title: 'Speeds sort themselves out.',
    body: `<p>Now every atom starts at <b>exactly the same speed</b>, heading in a random direction. Each collision shares energy unevenly: one atom speeds up, the other slows down.</p>
      <p>Within moments the speeds settle into one particular spread, the <b>Maxwell–Boltzmann distribution</b>: the most likely way to share out the energy. This is what temperature means for atoms.</p>`,
    notice: 'Behind the box, the single tall bar of speeds melts into the curve, and stays there.',
    maths: 'f(v) = (v / kT) e^(−v² / 2kT)   (in 2D)',
    experiment: 'speeds', layers: {cells: false, histogram: true, origin: false, track: false},
  },
  {
    title: 'Heat flows from hot to cold.',
    body: `<p>Fast, <b>hot</b> atoms ${sw('#ff9c4a')} on the left; slow, <b>cold</b> atoms ${sw('#4f7dff')} on the right. When the wall lifts, collisions pass energy from fast atoms to slow ones until the whole box shares one temperature.</p>
      <p>No force pushes heat one way. Again it is the odds: there are far more ways to share energy evenly.</p>`,
    notice: 'The two temperatures in the readout meet. The gas sloshes a little first: that is a sound wave.',
    maths: 'ΔS = N k ln(T<sub>final</sub> / √(T<sub>hot</sub> T<sub>cold</sub>)) > 0',
    experiment: 'heat', layers: {cells: false, histogram: true, origin: false, track: false},
  },
  {
    title: 'Run it backwards.',
    body: `<p>Every collision obeys laws that work just as well <b>backwards</b>. So if every atom’s velocity is flipped, the gas should un-spread.</p>
      <p>It does. The atoms retrace their paths and gather back into the left half, <b>exactly</b>: this model is computed in whole numbers, so nothing is lost to rounding.</p>`,
    notice: 'At t = 16 time is reversed. The entropy curve retraces itself, in violet, all the way back to the start.',
    maths: 'Newton’s laws are unchanged by t → −t',
    experiment: 'spread', reverseAt: 16, nudge: false, layers: {cells: true, histogram: false, origin: false, track: true},
  },
  {
    title: 'Why time has an arrow.',
    body: `<p>The same again, but just before the reversal one atom ${sw('#ffffff')} is nudged by <b>a millionth of its width</b>. Every collision magnifies the error, it spreads to all the atoms, and the gas never gathers again.</p>
      <p>The laws themselves do not pick a direction of time. The arrow comes from the odds, and from the universe having begun in a very special, low-entropy state.</p>`,
    notice: 'This time the violet curve does not come back down. The readout gives the odds of the gas returning by chance.',
    maths: 'odds of a return by chance ≈ e<sup>−N ΔS / k</sup>',
    experiment: 'spread', reverseAt: 16, nudge: true, layers: {cells: true, histogram: false, origin: false, track: true},
  },
  {
    eyebrow: 'Explore freely',
    title: 'Your experiment.',
    body: `<p>Change the number of atoms, press <b>Reverse</b> at any moment, and turn the nudge on or off under <b>Layers</b>.</p>
      <p>Hover over an atom to read its speed; click one to follow its path. Fewer atoms make a return by chance less unlikely, but never likely.</p>`,
    experiment: 'spread', layers: {cells: true, histogram: true, origin: false, track: true},
  },
];
