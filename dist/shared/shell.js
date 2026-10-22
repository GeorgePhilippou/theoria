// Interface pieces shared by every Science You Can See concept: transport, guided tour, notes dialog, labels.

export const $ = id => document.getElementById(id);
export const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

let toastTimer;
export function toast(message, ms = 3800) {
  const el = $('toast');
  el.textContent = message;
  el.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('visible'), ms);
}

export function setPressed(button, on) {
  button.classList.toggle('active', on);
  button.setAttribute('aria-pressed', String(on));
}

const ICON_PLAY = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9.5-5.5z" fill="currentColor"/></svg>';
const ICON_PAUSE = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 2.5h3v11h-3zM9.5 2.5h3v11h-3z" fill="currentColor"/></svg>';

/** Play/pause, timeline scrubber and replay. Time advances by `speed` units per second. */
export function createTransport({max, speed = 2, onChange}) {
  const play = $('play'), scrub = $('scrub'), readout = $('time-readout');
  const state = {t: 0, playing: false};
  scrub.max = max;
  const render = () => {
    scrub.value = state.t;
    scrub.style.setProperty('--progress', `${state.t / max * 100}%`);
    readout.textContent = state.t.toFixed(1);
  };
  const setPlaying = on => {
    state.playing = on;
    play.innerHTML = on ? ICON_PAUSE : ICON_PLAY;
    play.setAttribute('aria-label', on ? 'Pause' : 'Play');
  };
  play.onclick = () => {
    if (state.t >= max) state.t = 0;
    setPlaying(!state.playing);
  };
  scrub.addEventListener('input', () => {
    setPlaying(false);
    state.t = +scrub.value;
    render();
    onChange?.();
  });
  $('replay').onclick = () => transport.restart();
  const transport = {
    get t() { return state.t; },
    get playing() { return state.playing; },
    setPlaying,
    restart(autoplay = !reducedMotion) {
      state.t = 0;
      setPlaying(autoplay);
      render();
      onChange?.();
    },
    tick(dt) {
      if (!state.playing) return;
      state.t = Math.min(max, state.t + dt * speed);
      if (state.t >= max) setPlaying(false);
      render();
    },
    /** Moves the time by dt and pauses (for keyboard stepping). */
    nudge(dt) {
      setPlaying(false);
      state.t = Math.max(0, Math.min(max, state.t + dt));
      render();
      onChange?.();
    },
    toggle() { play.onclick(); },
    /** Labelled marks on the timeline: [{t, label, color}]. */
    setMarkers(list) {
      const box = $('markers');
      if (!box) return;
      const key = list.map(m => `${m.label}@${m.t.toFixed(2)}`).join('|');
      if (box.dataset.key === key) return;
      box.dataset.key = key;
      box.innerHTML = '';
      let previous = -Infinity, below = false;
      for (const m of [...list].sort((a, b) => a.t - b.t)) {
        if (m.t < 0 || m.t > max) continue;
        // Labels closer than ~8% of the track alternate above and below it.
        below = m.t - previous < max * .08 ? !below : false;
        previous = m.t;
        const el = document.createElement('span');
        el.className = `marker${below ? ' below' : ''}${m.t / max > .8 ? ' end' : ''}`;
        el.style.left = `${m.t / max * 100}%`;
        el.style.setProperty('--c', m.color);
        el.innerHTML = `<i></i><b>${m.label}</b>`;
        box.append(el);
      }
    },
  };
  setPlaying(false);
  render();
  return transport;
}

/** The concepts in their suggested order, for the "next concept" link at the end of each tour. */
const CONCEPTS = [
  ['general-relativity', 'Curved spacetime'], ['special-relativity', 'Special relativity'],
  ['light', 'Light as a wave'], ['optics', 'Rays and lenses'], ['quantum', 'Quantum waves'], ['entropy', 'Entropy and time’s arrow'],
];
function nextConcept() {
  const here = location.pathname.split('/').filter(part => part && part !== 'index.html').at(-1);
  const k = CONCEPTS.findIndex(([slug]) => slug === here);
  return k < 0 ? null : CONCEPTS[(k + 1) % CONCEPTS.length];
}

/**
 * Guided tour. Each step has a title, body (trusted HTML), optional `notice` and `maths`.
 * `onEnter(step, index)` applies the step to the scene.
 */
