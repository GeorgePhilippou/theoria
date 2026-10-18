// Reels for the time deck: each loads a gas, and may reverse time by itself at a set moment.
import * as gasLib from './physics.js';

const f2 = x => x.toFixed(2);

export const reels = [
  {
    id: 'spread', label: 'Spreading',
    title: 'Order spreads out, and never comes back by itself.',
    text: `<p>All the atoms start in the left half. At t = 1 the wall lifts and they spread until they fill the box. They never crowd back into one side on their own.</p>
      <p><b>Entropy</b> counts the arrangements that look the same to us. There are vastly more ways to be spread out than bunched up, so spreading is overwhelmingly likely.</p>`,
    formula: 'S = k ln W', note: 'free expansion: ΔS = N k ln 2',
    tries: ['Watch the needle climb, then sit near the dashed maximum.', 'Turn on Colour: speed. Fast and slow atoms mix too.', 'Click an atom to follow its path.'],
    kind: 'spread', n: 400,
    insight(lab) {
      const left = gasLib.leftFraction(lab.gas);
      return `<b>${Math.round(left * 100)}%</b> of the atoms are in the left half. Entropy has risen by <b>${f2(lab.rise())}</b> k per atom (ln 2 = 0.69).`;
    },
  },
  {
    id: 'speeds', label: 'Sharing energy',
    title: 'Speeds sort themselves out.',
    text: `<p>Every atom starts at <b>exactly the same speed</b>, in a random direction. Each collision shares energy unevenly: one speeds up, the other slows.</p>
      <p>Within moments the speeds settle into one particular spread, the <b>Maxwell–Boltzmann distribution</b>: the most likely way to share the energy out. That spread is what temperature means.</p>`,
    formula: 'f(v) = (v / kT) e^(−v² / 2kT)', note: 'in two dimensions',
    tries: ['Watch the single bar on the speed meter melt into the curve.', 'Reverse time: the speeds sort themselves back to one value.', 'Colour by speed to see fast and slow atoms everywhere.'],
    kind: 'speeds', n: 400,
    insight: lab => `Temperature kT = <b>${f2(lab.latest.kT)}</b>. Entropy has risen by <b>${f2(lab.rise())}</b> k per atom.`,
  },
  {
    id: 'heat', label: 'Hot and cold',
    title: 'Heat flows from hot to cold.',
    text: `<p>Fast, hot atoms on the left; slow, cold atoms on the right. When the wall lifts, collisions pass energy from fast atoms to slow ones until the whole box shares one temperature.</p>
      <p>No force pushes heat one way. It is the odds again: there are far more ways to share energy evenly.</p>`,
    formula: 'ΔS = N k ln(T_f / √(T_hot T_cold)) > 0', note: 'for equal amounts of the same gas',
    tries: ['Colour by speed and watch the two sides even out.', 'Compare the two temperatures in the readout as they meet.', 'Lower the wall again halfway: heat stops flowing.'],
    kind: 'heat', n: 400,
    insight(lab) {
      const g = lab.gas, l = gasLib.temperature(g, 0, g.width / 2), r = gasLib.temperature(g, g.width / 2, g.width);
      return `Left half kT = <b>${f2(l)}</b>, right half kT = <b>${f2(r)}</b> (they started at ${gasLib.HOT} and ${gasLib.COLD}).`;
    },
  },
  {
    id: 'reverse', label: 'Backwards',
    title: 'Run it backwards, and it un-spreads.',
    text: `<p>The same spreading gas, but at t = 20, once the box is full, every velocity is flipped. Newton’s laws work just as well backwards, so the atoms retrace their paths and gather back into the left half, <b>exactly</b>: the deck computes in whole numbers, so nothing is lost to rounding.</p>`,
    formula: 't → −t', note: 'the laws of motion do not mind',
    tries: ['Watch the chart: the orange curve retraces the olive one.', 'Press Reverse time yourself at any moment.', 'Now try the next reel, with a nudge.'],
    kind: 'spread', n: 400, autoReverse: {at: 20, nudge: false},
    insight(lab) {
      return lab.gas.direction < 0 ? `Running backwards. <b>${Math.round(gasLib.leftFraction(lab.gas) * 100)}%</b> of atoms are back in the left half.` : 'Running forwards; time reverses at t = 20.';
    },
  },
  {
    id: 'nudge', label: 'A millionth',
    title: 'Why time has an arrow.',
    text: `<p>Again the gas is reversed at t = 20, but first one atom is nudged by <b>a millionth of its width</b>. Every collision magnifies the error, it spreads to every atom, and the gas never gathers again.</p>
      <p>The laws do not pick a direction of time. The arrow comes from the odds, and from the universe having started in a very special, low-entropy state.</p>`,
    formula: 'odds of a return ≈ e^(−N ΔS / k)', note: 'N: the number of atoms',
    tries: ['Compare the chart with the previous reel.', 'Read the odds of the gas returning by chance.', 'Turn the nudge off and reverse again.'],
    kind: 'spread', n: 400, autoReverse: {at: 20, nudge: true}, nudge: true,
    insight(lab) {
      return lab.gas.direction < 0 ? `Reversed, with a nudge. <b>${Math.round(gasLib.leftFraction(lab.gas) * 100)}%</b> of atoms are in the left half; with a perfect reversal they would all return.` : 'Running forwards; time reverses at t = 20, with a nudge.';
    },
  },
  {
    id: 'few', label: 'A few atoms',
    title: 'With few atoms, the arrow is weak.',
    text: `<p>Only six atoms. They spread out too, but now chance often brings them all to one side for a moment: the entropy dips and recovers.</p>
      <p>For six atoms that happens about one moment in 32. With 400 atoms it would be 1 in 10¹²⁰; for a real gas, with 10²³ atoms, it never happens.</p>`,
    formula: 'P(all on one side) = 2 × (½)ᴺ', note: 'for N independent atoms',
    tries: ['Watch the chart: the entropy is jagged, not smooth.', 'Watch the count of how often they all bunch on one side.', 'Load more atoms in the Free deck and compare.'],
    kind: 'spread', n: 6, rate: 3,
    insight: lab => `Right now <b>${Math.round(lab.leftNow() * 6)}</b> of 6 are on the left. All six on one side: <b>${(lab.allLeftShare() * 100).toFixed(1)}%</b> of the time once spread out. Over a long run this settles near 3.1%.`,
  },
  {
    id: 'free', label: 'Free deck',
    title: 'Your own gas.',
    text: `<p>Choose how many atoms, how they start, and whether the middle wall has a gap. Reverse time whenever you like, with or without the nudge, and replay from the recording.</p>`,
    formula: 'ΔS ≥ 0', note: 'for an isolated system, overwhelmingly likely',
    tries: ['Make a wall with a gap: atoms leak through one by one.', 'Hot | cold with a gap: watch heat leak.', 'Reverse a large gas late: how much does it recover?'],
    kind: 'spread', n: 300, free: true,
    insight: lab => `Entropy has risen by <b>${f2(lab.rise())}</b> k per atom since the start.`,
  },
];
