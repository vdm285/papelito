// Score a dictionary on the test lists in data/vocab/test/ with the APP's matcher (src/model/aisles.js).
// Used by build.mjs (report.json), check.mjs (printed score) and tests/dict.test.mjs.
import path from 'node:path';
import { buildIndex, aisleOf } from '../../src/model/aisles.js';
import { VOCAB, readTsv } from './lib.mjs';

export const TESTS = {
  'test-60': path.join(VOCAB, 'test', 'test-60.tsv'),
  'tricky-40': path.join(VOCAB, 'test', 'tricky-40.tsv'),
};

/** [{ item, expected, store }] from a test file (test-60 has "term", tricky-40 has "item"). */
export function readTest(file) {
  return readTsv(file).rows.map((r) => ({ item: r.term ?? r.item, expected: r.aisle, store: r.store === '1', note: r.note || '' }));
}

/** Score one test list: ok/total leave store-dependent rows out of the denominator; okAll/all count every row. */
export function scoreRows(dict, rows, index = buildIndex(dict)) {
  const res = { ok: 0, total: 0, okAll: 0, all: rows.length, store: 0, misses: [] };
  for (const r of rows) {
    const got = aisleOf(r.item, index);
    const hit = got.aisle === r.expected;
    if (hit) res.okAll++;
    if (r.store) res.store++;
    else { res.total++; if (hit) res.ok++; }
    if (!hit) res.misses.push({ item: r.item, expected: r.expected, got: got.aisle, term: got.term, guess: got.guess, store: r.store });
  }
  return res;
}

export function scoreAll(dict) {
  const index = buildIndex(dict);
  const out = {};
  for (const [name, file] of Object.entries(TESTS)) out[name] = scoreRows(dict, readTest(file), index);
  return out;
}

export function formatScore(name, s) {
  const lines = [`${name}: ${s.ok}/${s.total} (store-dependent rows left out: ${s.store}); all rows ${s.okAll}/${s.all}`];
  for (const m of s.misses) lines.push(`  ${m.store ? '~' : '✗'} ${m.item} → ${m.got}${m.term ? ` (via "${m.term}"${m.guess ? ', guess' : ''})` : ''}, expected ${m.expected}`);
  return lines.join('\n');
}
