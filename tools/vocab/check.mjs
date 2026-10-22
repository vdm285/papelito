// Check the built dictionary and the human files; print the test scores with the APP's matcher.
// Run after tools/vocab/build.mjs (npm run dict does both). Exits 1 when any rule below is broken:
//   - the dictionary is not the shape the app reads (v, built, sources, 16 aisles, terms, forms);
//   - a term is not written as people write it (lowercase, single spaces), or names an unknown aisle or "otr";
//   - two terms are the same words to the matcher (fold + stem), so one phrase would sit in two aisles;
//   - a shipped term has no source reference, or a reference that does not resolve to a source row or an override line;
//   - an override line cannot be read or has no "# why"; a human mapping line has no why;
//   - an emoji is not in sources/cldr49-emoji-es-MX.tsv or its Unicode emoji version is above 13.0;
//   - public/dict/es-MX.json is over 15,000 bytes gzipped.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { words, AISLES } from '../../src/model/aisles.js';
import { VOCAB, SOURCES, OVERRIDES, BUILD, DICT, fold, lines, readTsv, readList, rel } from './lib.mjs';
import { scoreAll, formatScore } from './score.mjs';

const MAX_GZIP = 15000;
const MAX_EMOJI_VERSION = 13.0;
const fail = [];
const warn = [];
const keyOf = (s) => words(s).join(' ');

// ------------------------------------------------------------------ the dictionary's shape
const raw = fs.readFileSync(DICT);
let dict;
try { dict = JSON.parse(raw.toString('utf8')); } catch (e) { console.error(`[check] ${rel(DICT)} is not JSON: ${e.message}`); process.exit(1); }
if (dict.v !== 1) fail.push('v must be 1');
if (!/^\d{4}-\d{2}-\d{2}$/.test(dict.built || '')) fail.push('built must be YYYY-MM-DD');
if (!Array.isArray(dict.sources) || !dict.sources.length) fail.push('sources must list the data sources');
for (const s of dict.sources || []) for (const k of ['name', 'url', 'license', 'retrieved', 'credit']) if (!s[k]) fail.push(`source "${s.name}" has no ${k}`);
const ids = (dict.aisles || []).map((a) => a.id);
if (ids.join() !== AISLES.join()) fail.push(`aisles must be the app's 16 ids in order (${AISLES.join(' ')}), got ${ids.join(' ')}`);
for (const a of dict.aisles || []) for (const k of ['es', 'en', 'emoji']) if (!a[k]) fail.push(`aisle ${a.id} has no ${k}`);
if (!dict.terms || typeof dict.terms !== 'object') fail.push('terms must be an object');
for (const [w, rule] of Object.entries(dict.forms || {})) for (const [from, to] of Object.entries(rule)) {
  if (!(from === '*' || AISLES.includes(from)) || !AISLES.includes(to)) fail.push(`form "${w}": bad aisle ${from} → ${to}`);
}

// ------------------------------------------------------------------ emoji
const cldr = new Map(readTsv(path.join(SOURCES, 'cldr49-emoji-es-MX.tsv')).rows.map((r) => [r.emoji, parseFloat(r.version)]));
function checkEmoji(e, where) {
  if (!cldr.has(e)) fail.push(`${where}: emoji ${e} is not in sources/cldr49-emoji-es-MX.tsv (version unknown)`);
  else if (cldr.get(e) > MAX_EMOJI_VERSION) fail.push(`${where}: emoji ${e} is Unicode emoji ${cldr.get(e)}, above ${MAX_EMOJI_VERSION}`);
}
for (const a of dict.aisles || []) checkEmoji(a.emoji, `aisle ${a.id}`);

// ------------------------------------------------------------------ terms
const seen = new Map(); // matcher key → [term, aisle]
const perAisle = Object.fromEntries(AISLES.map((a) => [a, 0]));
let emojiCount = 0;
for (const [term, val] of Object.entries(dict.terms || {})) {
  const [aisle, emoji] = Array.isArray(val) ? val : [val, ''];
  if (term !== term.toLowerCase() || term !== term.trim() || /\s{2}/.test(term)) fail.push(`term "${term}" is not lowercase with single spaces`);
  if (!AISLES.includes(aisle) || aisle === 'otr') fail.push(`term "${term}": aisle "${aisle}" is not a shelf aisle`);
  if (Array.isArray(val) && (val.length !== 2 || !emoji)) fail.push(`term "${term}": [aisle, emoji] expected`);
  if (emoji) { checkEmoji(emoji, `term "${term}"`); emojiCount++; }
  const key = keyOf(term);
  if (!key) fail.push(`term "${term}" is only filler words to the matcher`);
  else if (seen.has(key)) {
    const [t0, a0] = seen.get(key);
    fail.push(a0 === aisle ? `terms "${t0}" and "${term}" are the same words to the matcher` : `"${t0}" (${a0}) and "${term}" (${aisle}) are the same words to the matcher: one phrase in two aisles`);
  } else seen.set(key, [term, aisle]);
  perAisle[aisle] = (perAisle[aisle] || 0) + 1;
}

