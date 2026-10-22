// Build the aisle dictionary public/dict/es-MX.json from the committed sources and the human files.
// Offline, deterministic, Node built-ins only. Run: node tools/vocab/build.mjs (or npm run dict, which also checks).
// The pipeline is described in docs/PIPELINES.md ("Vocabulary").
//
// Inputs
//   data/vocab/sources/   qqp-productos.tsv, qqp-variedades.tsv (keep = 1 rows), qqp-marcas.tsv (PROFECO QQP, CC BY 4.0),
//                         enigh2024-gastos.csv (INEGI ENIGH 2024, Términos de Libre Uso), cldr49-emoji-es-MX.tsv (Unicode-3.0)
//   data/vocab/           aisles.tsv, map-qqp.tsv, map-qqp-products.tsv, map-enigh.tsv, synonyms.tsv, forms.tsv,
//                         drop.txt, brands-block.txt, brands-allow.txt (human)
//   data/overrides/aisles/<id>.txt   "+ término [= emoji]  # why" · "- término  # why" · "término > aba  # why"
// Priority when sources disagree: override > QQP product exception > QQP category > ENIGH > derived head noun > brand.
// Emoji: an override's choice, else an exact Unicode CLDR 49 es-MX name match (food, drink, household, medical, light;
// emoji version ≤ 13.0), else none. Never from CLDR keywords.
// Outputs
//   public/dict/es-MX.json (shipped) and data/vocab/build/{sources,conflicts,review,dropped}.tsv + report.json (evidence).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { words, AISLES } from '../../src/model/aisles.js';
import { VOCAB, SOURCES, OVERRIDES, BUILD, DICT, fold, accents, lines, readTsv, readList, mxDate, writeText, rel } from './lib.mjs';
import { scoreAll } from './score.mjs';

const t0 = performance.now();
const PRIO = { override: 6, synonym: 6, qqpProduct: 5, qqpCategory: 4, enigh: 3, derived: 2, brand: 1 };
const PRIO_NAME = { 6: 'override', 5: 'qqp-product', 4: 'qqp-category', 3: 'enigh', 2: 'derived-head', 1: 'brand' };
const MAX_EMOJI_VERSION = 13.0;
const AUTO_EMOJI = /^(food-.*|drink|household|medical|light & video)$/;
const BRAND_PURITY = 0.9; // a brand ships only if this share of its QQP rows falls in one aisle
const BRAND_MIN_ROWS = 300; // ... and it was seen at least this often in 20 months of price surveys
const HEAD_MIN = 2; // a head noun is derived when at least this many distinct source phrases start with it
const HEAD_AGREE = 0.75; // ... and this share of them agree on one aisle

