// The real aisle dictionary (public/dict/es-MX.json, built by tools/vocab/build.mjs) with the app's matcher.
// Floors, not targets: the expected aisles in data/vocab/test/ are an AI's judgments (see the files' headers).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildIndex, aisleOf, AISLES } from '../src/model/aisles.js';
import { scoreRows, readTest, TESTS } from '../tools/vocab/score.mjs';

const dict = JSON.parse(fs.readFileSync(new URL('../public/dict/es-MX.json', import.meta.url), 'utf8'));
const idx = buildIndex(dict);
const A = (t) => aisleOf(t, idx).aisle;

test('the dictionary has the shape the app reads', () => {
  assert.equal(dict.v, 1);
  assert.match(dict.built, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(dict.aisles.map((a) => a.id), AISLES);
  assert.ok(Object.keys(dict.terms).length > 1000);
  const credits = dict.sources.map((s) => s.credit).join(' ');
  assert.match(credits, /PROFECO/);
  assert.match(credits, /CC BY 4\.0/);
  assert.match(credits, /Fuente: INEGI/);
  assert.match(credits, /Unicode/);
  for (const t of Object.keys(dict.terms)) assert.equal(t, t.toLowerCase(), t);
});

test('15 everyday items never regress', () => {
  assert.equal(A('tortillas'), 'tor');
  assert.equal(A('jitomate'), 'fru');
  assert.ok(['lim', 'hig'].includes(A('papel de baño')), A('papel de baño'));
  assert.equal(A('crema'), 'lac');
  assert.equal(A('Zote'), 'lim');
  assert.equal(A('Fabuloso'), 'lim');
  assert.equal(A('garrafón'), 'beb');
  assert.equal(A('croquetas'), 'mas');
  assert.equal(A('hielo'), 'con');
  assert.equal(A('2 detergentes'), 'lim');
  assert.equal(A('chiles en lata'), 'aba');
  assert.equal(A('helado'), 'con');
  assert.equal(A('pañales'), 'bbe');
  assert.equal(A('paracetamol'), 'far');
  assert.equal(A('Maseca'), 'aba');
});

test('test-60: at least 54/60, store-dependent rows left out of the denominator', () => {
  const s = scoreRows(dict, readTest(TESTS['test-60']), idx);
  const misses = s.misses.map((m) => `${m.item} → ${m.got} (expected ${m.expected})`).join('; ');
  assert.ok(s.ok / s.total >= 54 / 60, `${s.ok}/${s.total}: ${misses}`);
  assert.ok(s.okAll >= 54, `all rows ${s.okAll}/${s.all}: ${misses}`);
});

test('tricky-40: at least 85 % of the rows that do not depend on the store', () => {
  const s = scoreRows(dict, readTest(TESTS['tricky-40']), idx);
  assert.ok(s.ok / s.total >= 0.85, `${s.ok}/${s.total}: ${s.misses.map((m) => `${m.item} → ${m.got}`).join('; ')}`);
});

test('audit-160: at least 95 % of the rows that do not depend on the store', () => {
  const s = scoreRows(dict, readTest(TESTS['audit-160']), idx);
  assert.ok(s.ok / s.total >= 0.95, `${s.ok}/${s.total}: ${s.misses.map((m) => `${m.item} → ${m.got}`).join('; ')}`);
});

// Found by the audit of 2026-10-22; each line names what used to go wrong.
test('collisions and gaps found by the audit stay fixed', () => {
  // blocked brands with a size in QQP's brand field ("Torres 10", "Florida 7") once shipped anyway
  for (const t of ['torres', 'florida', 'barajas', 'legal', 'soberano', 'noche buena', 'gloria', 'fresca']) assert.equal(dict.terms[t], undefined, t);
  assert.equal(A('hojas tamaño legal'), 'otr'); // not coffee
  assert.equal(A('soberano'), 'otr'); // the brandy, not QQP's rice brand
  // margarine brands follow margarine to the dairy case; canned-corn brands are pantry, fresh elotes produce
  assert.equal(A('margarina'), 'lac');
  assert.equal(A('primavera light'), 'lac');
  assert.equal(A('herdez'), 'aba');
  assert.equal(A('elotes'), 'fru');
  assert.equal(A('elote en lata'), 'aba');
  // a shorter word in another aisle used to win
  assert.equal(A('crema para peinar'), 'hig');
  assert.equal(A('crema nivea'), 'hig');
  assert.equal(A('chicharrones de harina'), 'bot');
  assert.equal(A('caldo de res'), 'aba');
  assert.equal(A('leche de magnesia'), 'far');
  assert.equal(A('jabón líquido para ropa'), 'lim');
  assert.equal(A('lima de uñas'), 'hig');
  assert.equal(A('lima'), 'fru');
  assert.equal(A('jugo de manzana'), 'beb');
  // everyday words that went to Otros
  assert.equal(A('6 coronas'), 'beb');
  assert.equal(A('tortillinas'), 'tor');
  assert.equal(A('hamburguesas congeladas'), 'con');
  assert.equal(A('1 kg de molida'), 'car');
  assert.equal(A('arrachera'), 'car');
});

test('the credit lines carry what the licences ask', () => {
  const credit = (re) => dict.sources.find((s) => re.test(s.name)).credit;
  assert.match(credit(/PROFECO/), /creativecommons\.org\/licenses\/by\/4\.0/);
  assert.match(credit(/PROFECO/), /agrupación es nuestra.*no avala/);
  assert.match(credit(/INEGI/), /^Fuente: INEGI, .*ENIGH.*agrupación es nuestra.*no avala/);
  assert.match(credit(/CLDR/), /© 1991-2026 Unicode, Inc\..*Unicode v3/);
});