// ------------------------------------------------------------------ every shipped term traces to a source row or an override line
const qqpProducts = new Set(readTsv(path.join(SOURCES, 'qqp-productos.tsv')).rows.map((r) => r.producto));
const qqpVarieties = new Set(readTsv(path.join(SOURCES, 'qqp-variedades.tsv')).rows.filter((r) => r.keep === '1').map((r) => `${r.producto}/${r.variedad}`));
const qqpBrands = new Set(readTsv(path.join(SOURCES, 'qqp-marcas.tsv')).rows.map((r) => r.marca));
const enighCodes = new Set(lines(path.join(SOURCES, 'enigh2024-gastos.csv')).filter((l) => /^[0-9A-Z]{6},/.test(l)).map((l) => l.slice(0, 6)));
const overrideFiles = fs.existsSync(OVERRIDES) ? fs.readdirSync(OVERRIDES).filter((f) => /^[a-z]{3}-[a-z0-9-]+\.txt$/.test(f)).sort() : [];
const overrideText = new Map(overrideFiles.map((f) => [f, lines(path.join(OVERRIDES, f))]));

/** Does this reference resolve? An override reference must also be a line about this very term (same matcher key). */
function refOk(ref, term = null) {
  const i = ref.indexOf(':');
  const kind = ref.slice(0, i);
  const rest = ref.slice(i + 1);
  switch (kind) {
    case 'qqp': return qqpProducts.has(rest);
    case 'qqp-var': return qqpVarieties.has(rest);
    case 'qqp-marca': return qqpBrands.has(rest);
    case 'enigh': return enighCodes.has(rest);
    case 'override': {
      const [f, n] = rest.split(':');
      const l = (overrideText.get(f) || [])[+n - 1] || '';
      if (!(/^\s*(\+\s|\S.*\s>\s[a-z]{3}\b)/.test(l) && /#\s*\S/.test(l))) return false;
      if (term === null) return true;
      const body = l.slice(0, l.indexOf('#')).trim();
      const m = body.match(/^\+\s+(.+?)(?:\s+=\s+\S+)?$/) || body.match(/^(.+?)\s+>\s+[a-z]{3}$/);
      return !!m && keyOf(m[1]) === keyOf(term);
    }
    case 'derived': return rest.split(',').filter((r) => !/^\+\d+$/.test(r)).some(refOk);
    case 'synonym': { const m = rest.match(/^(.*?)\[(.*)\]$/); return !!m && m[2].split(',').some(refOk); }
    default: return false;
  }
}
const trace = new Map();
const traceFile = path.join(BUILD, 'sources.tsv');
if (!fs.existsSync(traceFile)) fail.push(`${rel(traceFile)} is missing: run tools/vocab/build.mjs`);
else for (const r of readTsv(traceFile).rows) trace.set(r.term, r);
for (const [term, val] of Object.entries(dict.terms || {})) {
  const aisle = Array.isArray(val) ? val[0] : val;
  const row = trace.get(term);
  if (!row || !row.sources) { fail.push(`term "${term}" has no source reference in build/sources.tsv`); continue; }
  if (row.aisle !== aisle) fail.push(`term "${term}": build/sources.tsv says ${row.aisle}, the dictionary ${aisle}`);
  const refs = row.sources.split(' ; ').map((s) => s.replace(/\[[a-z]{3}\]$/, ''));
  if (!refs.some((r) => refOk(r, term))) fail.push(`term "${term}": no reference resolves to a source row or an override line (${row.sources})`);
}

// ------------------------------------------------------------------ an emoji is a human choice or an exact CLDR name
const cldrName = new Map(readTsv(path.join(SOURCES, 'cldr49-emoji-es-MX.tsv')).rows.map((r) => [r.emoji, r.name_es_MX]));
for (const [term, val] of Object.entries(dict.terms || {})) {
  if (!Array.isArray(val)) continue;
  const src = (trace.get(term) || {}).emoji_source || '';
  if (src.startsWith('override:')) { if (!refOk(src.split(' ')[0], term)) fail.push(`term "${term}": its emoji cites ${src}, which is not a line about this term`); continue; }
  if (!src.startsWith('cldr49:')) { fail.push(`term "${term}": emoji ${val[1]} has no recorded source`); continue; }
  if (keyOf(cldrName.get(val[1]) || '') !== keyOf(term)) fail.push(`term "${term}": emoji ${val[1]} is CLDR "${cldrName.get(val[1])}", not an exact name match`);
}

// ------------------------------------------------------------------ blocked brands never ship as brands
// (a QQP brand string with a trailing size, "Torres 10", once slipped past the block list as "torres")
const blockedKeys = new Map(readList(path.join(VOCAB, 'brands-block.txt')).map((x) => [keyOf(x.text), x]));
for (const [term, row] of trace) {
  if (row.decided_by !== 'brand') continue;
  const b = blockedKeys.get(keyOf(term));
  if (b) fail.push(`term "${term}" ships as a brand but data/vocab/brands-block.txt:${b.line} blocks it`);
}

// ------------------------------------------------------------------ the credit lines say what the licences ask
const creditOf = (re) => ((dict.sources || []).find((s) => re.test(s.name)) || {}).credit || '';
const needs = [
  [/PROFECO/, [/CC BY 4\.0/, /creativecommons\.org\/licenses\/by\/4\.0/, /agrupaci[oó]n es nuestra/, /no avala/]],
  [/INEGI/, [/Fuente: INEGI/, /ENIGH/, /agrupaci[oó]n es nuestra/, /no avala/]],
  [/CLDR/, [/Unicode, Inc\./, /licencia Unicode v3/]],
];
for (const [who, res] of needs) for (const re of res) if (!re.test(creditOf(who))) fail.push(`the credit line of ${who.source} does not say ${re.source}`);
if (!fs.existsSync(path.join(VOCAB, '..', '..', 'LICENSES', 'Unicode-3.0.txt'))) fail.push('LICENSES/Unicode-3.0.txt is missing (the Unicode licence must travel with the CLDR data)');

// ------------------------------------------------------------------ override lines and other human files
for (const [f, ls] of overrideText) ls.forEach((rawLine, i) => {
  const line = rawLine.trim();
  if (!line || line.startsWith('#')) return;
  const k = line.indexOf('#');
  const body = (k < 0 ? line : line.slice(0, k)).trim();
  const why = k < 0 ? '' : line.slice(k + 1).trim();
  const where = `data/overrides/aisles/${f}:${i + 1}`;
  if (!why) fail.push(`${where}: no "# why"`);
  let m;
  if ((m = body.match(/^\+\s+(.+?)(?:\s+=\s+(\S+))?$/))) { if (m[2] && m[2] !== '-') checkEmoji(m[2], where); }
  else if ((m = body.match(/^(.+?)\s+>\s+([a-z]{3})$/))) { if (!AISLES.includes(m[2])) fail.push(`${where}: unknown aisle ${m[2]}`); }
  else if (!/^-\s+\S/.test(body)) fail.push(`${where}: not a "+", "-" or ">" line`);
});
for (const f of ['map-qqp.tsv', 'map-qqp-products.tsv', 'map-enigh.tsv', 'synonyms.tsv', 'forms.tsv']) {
  for (const r of readTsv(path.join(VOCAB, f)).rows) if (!r.why) fail.push(`data/vocab/${f}:${r._line}: no why`);
}
for (const f of ['drop.txt', 'brands-block.txt', 'brands-allow.txt']) for (const x of readList(path.join(VOCAB, f))) if (!x.why) fail.push(`data/vocab/${f}:${x.line}: no "# why"`);

// ------------------------------------------------------------------ size
const gzip = zlib.gzipSync(raw, { level: 9 }).length;
if (gzip > MAX_GZIP) fail.push(`${rel(DICT)} is ${gzip} bytes gzipped, over ${MAX_GZIP}`);

// ------------------------------------------------------------------ advisory: the build's review queue
const reviewFile = path.join(BUILD, 'review.tsv');
if (fs.existsSync(reviewFile)) {
  const kinds = {};
  for (const r of readTsv(reviewFile).rows) kinds[r.kind] = (kinds[r.kind] || 0) + 1;
  for (const k of ['override-redundant', 'override-drop-unused', 'override-move-without-source', 'override-move-from-elsewhere', 'synonym-without-target', 'drop-unused', 'variety-of-unmapped-product', 'category-unmapped', 'exception-unknown-product']) {
    if (kinds[k]) warn.push(`${kinds[k]} × ${k} (data/vocab/build/review.tsv)`);
  }
}

// ------------------------------------------------------------------ report
const total = Object.keys(dict.terms || {}).length;
console.log(`[check] ${total} terms, ${emojiCount} with emoji; ${raw.length} B raw, ${gzip} B gzip (limit ${MAX_GZIP}); built ${dict.built}`);
console.log(`[check] per aisle: ${AISLES.map((a) => `${a} ${perAisle[a]}`).join(' · ')}`);
const scores = scoreAll(dict);
for (const [name, s] of Object.entries(scores)) console.log(formatScore(`[check] ${name}`, s));
console.log('[check] the expected aisles in data/vocab/test/ were chosen by an AI, and the override files were written after seeing these misses: the scores are a regression guard, not evidence of coverage.');
for (const w of warn) console.log(`[check] note: ${w}`);
if (fail.length) {
  for (const f of fail) console.error(`[check] FAIL ${f}`);
  console.error(`[check] ${fail.length} problem(s)`);
  process.exit(1);
}
console.log('[check] ok');