export function createStory({steps, onEnter}) {
  const root = $('story');
  root.innerHTML = `
    <div class="story-head">
      <span class="eyebrow" id="story-count"></span>
      <button class="story-collapse" id="story-collapse" aria-expanded="true" aria-controls="story-body" aria-label="Hide explanation">
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 10l5-5 5 5" stroke="currentColor" stroke-width="1.6" fill="none"/></svg>
      </button>
    </div>
    <div class="story-body" id="story-body">
      <h1 id="story-title"></h1>
      <div class="story-text" id="story-text"></div>
      <button class="more-toggle" id="story-more" aria-expanded="false"><span class="wide-only">What to look for, and the maths</span><span class="narrow-only">Read more</span></button>
      <p class="notice" id="story-notice"></p>
      <p class="maths" id="story-maths"></p>
      <div class="story-nav">
        <button class="text-button" id="story-back">Back</button>
        <div class="dots" id="story-dots" aria-hidden="true"></div>
        <button class="primary-button" id="story-next">Next</button>
      </div>
    </div>`;
  const dots = $('story-dots');
  steps.forEach(() => dots.append(document.createElement('i')));
  let index = 0;

  function show(i) {
    index = Math.max(0, Math.min(steps.length - 1, i));
    const step = steps[index], last = index === steps.length - 1;
    $('story-count').textContent = step.eyebrow ?? `Guided tour · ${index + 1} of ${steps.length - 1}`;
    $('story-title').innerHTML = step.title;
    const next = last && nextConcept();
    $('story-text').innerHTML = step.body + (next ? `<a class="next-concept" href="../${next[0]}/"><span><small>Next concept</small>${next[1]}</span><span class="arrow" aria-hidden="true">→</span></a>` : '');
    $('story-notice').innerHTML = step.notice ? `<span>Look for</span>${step.notice}` : '';
    $('story-notice').hidden = !step.notice;
    $('story-maths').innerHTML = step.maths ? `<span>The maths</span>${step.maths}` : '';
    $('story-maths').hidden = !step.maths;
    // On phones the toggle also reveals the second paragraph.
    $('story-more').hidden = !step.notice && !step.maths && (step.body.match(/<p>/g) ?? []).length < 2;
    $('story-back').hidden = index === 0;
    $('story-next').textContent = last ? 'Restart tour' : index === steps.length - 2 ? 'Explore freely' : 'Next';
    [...dots.children].forEach((dot, j) => dot.classList.toggle('on', j === index));
    root.dataset.step = index;
    onEnter(step, index);
  }
  $('story-more').onclick = () => {
    const open = root.classList.toggle('more');
    $('story-more').setAttribute('aria-expanded', String(open));
    $('story-more').innerHTML = open ? 'Show less' : '<span class="wide-only">What to look for, and the maths</span><span class="narrow-only">Read more</span>';
  };
  $('story-back').onclick = () => show(index - 1);
  $('story-next').onclick = () => show(index === steps.length - 1 ? 0 : index + 1);
  $('story-collapse').onclick = () => {
    const open = root.classList.toggle('collapsed') === false;
    $('story-collapse').setAttribute('aria-expanded', String(open));
    $('story-collapse').setAttribute('aria-label', open ? 'Hide explanation' : 'Show explanation');
  };
  return {show, get index() { return index; }};
}

/** Opens the notes dialog from `button`; clicking the backdrop closes it. */
export function bindDialog(dialog, button, onOpen) {
  button.onclick = () => { dialog.showModal(); onOpen?.(); };
  dialog.querySelector('.close').onclick = () => dialog.close();
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close();
  });
}

/** Places an HTML label over a 3D point. Hidden when behind the camera, off-screen or covered by `avoid` rectangles. */
export function positionLabel(el, point, camera, {show = true, avoid = []} = {}) {
  if (!show) { el.style.visibility = 'hidden'; return; }
  const p = point.clone().project(camera);
  const x = (p.x * .5 + .5) * innerWidth, y = (-p.y * .5 + .5) * innerHeight;
  const covered = avoid.some(r => r && x > r.left - 12 && x < r.right + 12 && y > r.top - 12 && y < r.bottom + 12);
  const off = p.z > 1 || x < 8 || x > innerWidth - 60 || y < 60 || y > innerHeight - 110;
  el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
  el.classList.toggle('flip', x > innerWidth - 230 && innerWidth > 720);
  el.style.visibility = off || covered ? 'hidden' : 'visible';
}

/** Keyboard shortcuts, ignored while typing or when a dialog is open. */
export function bindKeys(map) {
  addEventListener('keydown', event => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.target.closest?.('input[type=text], textarea, dialog[open]')) return;
    const action = map[event.key] ?? map[event.code];
    if (!action) return;
    if (event.target.matches?.('input[type=range]') && event.key.startsWith('Arrow')) return;
    event.preventDefault();
    action(event);
  });
}

/** A small floating card next to the pointer, e.g. for inspecting an event. */
export function showTip(x, y, html) {
  const tip = $('tip');
  if (!html) { tip.classList.remove('visible'); return; }
  tip.innerHTML = html;
  tip.classList.add('visible');
  const w = tip.offsetWidth, h = tip.offsetHeight;
  const left = Math.min(innerWidth - w - 12, x + 16), top = Math.max(12, Math.min(innerHeight - h - 12, y - h - 12));
  tip.style.transform = `translate(${left}px, ${top}px)`;
}
