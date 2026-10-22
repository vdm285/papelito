// Which aisle of the supermarket an item belongs to, from the words the person wrote.
// The dictionary (public/dict/es-MX.json, built by tools/build-dict.mjs from sourced data and the
// override files in data/overrides/aisles/) maps phrases to aisles; this file only matches.
//
// Matching (docs/PIPELINES.md, "Aisles"):
// 1. fold: lowercase, no accents, ñ → n, only [a-z0-9] and spaces;
// 2. drop filler words (de, la, para, ...) and the quantity ("2 kg de");
// 3. stem every word the same way on both sides, so singular and plural meet
//    (tortilla/tortillas, limón/limones, nuez/nueces, chile/chiles);
// 4. the longest phrase found anywhere in the item wins; on a tie the earliest; then the exact
//    (unstemmed) spelling; then the dictionary's own order;
// 5. form words adjust the result: "chiles en lata" is pantry, "verduras congeladas" frozen;
// 6. otherwise, one cautious typo guess (one edit, words of 6+ letters, same first two letters,
//    all candidates in one aisle), marked as a guess;
// 7. otherwise "otr" (Otros).
// A correction made by hand on this list always wins (keyed by the folded, stemmed phrase).

import { splitQuantity } from './parse.js';

export const AISLES = ['fru', 'pan', 'car', 'lac', 'con', 'des', 'bot', 'beb', 'lim', 'hig', 'far', 'bbe', 'mas', 'otr'];

const FILLER = new Set('de del la el los las un una unos unas uno para con a al en y o mi tu su por que lo le les'.split(' '));

