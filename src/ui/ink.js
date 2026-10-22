// Ink on paper: the hand-drawn strike-through, the other phone's pen, the handwriting reveal and
// the paper grain. All of it is drawn here, from code; no image is used for any of it.

/** A small seeded PRNG so every item keeps the same stroke across renders and phones. */
function seeded(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 10000) / 10000; };
}

/**
 * One strike per line of text, in row coordinates: a quick ballpoint line that starts a little
 * before the word, rises slightly, wobbles once and overshoots the end (as a hand does).
 */
export function strikePath(seed, lines) {
  const r = seeded(seed);
  let d = '';
  for (const ln of lines) {
    const x0 = ln.left - 3 - r() * 5;
    const x1 = ln.right + 2 + r() * 7;
    const mid = ln.top + ln.height * (0.5 + (r() - 0.5) * 0.08);
    const rise = (r() * 0.6 + 0.35) * Math.min(6, ln.height * 0.09);
    const y0 = mid + rise;
    const y1 = mid - rise;
    const w = x1 - x0;
    const c1x = x0 + w * (0.28 + r() * 0.1);
    const c2x = x0 + w * (0.66 + r() * 0.1);
    const c1y = y0 + (r() - 0.5) * 3.2;
    const c2y = y1 + (r() - 0.5) * 3.2;
    d += `M${x0.toFixed(1)} ${y0.toFixed(1)}C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  }
  return d;
}

/** The line boxes of the text, relative to the row element. */
export function lineBoxes(row, txt) {
  const base = row.getBoundingClientRect();
  const boxes = [];
  for (const rc of txt.getClientRects()) {
    if (rc.width < 1) continue;
    // the visual middle of handwriting sits a bit below the box middle (descenders are rare)
    boxes.push({ left: rc.left - base.left, right: rc.right - base.left, top: rc.top - base.top + rc.height * 0.06, height: rc.height * 0.94 });
  }
  return boxes;
}

/** Lay the strike over the text. mode: 'still' (already struck), 'draw', 'remote', 'erase'. */
export function drawStrike(row, mode, opts = {}) {
  const txt = row.querySelector('.txt');
  const svg = row.querySelector('.strike');
  if (!txt || !svg) return;
  const path = svg.firstElementChild;
  const boxes = lineBoxes(row, txt);
  if (!boxes.length) return;
  path.setAttribute('d', strikePath(row.dataset.id || 'x', boxes));
  const len = path.getTotalLength();
  path.style.strokeDasharray = `${len}`;
  for (const a of path.getAnimations()) a.cancel();
  if (mode === 'still') { path.style.strokeDashoffset = '0'; return; }
  if (mode === 'none') { path.style.strokeDashoffset = `${len}`; return; }
  const reduce = opts.reduce;
  if (mode === 'erase') {
    path.style.strokeDashoffset = `${len}`;
    if (!reduce) path.animate([{ strokeDashoffset: 0, opacity: 0.92 }, { strokeDashoffset: -len * 0.15, opacity: 0 }], { duration: 220, easing: 'ease-in' });
    return;
  }
  const dur = mode === 'remote' ? Math.min(1100, 420 + len * 1.8) : Math.min(340, 150 + len * 0.6);
  path.style.strokeDashoffset = '0';
  if (reduce) return;
  path.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: dur, easing: mode === 'remote' ? 'cubic-bezier(.45,.05,.35,1)' : 'cubic-bezier(.3,.6,.2,1)' });
  if (mode === 'remote') ghostNib(row, path, len, dur);
}

/** While the other phone's strike draws itself, a pen tip travels with it. */
function ghostNib(row, path, len, dur) {
  let nib = row.querySelector('.nib');
  if (!nib) { nib = document.createElement('span'); nib.className = 'nib'; row.appendChild(nib); }
  const start = performance.now(); // wall clock, never per-frame deltas (the pane may throttle frames)
  const ease = (x) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);
  const step = (now) => {
    const k = Math.min(1, (now - start) / dur);
    const p = path.getPointAtLength(ease(k) * len);
    nib.style.transform = `translate(${p.x - 3.5}px, ${p.y - 3.5}px)`;
    nib.style.opacity = k < 0.92 ? '1' : String((1 - k) / 0.08);
    if (k < 1) requestAnimationFrame(step); else nib.style.opacity = '0';
  };
  requestAnimationFrame(step);
}

/** Follow a finger: 0..1 of the stroke drawn. */
export function strikeProgress(row, k) {
  const svg = row.querySelector('.strike');
  const path = svg && svg.firstElementChild;
  if (!path) return;
  if (!path.getAttribute('d')) {
    const txt = row.querySelector('.txt');
    path.setAttribute('d', strikePath(row.dataset.id || 'x', lineBoxes(row, txt)));
  }
  const len = path.getTotalLength();
  path.style.strokeDasharray = `${len}`;
  path.style.strokeDashoffset = `${len * (1 - Math.max(0, Math.min(1, k)))}`;
}

/** The other phone wrote this: reveal it left to right at handwriting speed. */
export function revealWriting(row, reduce) {
  const txt = row.querySelector('.txt');
  if (!txt || reduce) return;
  const n = txt.textContent.length;
  const dur = Math.max(380, Math.min(1500, n * 55));
  txt.animate([{ clipPath: 'inset(-20% 100% -20% 0)' }, { clipPath: 'inset(-20% 0 -20% 0)' }], { duration: dur, easing: 'cubic-bezier(.4,.1,.4,1)' });
}

/** A soft pulse on a row the other phone touched. */
export function touchPulse(row, reduce) {
  if (reduce) return;
  row.animate([{ backgroundColor: 'color-mix(in srgb, var(--ink) 10%, transparent)' }, { backgroundColor: 'transparent' }], { duration: 1400, easing: 'ease-out' });
}

/** Paper grain (or chalk dust) as an SVG data URI, set once on :root as --grain. */
export function grain(theme) {
  const chalk = theme === 'pizarron';
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n' x='0' y='0'><feTurbulence type='fractalNoise' baseFrequency='${chalk ? 0.9 : 0.75}' numOctaves='${chalk ? 2 : 3}' stitchTiles='stitch'/><feColorMatrix values='${chalk ? '0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .07 0' : '0 0 0 0 .32  0 0 0 0 .26  0 0 0 0 .16  0 0 0 .085 0'}'/></filter><rect width='220' height='220' filter='url(%23n)'/></svg>`;
  return `url("data:image/svg+xml;utf8,${svg.replace(/"/g, "'").replace(/#/g, '%23').replace(/\n/g, '')}")`;
}