const keyOf = (s) => words(s).join(' ');
const clean = (s) => String(s).toLowerCase().replace(/[´`’]/g, "'").replace(/\s+/g, ' ').trim();
const aisleRank = (a) => AISLES.indexOf(a);

// ------------------------------------------------------------------ evidence collectors
const terms = new Map(); // key → { key, cands: [{ display, aisle, prio, ref }] }
const dropped = []; // [term, aisle, reason, refs]
const review = []; // [kind, term, aisle, detail]
const conflicts = []; // [term, chosen, candidates]
const errors = []; // fatal problems in human files

function add(display, aisle, prio, ref) {
  display = clean(display);
  const key = keyOf(display);
  if (!key || !/[a-z]/.test(key)) return null;
  let t = terms.get(key);
  if (!t) terms.set(key, (t = { key, cands: [] }));
  t.cands.push({ display, aisle, prio, ref });
  return t;
}

// ------------------------------------------------------------------ human files
const aisles = readTsv(path.join(VOCAB, 'aisles.tsv')).rows.map((r) => ({ id: r.id, es: r.es, en: r.en, emoji: r.emoji, order: +r.order }));
aisles.sort((a, b) => a.order - b.order);
for (const a of AISLES) if (!aisles.find((x) => x.id === a)) errors.push(`aisles.tsv: missing aisle ${a}`);
const isAisle = (a) => AISLES.includes(a);

function readMap(file, keyCol) {
  const m = new Map();
  for (const r of readTsv(path.join(VOCAB, file)).rows) {
    if (r.aisle !== '-' && !isAisle(r.aisle)) errors.push(`${file}:${r._line}: unknown aisle "${r.aisle}"`);
    if (!r.why) errors.push(`${file}:${r._line}: no why`);
    m.set(keyCol === 'prefix' ? r.prefix : fold(r[keyCol]), { aisle: r.aisle, why: r.why, line: r._line, label: r[keyCol] });
  }
  return m;
}
const catMap = readMap('map-qqp.tsv', 'categoria');
const prodMap = readMap('map-qqp-products.tsv', 'producto');
const enighMap = [...readMap('map-enigh.tsv', 'prefix').entries()].sort((a, b) => b[0].length - a[0].length);
const listFile = (f) => readList(path.join(VOCAB, f)).map((x) => ({ ...x, file: f }));
const dropList = listFile('drop.txt');
const blockList = listFile('brands-block.txt');
const allowList = listFile('brands-allow.txt');
for (const x of [...dropList, ...blockList, ...allowList]) if (!x.why) errors.push(`${x.file}:${x.line}: no "# why"`);
const dropKeys = new Map();
for (const x of dropList) {
  const k = keyOf(x.text);
  if (dropKeys.has(k)) errors.push(`drop.txt:${x.line}: "${x.text}" is the same word to the matcher as line ${dropKeys.get(k).line}`);
  else dropKeys.set(k, x);
}
const blocked = new Set(blockList.map((x) => fold(x.text)));
const allowed = new Set(allowList.map((x) => fold(x.text)));

// ------------------------------------------------------------------ sources: header helpers
const header = (file) => readTsv(path.join(SOURCES, file)).comments;
const headerDate = (file) => ((header(file).find((l) => /^# retrieved:/.test(l)) || '').match(/\d{4}-\d{2}-\d{2}/) || [''])[0];

// ------------------------------------------------------------------ PROFECO QQP: generic products
const GENERIC = /^(otr[oa]s?|productos?|art[ií]culos?|servicios?|alimentos?)\b/i;
const GENERIC_ANY = /(^|\s)otr[oa]s?(\s|$)/i;
const LEADING_FILLER = /^(para|con|sin|de|del|en|a|al|y|o|el|la|los|las|no)(\s|$)/i;

function okPhrase(p, maxWords) {
  const ws = words(p);
  return ws.length > 0 && ws.length <= maxWords && /[a-z]/.test(fold(p)) && !GENERIC.test(p) && !GENERIC_ANY.test(p) && !LEADING_FILLER.test(p);
}
/** "Eutirox 100" → "Eutirox"; "Augmentin 12 H." → "Augmentin": a size or dose ends the name. */
function stripNumbers(s) {
  const toks = s.split(/\s+/);
  const i = toks.findIndex((t, j) => j > 0 && /^\d/.test(t));
  return (i > 0 ? toks.slice(0, i) : toks).join(' ');
}
/** Split a label at commas, and at " y " / " o " inside pieces of up to 9 words (longer pieces are one thing). */
function splitAlt(text) {
  const out = [];
  for (const piece of text.split(/\s*,\s*/)) {
    if (piece.trim().split(/\s+/).length <= 9) out.push(...piece.split(/\s+(?:y|o)\s+/));
    else out.push(piece);
  }
  return out.map((s) => s.trim()).filter(Boolean);
}
/** "Shampoo para Bebés/niños" → shampoo para bebés, shampoo para niños; "Paracetamol/cafeina" → paracetamol, cafeina. */
function splitSlash(text) {
  const parts = text.split(/\s*\/\s*/).filter(Boolean);
  if (parts.length < 2) return parts;
  const first = parts[0].split(/\s+/);
  return [parts[0], ...parts.slice(1).map((p) => (p.split(/\s+/).length === 1 && first.length >= 2 ? [...first.slice(0, -1), p].join(' ') : p))];
}
function qqpPhrases(label) {
  let l = label.replace(/\bP\/\s*/g, 'para ').replace(/\s+y\s+Similares$/i, '');
  l = l.split(/\.\s+/)[0].replace(/\.$/, '').trim(); // "Picot. Sal de Uvas" → Picot (the sub-line after ". " is a variant)
  const out = new Set();
  const parens = [...l.matchAll(/\(([^)]*)\)/g)].map((m) => m[1].trim()).filter(Boolean);
  const base = l.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  const pieces = splitAlt(base).flatMap(splitSlash);
  if (!/,|\s+o\s+|\//.test(base)) out.add(base);
  if (pieces.length > 1) for (const p of pieces) out.add(p);
  const m = fold(base).match(/^carne (pollo|res|cerdo|pavo|ternera)$/); // QQP writes "Carne Pollo" for carne de pollo
  if (m) { out.delete(base); out.add(`carne de ${m[1]}`); out.add(m[1]); }
  for (const p of parens) out.add(p);
  return [...new Set([...out].map(stripNumbers).map(clean))].filter((p) => okPhrase(p, 6));
}

const productAisle = new Map(); // fold(producto) → { aisle, prio, label } ('-' aisle = skipped)
const qqp = readTsv(path.join(SOURCES, 'qqp-productos.tsv')).rows;
for (const r of qqp) {
  const pk = fold(r.producto);
  const exc = prodMap.get(pk);
  const cat = catMap.get(fold(r.categoria));
  if (!exc && !cat) { review.push(['category-unmapped', r.producto, '', `QQP category "${r.categoria}" is not in map-qqp.tsv`]); continue; }
  const aisle = exc ? exc.aisle : cat.aisle;
  const prio = exc ? PRIO.qqpProduct : PRIO.qqpCategory;
  productAisle.set(pk, { aisle, prio, label: r.producto });
  if (aisle === '-') { dropped.push([r.producto, '', exc ? 'QQP product mapped to "-"' : `QQP category "${r.categoria}" mapped to "-"`, `qqp:${r.producto}`]); continue; }
  for (const p of qqpPhrases(r.producto)) add(p, aisle, prio, `qqp:${r.producto}`);
}
for (const [pk, e] of prodMap) if (!productAisle.has(pk)) review.push(['exception-unknown-product', e.label, e.aisle, `map-qqp-products.tsv:${e.line} names a product QQP does not have`]);

// QQP varieties ticked by a human (keep = 1)
const variedades = readTsv(path.join(SOURCES, 'qqp-variedades.tsv')).rows;
let varietyTerms = 0;
for (const r of variedades) {
  if (r.keep !== '1') continue;
  const pa = productAisle.get(fold(r.producto));
  if (!pa || pa.aisle === '-') { review.push(['variety-of-unmapped-product', r.variedad, '', `${r.producto} has no aisle`]); continue; }
  for (const t of (r.term || r.variedad).split('|').map(clean).filter(Boolean)) {
    if (!okPhrase(t, 6)) { review.push(['variety-term-rejected', t, pa.aisle, `qqp-variedades.tsv:${r._line}`]); continue; }
    if (add(t, pa.aisle, pa.prio, `qqp-var:${r.producto}/${r.variedad}`)) varietyTerms++;
  }
}

// ------------------------------------------------------------------ INEGI ENIGH 2024
function enighRows() {
  return lines(path.join(SOURCES, 'enigh2024-gastos.csv')).filter((l) => l && !l.startsWith('#')).slice(1).map((l) => {
    const m = l.match(/^([^,]+),"?(.*?)"?$/);
    return { code: m[1], label: m[2].replace(/""/g, '"') };
  });
}
function enighPhrases(label) {
  const l = label.replace(/,?\s*etc[eé]tera\.?/gi, '').replace(/\s*\(excepto[^)]*\)/gi, '').trim();
  const ci = l.indexOf(':');
  let head = ci >= 0 ? l.slice(0, ci).trim() : l;
  const tail = ci >= 0 ? l.slice(ci + 1).trim() : '';
  const out = new Set();
  for (const m of head.matchAll(/\(([^)]*)\)/g)) out.add(m[1].trim());
  head = head.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  if (!GENERIC.test(head)) {
    const pieces = splitAlt(head);
    if (pieces.length > 1) pieces.forEach((p) => out.add(p));
    else out.add(head);
  }
  if (tail) splitAlt(tail).forEach((p) => out.add(p)); // the examples after a colon: "Otros artículos desechables: bolsas para basura, ..."
  return [...out].map(clean).filter((p) => okPhrase(p, 4));
}
const enigh = enighRows();
for (const e of enigh) {
  const rule = enighMap.find(([p]) => e.code.startsWith(p));
  if (!rule || rule[1].aisle === '-') continue;
  for (const p of enighPhrases(e.label)) add(p, rule[1].aisle, PRIO.enigh, `enigh:${e.code}`);
}

// ------------------------------------------------------------------ drop list (before head nouns and brands)
function applyDrops() {
  for (const [key, x] of dropKeys) {
    const t = terms.get(key);
    if (!t) continue;
    const gone = t.cands.filter((c) => c.prio < PRIO.override);
    if (!gone.length) continue;
    t.cands = t.cands.filter((c) => c.prio >= PRIO.override);
    x.used = true;
    dropped.push([gone[0].display, [...new Set(gone.map((c) => c.aisle))].join('|'), `drop.txt:${x.line}: ${x.why}`, gone.map((c) => c.ref).join(' ; ')]);
  }
}
applyDrops();

// ------------------------------------------------------------------ derived head nouns
// "leche" is added when ≥ 2 distinct source phrases start with it ("leche condensada", "leche en polvo", ...) and ≥ 75 %
// of them agree on one aisle. Traced as "derived:" plus the phrases' references.
const STOP_HEADS = new Set(['para', 'otro', 'otra', 'producto', 'articulo', 'alimento', 'servicio'].map((w) => keyOf(w)));
{
  const heads = new Map(); // first word key → Map(phrase key → { aisle, display, refs })
  for (const t of terms.values()) {
    const ws = t.key.split(' ');
    if (ws.length < 2) continue;
    const src = t.cands.filter((c) => c.prio >= PRIO.enigh && c.prio < PRIO.override);
    if (!src.length) continue;
    const top = Math.max(...src.map((c) => c.prio));
    const best = src.filter((c) => c.prio === top);
    if (!heads.has(ws[0])) heads.set(ws[0], new Map());
    heads.get(ws[0]).set(t.key, { aisle: best[0].aisle, display: best[0].display.split(' ')[0], refs: [...new Set(src.map((c) => c.ref))] });
  }
  for (const [w, phrases] of heads) {
    if (STOP_HEADS.has(w) || w.length < 3 || phrases.size < HEAD_MIN) continue;
    const existing = terms.get(w);
    if (existing && existing.cands.length) continue;
    if (dropKeys.has(w)) { dropKeys.get(w).used = true; continue; }
    const counts = new Map();
    for (const p of phrases.values()) counts.set(p.aisle, (counts.get(p.aisle) || 0) + 1);
    const [aisle, n] = [...counts.entries()].sort((a, b) => b[1] - a[1] || aisleRank(a[0]) - aisleRank(b[0]))[0];
    const share = n / phrases.size;
    const list = [...phrases.keys()].sort();
    if (share < HEAD_AGREE) { review.push(['head-noun-held-back', w, aisle, `${Math.round(share * 100)}% of ${phrases.size} phrases: ${list.join(', ')}`]); continue; }
    const spell = new Map();
    for (const p of phrases.values()) if (p.aisle === aisle) spell.set(p.display, (spell.get(p.display) || 0) + 1);
    const display = [...spell.entries()].sort((a, b) => accents(b[0]) - accents(a[0]) || b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0][0];
    if (keyOf(display) !== w) continue; // "antiflu-des" is two words to the matcher: not a head noun
    const refs = [...new Set([...phrases.values()].filter((p) => p.aisle === aisle).flatMap((p) => p.refs))];
    add(display, aisle, PRIO.derived, `derived:${refs.slice(0, 4).join(',')}${refs.length > 4 ? `,+${refs.length - 4}` : ''}`);
    review.push(['head-noun-derived', display, aisle, `${Math.round(share * 100)}% of ${phrases.size} phrases: ${list.join(', ')}`]);
  }
}

// ------------------------------------------------------------------ CLDR names (also used for the common-word check)
const cldr = readTsv(path.join(SOURCES, 'cldr49-emoji-es-MX.tsv')).rows;
const emojiVersion = new Map(cldr.map((r) => [r.emoji, parseFloat(r.version)]));

// ------------------------------------------------------------------ QQP brands
const commonWords = new Set();
for (const t of terms.values()) if (t.cands.length) for (const w of t.key.split(' ')) commonWords.add(w);
for (const r of cldr) for (const w of words(r.name_es_MX)) commonWords.add(w);
let brandTerms = 0;
{
  const agg = new Map(); // fold(marca) → { spell: Map, rows, byAisle: Map, products: Set }
  for (const r of readTsv(path.join(SOURCES, 'qqp-marcas.tsv')).rows) {
    const pa = productAisle.get(fold(r.producto));
    if (!pa || pa.aisle === '-') continue;
    const bk = fold(r.marca);
    let b = agg.get(bk);
    if (!b) agg.set(bk, (b = { spell: new Map(), rows: 0, byAisle: new Map(), products: new Set() }));
    b.spell.set(r.marca, (b.spell.get(r.marca) || 0) + +r.rows);
    b.rows += +r.rows;
    b.byAisle.set(pa.aisle, (b.byAisle.get(pa.aisle) || 0) + +r.rows);
    b.products.add(r.producto);
  }
  for (const [bk, b] of [...agg.entries()].sort((x, y) => (x[0] < y[0] ? -1 : 1))) {
    const name = [...b.spell.entries()].sort((x, y) => y[1] - x[1])[0][0];
    const display = stripNumbers(clean(name)); // "Nan 1" → nan, "Heineken 0.0" → heineken
    const key = keyOf(display);
    const [aisle, n] = [...b.byAisle.entries()].sort((x, y) => y[1] - x[1] || aisleRank(x[0]) - aisleRank(y[0]))[0];
    const share = n / b.rows;
    const detail = `${[...b.byAisle.entries()].map(([a, m]) => `${a} ${Math.round((m / b.rows) * 100)}%`).join(' / ')} of ${b.rows} rows; ${[...b.products].slice(0, 4).join(', ')}`;
    const ref = `qqp-marca:${name}`;
    if (!key || !/[a-z]/.test(key)) continue;
    if (blocked.has(bk)) { dropped.push([display, aisle, 'brands-block.txt (store or house brand)', ref]); continue; }
    if (b.rows < BRAND_MIN_ROWS) { dropped.push([display, aisle, `brand seen in fewer than ${BRAND_MIN_ROWS} QQP rows (${b.rows})`, ref]); continue; }
    if (share < BRAND_PURITY) { review.push(['brand-multi-aisle', display, aisle, detail]); continue; }
    if (key.split(' ').length === 1 && commonWords.has(key) && !allowed.has(bk)) { review.push(['brand-common-word', display, aisle, detail]); continue; }
    if (dropKeys.has(key)) { dropKeys.get(key).used = true; dropped.push([display, aisle, `drop.txt:${dropKeys.get(key).line}: ${dropKeys.get(key).why}`, ref]); continue; }
    add(display, aisle, PRIO.brand, ref);
    brandTerms++;
  }
}
applyDrops(); // brands and head nouns that hit the drop list

// ------------------------------------------------------------------ overrides (data/overrides/aisles/<id>.txt)
const emojiChoice = new Map(); // key → { emoji, ref }
const overrideStats = { files: 0, lines: 0, add: 0, drop: 0, move: 0 };
const overrideLines = [];
for (const f of fs.existsSync(OVERRIDES) ? fs.readdirSync(OVERRIDES).sort() : []) {
  const m = f.match(/^([a-z]{3})\.txt$/);
  if (!m) continue;
  const fileAisle = m[1];
  if (!isAisle(fileAisle)) { errors.push(`overrides/${f}: not an aisle id`); continue; }
  overrideStats.files++;
  lines(path.join(OVERRIDES, f)).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const k = line.indexOf('#');
    const body = (k < 0 ? line : line.slice(0, k)).trim();
    const why = k < 0 ? '' : line.slice(k + 1).trim();
    const ref = `override:${f}:${i + 1}`;
    overrideStats.lines++;
    let mm;
    if ((mm = body.match(/^\+\s+(.+?)(?:\s+=\s+(\S+))?$/))) overrideLines.push({ op: '+', term: mm[1], emoji: mm[2] || '', aisle: fileAisle, ref, why });
    else if ((mm = body.match(/^-\s+(.+)$/))) overrideLines.push({ op: '-', term: mm[1], aisle: fileAisle, ref, why });
    else if ((mm = body.match(/^(.+?)\s+>\s+([a-z]{3})$/))) overrideLines.push({ op: '>', term: mm[1], to: mm[2], aisle: fileAisle, ref, why });
    else errors.push(`${ref}: cannot read "${line}"`);
  });
}
for (const o of overrideLines) {
  const key = keyOf(o.term);
  const t = terms.get(key);
  const srcAisles = t ? [...new Set(t.cands.filter((c) => c.prio < PRIO.override).map((c) => c.aisle))] : [];
  if (o.op === '+') {
    if (srcAisles.length === 1 && srcAisles[0] === o.aisle && !o.emoji) review.push(['override-redundant', clean(o.term), o.aisle, `${o.ref}: the sources already put it here`]);
    add(o.term, o.aisle, PRIO.override, o.ref);
    if (o.emoji) emojiChoice.set(key, { emoji: o.emoji === '-' ? '' : o.emoji, ref: o.ref });
    overrideStats.add++;
  } else if (o.op === '-') {
    const gone = t ? t.cands.filter((c) => c.aisle === o.aisle && c.prio < PRIO.override) : [];
    if (!gone.length) { review.push(['override-drop-unused', clean(o.term), o.aisle, `${o.ref}: no source puts it in ${o.aisle}`]); continue; }
    t.cands = t.cands.filter((c) => !(c.aisle === o.aisle && c.prio < PRIO.override));
    dropped.push([gone[0].display, o.aisle, `${o.ref}: ${o.why}`, gone.map((c) => c.ref).join(' ; ')]);
    overrideStats.drop++;
  } else {
    if (!isAisle(o.to)) { errors.push(`${o.ref}: unknown aisle "${o.to}"`); continue; }
    if (!srcAisles.length) { review.push(['override-move-without-source', clean(o.term), o.to, `${o.ref}: no source has this term; use "+" in ${o.to}.txt`]); }
    else if (!srcAisles.includes(o.aisle)) review.push(['override-move-from-elsewhere', clean(o.term), o.to, `${o.ref}: the sources put it in ${srcAisles.join('|')}, not ${o.aisle}`]);
    add(t ? t.cands[0].display : o.term, o.to, PRIO.override, o.ref);
    overrideStats.move++;
  }
}
for (const x of dropList) if (!x.used) review.push(['drop-unused', x.text, '', `drop.txt:${x.line}: no source has this phrase`]);

// ------------------------------------------------------------------ resolve: one aisle per term
function resolve(t) {
  if (!t.cands.length) return null;
  const top = Math.max(...t.cands.map((c) => c.prio));
  const best = t.cands.filter((c) => c.prio === top);
  const counts = new Map();
  for (const c of best) counts.set(c.aisle, (counts.get(c.aisle) || 0) + 1);
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || aisleRank(a[0]) - aisleRank(b[0]));
  t.aisle = ranked[0][0];
  t.prio = top;
  const pool = best.filter((c) => c.aisle === t.aisle);
  const ovr = pool.find((c) => c.prio === PRIO.override && c.ref.startsWith('override:'));
  t.display = ovr ? ovr.display : pool.map((c) => c.display).sort((a, b) => accents(b) - accents(a) || a.length - b.length || (a < b ? -1 : 1))[0];
  const all = new Set(t.cands.map((c) => c.aisle));
  if (all.size > 1) conflicts.push([t.display, t.aisle, ranked.length > 1 ? `tie at ${PRIO_NAME[top]}` : `won at ${PRIO_NAME[top]}`,
    t.cands.map((c) => `${c.aisle}<${c.ref}`).join(' ; ')]);
  return t.aisle;
}
for (const t of terms.values()) resolve(t);

// ------------------------------------------------------------------ synonyms: a variant follows its source term
for (const r of readTsv(path.join(VOCAB, 'synonyms.tsv')).rows) {
  if (!r.why) errors.push(`synonyms.tsv:${r._line}: no why`);
  const target = terms.get(keyOf(r.of));
  if (!target || !target.aisle) { review.push(['synonym-without-target', r.variant, '', `synonyms.tsv:${r._line}: "${r.of}" is not shipped`]); continue; }
  const t = add(r.variant, target.aisle, PRIO.synonym, `synonym:${r.of}[${[...new Set(target.cands.map((c) => c.ref))].slice(0, 3).join(',')}]`);
  if (t) resolve(t);
}

// ------------------------------------------------------------------ emoji
const byName = new Map(); // name key → [emoji]
for (const r of cldr) {
  if (!AUTO_EMOJI.test(r.subgroup) || parseFloat(r.version) > MAX_EMOJI_VERSION) continue;
  const k = keyOf(r.name_es_MX);
  if (!byName.has(k)) byName.set(k, []);
  byName.get(k).push(r);
}
const shipped = [...terms.values()].filter((t) => t.aisle && t.aisle !== 'otr' && t.cands.length);
for (const t of shipped) {
  const choice = emojiChoice.get(t.key);
  if (choice) { t.emoji = choice.emoji; t.emojiRef = choice.emoji ? choice.ref : `${choice.ref} (no emoji)`; continue; }
  const hit = byName.get(t.key);
  if (hit && hit.length === 1) { t.emoji = hit[0].emoji; t.emojiRef = `cldr49:${hit[0].name_es_MX} (${hit[0].name_from}, E${hit[0].version})`; review.push(['emoji-auto', t.display, t.aisle, `${t.emoji} = CLDR "${hit[0].name_es_MX}"`]); }
  else if (hit) review.push(['emoji-ambiguous', t.display, t.aisle, hit.map((h) => h.emoji).join(' ')]);
}

// ------------------------------------------------------------------ forms
const forms = {};
for (const r of readTsv(path.join(VOCAB, 'forms.tsv')).rows) {
  if (!r.why) errors.push(`forms.tsv:${r._line}: no why`);
  if (!(r.from === '*' || isAisle(r.from)) || !isAisle(r.to)) { errors.push(`forms.tsv:${r._line}: bad aisle`); continue; }
  (forms[r.word] ||= {})[r.from] = r.to;
}

// ------------------------------------------------------------------ the dictionary
const qqpDate = headerDate('qqp-productos.tsv');
const enighDate = headerDate('enigh2024-gastos.csv');
const enighModified = ((header('enigh2024-gastos.csv').join('\n').match(/Modified: (\d{4}-\d{2}-\d{2})/) || [])[1]) || '';
const cldrDate = headerDate('cldr49-emoji-es-MX.tsv');
const GROUPING = 'Papelito adaptó estos nombres y los agrupó por pasillo; esa agrupación es nuestra';
const sources = [
  {
    name: 'PROFECO, «Quién es Quién en los Precios»',
    url: 'https://datos.profeco.gob.mx/datos_abiertos/qqp.php',
    license: 'CC BY 4.0',
    retrieved: qqpDate,
    credit: `Vocabulario de productos: «Quién es Quién en los Precios», PROFECO (Procuraduría Federal del Consumidor), datos abiertos del Gobierno de México, https://datos.profeco.gob.mx/datos_abiertos/qqp.php, consultado el ${qqpDate}, licencia Creative Commons Atribución 4.0 (CC BY 4.0). ${GROUPING}, no de PROFECO, y PROFECO no avala esta aplicación.`,
  },
  {
    name: 'INEGI, ENIGH 2024',
    url: 'https://www.inegi.org.mx/programas/enigh/nc/2024/',
    license: 'Términos de Libre Uso de la Información del INEGI',
    retrieved: enighDate,
    credit: `Fuente: INEGI, Encuesta Nacional de Ingresos y Gastos de los Hogares (ENIGH) 2024, catálogo de gastos (actualizado el ${enighModified}). ${GROUPING}, no del INEGI, y el INEGI no avala esta aplicación.`,
  },
  {
    name: 'Unicode CLDR 49',
    url: 'https://github.com/unicode-org/cldr/tree/release-49/common/annotations',
    license: 'Unicode License v3',
    retrieved: cldrDate,
    credit: 'Nombres de emoji: Unicode CLDR 49, © 1991-2026 Unicode, Inc., licencia Unicode v3 (texto completo en LICENSES/Unicode-3.0.txt).',
  },
];
const order = (a, b) => aisleRank(a.aisle) - aisleRank(b.aisle) || (fold(a.display) < fold(b.display) ? -1 : fold(a.display) > fold(b.display) ? 1 : a.display < b.display ? -1 : 1);
shipped.sort(order);
const dictTerms = {};
for (const t of shipped) dictTerms[t.display] = t.emoji ? [t.aisle, t.emoji] : t.aisle;
const dict = { v: 1, built: mxDate(), sources, aisles: aisles.map(({ id, es, en, emoji }) => ({ id, es, en, emoji })), terms: dictTerms, forms };