export function fold(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** One stem for singular and plural: drop a final s, then a final -e after l n r d j y i u, -ce → z. */
export function stem(w) {
  if (w.length > 3 && w.endsWith('s')) w = w.slice(0, -1);
  if (w.length > 3 && w.endsWith('ce')) return w.slice(0, -2) + 'z';
  if (w.length > 3 && w.endsWith('e') && 'lnrdjyiu'.includes(w[w.length - 2])) return w.slice(0, -1);
  return w;
}

/** The words of a phrase as matched: folded, stemmed, without filler. */
export function words(text) {
  return fold(text).split(' ').filter((w) => w && !FILLER.has(w)).map(stem);
}

export const keyOf = (text) => words(splitQuantity(text).what).join(' ');

/**
 * Build the lookup index once per dictionary.
 * dict = { aisles: [...ids in walking order], terms: { phrase: aisle | [aisle, emoji] }, forms: { word: { from|'*': to } } }
 */
export function buildIndex(dict) {
  const byFirst = new Map(); // first stemmed word → [{ words, aisle, emoji, raw, rank }]
  const singles = new Map(); // stemmed single words → Set(aisles), for typo guesses
  let rank = 0;
  for (const [raw, val] of Object.entries(dict.terms || {})) {
    const [aisle, emoji] = Array.isArray(val) ? val : [val, ''];
    const ws = words(raw);
    if (!ws.length || !AISLES.includes(aisle)) continue;
    const entry = { words: ws, aisle, emoji: emoji || '', raw: fold(raw), rank: rank++ };
    if (!byFirst.has(ws[0])) byFirst.set(ws[0], []);
    byFirst.get(ws[0]).push(entry);
    if (ws.length === 1 && ws[0].length >= 6) {
      if (!singles.has(ws[0])) singles.set(ws[0], new Set());
      singles.get(ws[0]).add(aisle);
    }
  }
  for (const list of byFirst.values()) list.sort((a, b) => b.words.length - a.words.length || a.rank - b.rank);
  const forms = new Map();
  for (const [w, rule] of Object.entries(dict.forms || {})) forms.set(stem(fold(w)), rule);
  return { byFirst, singles, forms, cache: new Map() };
}

/**
 * The aisle of one item. Returns { aisle, emoji, term, guess, key }.
 * `fixes` = this list's hand corrections { key: aisle }.
 */
export function aisleOf(text, index, fixes) {
  const { what } = splitQuantity(text);
  const ws = words(what);
  const key = ws.join(' ');
  if (fixes && Object.prototype.hasOwnProperty.call(fixes, key)) {
    const hit = lookup(ws, what, index);
    return { aisle: fixes[key], emoji: hit.emoji, term: hit.term, guess: false, key, fixed: true };
  }
  // a brand or a name with digits ("7 up", "v8") is tried whole first
  const whole = words(text);
  if (whole.join(' ') !== key) {
    const hit = lookup(whole, text, index);
    if (hit.aisle !== 'otr' && !hit.guess) return { ...hit, key };
  }
  return { ...lookup(ws, what, index), key };
}

function lookup(ws, original, index) {
  const ck = `${fold(original)}|${ws.join(' ')}`;
  if (index.cache.has(ck)) return index.cache.get(ck);
  const res = match(ws, original, index);
  if (index.cache.size > 2000) index.cache.clear();
  index.cache.set(ck, res);
  return res;
}

function match(ws, original, index) {
  const exact = ` ${fold(original)} `;
  let best = null;
  let bestPos = 0;
  for (let i = 0; i < ws.length; i++) {
    const cands = index.byFirst.get(ws[i]);
    if (!cands) continue;
    for (const c of cands) {
      if (best && c.words.length < best.words.length) break; // sorted longest first
      if (c.words.length > ws.length - i) continue;
      let ok = true;
      for (let j = 1; j < c.words.length; j++) if (ws[i + j] !== c.words[j]) { ok = false; break; }
      if (!ok) continue;
      if (!best || c.words.length > best.words.length) { best = c; bestPos = i; continue; }
      // same length: earliest position, then the exact spelling, then dictionary order
      if (i > bestPos) continue;
      const cExact = exact.includes(` ${c.raw} `);
      const bExact = exact.includes(` ${best.raw} `);
      if (cExact && !bExact) { best = c; bestPos = i; }
    }
  }
  if (best) return { aisle: applyForms(best.aisle, ws, index), emoji: best.emoji, term: best.raw, n: best.words.length, guess: false };
  const guess = typoGuess(ws, index);
  if (guess) return { aisle: applyForms(guess.aisle, ws, index), emoji: '', term: guess.term, guess: true };
  return { aisle: 'otr', emoji: '', term: '', guess: false };
}

function applyForms(aisle, ws, index) {
  for (const w of ws) {
    const rule = index.forms.get(w);
    if (!rule) continue;
    if (rule[aisle]) return rule[aisle];
    if (rule['*']) return rule['*'];
  }
  return aisle;
}

function typoGuess(ws, index) {
  let found = null;
  for (const w of ws) {
    if (w.length < 6) continue;
    for (const [term, aisles] of index.singles) {
      if (term[0] !== w[0] || term[1] !== w[1] || Math.abs(term.length - w.length) > 1) continue;
      if (osa(w, term) !== 1) continue;
      if (aisles.size !== 1) return null;
      const aisle = [...aisles][0];
      if (found && found.aisle !== aisle) return null;
      found = { aisle, term };
    }
    if (found) return found;
  }
  return null;
}

/** Optimal string alignment distance (Damerau-Levenshtein with adjacent transpositions). */
function osa(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/**
 * When one item holds several known products ("huevos leche pan", dictation without commas),
 * return the pieces so the app can offer "¿Separar en 3?". Only splits when every word group
 * is a known product and there are at least two; never splits on its own.
 */
export function splitHint(text, index) {
  const raw = fold(text).split(' ').filter(Boolean);
  if (raw.length < 2) return null;
  // greedy left-to-right segmentation by longest known phrase; "y" separates explicitly
  const pieces = [];
  let i = 0;
  while (i < raw.length) {
    if (raw[i] === 'y' || raw[i] === 'e') { i++; continue; }
    let took = 0;
    for (let n = Math.min(5, raw.length - i); n >= 1; n--) {
      const chunk = raw.slice(i, i + n);
      if (chunk.includes('y')) continue;
      const ws = chunk.filter((w) => !FILLER.has(w)).map(stem);
      if (!ws.length) continue;
      const hit = match(ws, chunk.join(' '), index);
      if (hit.aisle !== 'otr' && !hit.guess && hit.n === ws.length) { took = n; break; }
    }
    if (!took) return null; // an unknown word: do not offer to split
    pieces.push(raw.slice(i, i + took));
    i += took;
  }
  if (pieces.length < 2) return null;
  // give the pieces back in the person's own spelling (accents and capitals kept)
  const orig = String(text).trim().split(/\s+/);
  const out = [];
  let k = 0;
  for (const p of pieces) {
    while (k < orig.length && /^(y|e)$/i.test(orig[k])) k++;
    out.push(orig.slice(k, k + p.length).join(' ').replace(/[,;.]$/, ''));
    k += p.length;
  }
  return out.length === pieces.length && out.every(Boolean) ? out : null;
}