/** One term per line, so a diff shows what changed; still one valid JSON document. */
function stringify(d) {
  const head = JSON.stringify({ v: d.v, built: d.built, sources: d.sources, aisles: d.aisles });
  const body = Object.entries(d.terms).map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`).join(',\n');
  return `${head.slice(0, -1)},\n"terms":{\n${body}\n},\n"forms":${JSON.stringify(d.forms)}}\n`;
}
const json = stringify(dict);
JSON.parse(json); // must be valid
writeText(DICT, json);

// ------------------------------------------------------------------ evidence files
const tsvOut = (file, head, rows) => writeText(path.join(BUILD, file), [head.join('\t'), ...rows.map((r) => r.map((x) => String(x ?? '').replace(/[\t\n]/g, ' ')).join('\t'))].join('\n') + '\n');
tsvOut('sources.tsv', ['term', 'aisle', 'emoji', 'emoji_source', 'decided_by', 'sources'],
  shipped.map((t) => [t.display, t.aisle, t.emoji || '', t.emojiRef || '', PRIO_NAME[t.prio], t.cands.map((c) => `${c.ref}[${c.aisle}]`).join(' ; ')]));
tsvOut('conflicts.tsv', ['term', 'aisle', 'how', 'candidates'], conflicts.sort((a, b) => (a[0] < b[0] ? -1 : 1)));
tsvOut('review.tsv', ['kind', 'term', 'aisle', 'detail'], review.sort((a, b) => (a[0] + a[1] < b[0] + b[1] ? -1 : 1)));
tsvOut('dropped.tsv', ['term', 'aisle', 'reason', 'sources'], dropped);

const raw = Buffer.byteLength(json);
const gzip = zlib.gzipSync(json, { level: 9 }).length;
const brotli = zlib.brotliCompressSync(json, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } }).length;
const perAisle = Object.fromEntries(AISLES.map((a) => [a, shipped.filter((t) => t.aisle === a).length]));
const bySource = {};
for (const t of shipped) for (const kind of new Set(t.cands.map((c) => c.ref.split(':')[0]))) bySource[kind] = (bySource[kind] || 0) + 1;
const decidedBy = {};
for (const t of shipped) decidedBy[PRIO_NAME[t.prio]] = (decidedBy[PRIO_NAME[t.prio]] || 0) + 1;
const scores = scoreAll(dict);
const report = {
  built: dict.built,
  terms: shipped.length,
  emoji: shipped.filter((t) => t.emoji).length,
  emojiFromOverrides: shipped.filter((t) => t.emoji && t.emojiRef.startsWith('override:')).length,
  perAisle,
  termsWithSource: bySource,
  decidedBy,
  brands: brandTerms,
  varietyTerms,
  overrides: overrideStats,
  forms: Object.keys(forms).length,
  conflicts: conflicts.length,
  dropped: dropped.length,
  review: review.length,
  bytes: { raw, gzip, brotli },
  tests: Object.fromEntries(Object.entries(scores).map(([k, s]) => [k, { ok: s.ok, total: s.total, storeDependent: s.store, okAllRows: s.okAll, allRows: s.all, misses: s.misses.map((m) => `${m.item} → ${m.got} (expected ${m.expected}${m.store ? ', store-dependent' : ''})`) }])),
};
writeText(path.join(BUILD, 'report.json'), JSON.stringify(report, null, 1) + '\n');

const ms = performance.now() - t0;
console.log(`[dict] ${shipped.length} terms (${report.emoji} with emoji) → ${rel(DICT)}: ${raw} B raw, ${gzip} B gzip, ${brotli} B brotli; ${ms.toFixed(0)} ms`);
console.log(`[dict] per aisle: ${AISLES.map((a) => `${a} ${perAisle[a]}`).join(' · ')}`);
console.log(`[dict] test-60 ${scores['test-60'].ok}/${scores['test-60'].total} · tricky-40 ${scores['tricky-40'].ok}/${scores['tricky-40'].total}; conflicts ${conflicts.length}, dropped ${dropped.length}, review ${review.length} (data/vocab/build/)`);
if (errors.length) {
  for (const e of errors) console.error(`[dict] ERROR ${e}`);
  process.exit(1);
}
