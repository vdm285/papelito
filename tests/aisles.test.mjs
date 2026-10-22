import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fold, stem, words, keyOf, buildIndex, aisleOf, splitHint } from '../src/model/aisles.js';

// A toy dictionary shaped like the real one; the real one is tested in dict.test.mjs.
const DICT = {
  terms: {
    tortillas: ['pan', '🫓'], jitomate: ['fru', '🍅'], aguacate: ['fru', '🥑'], limón: 'fru', chile: ['fru', '🌶️'], 'chile serrano': 'fru',
    'chiles en lata': 'des', papa: 'fru', papas: 'bot', 'papas fritas': 'bot', frijol: 'des', nuez: 'des', 'pan dulce': 'pan', pan: 'pan',
    leche: ['lac', '🥛'], crema: 'lac', 'crema para manos': 'hig', huevo: ['lac', '🥚'], 'papel de baño': 'hig', detergente: 'lim',
    'detergente en polvo': 'lim', desinfectante: 'lim', pollo: 'car', cecina: 'car', jamón: 'car', zote: 'lim', 'coca cola': 'beb', coca: 'beb',
    '7up': 'beb', helado: 'con', verdura: 'fru', mantequilla: 'lac', aguacatero: 'otr', dona: 'pan', vela: 'lim', pañal: 'bbe', 'ajo': 'fru', 'ajo en polvo': 'des',
    'constructor': 'otr', cacahuate: 'bot', mameyes: 'fru', pilas: 'lim', piña: 'fru',
  },
  forms: { congelado: { '*': 'con' }, congelada: { '*': 'con' }, lata: { fru: 'des' }, enlatado: { fru: 'des' } },
};
const idx = buildIndex(DICT);
const A = (t, fixes) => aisleOf(t, idx, fixes).aisle;

test('fold and stem', () => {
  assert.equal(fold('Coca-Cola, 3 Litros! ñandú'), 'coca cola 3 litros nandu');
  for (const [a, b] of [['tortilla', 'tortillas'], ['limon', 'limones'], ['nuez', 'nueces'], ['chile', 'chiles'], ['frijol', 'frijoles'], ['panal', 'panales'], ['mamey', 'mameyes'], ['leche', 'leches'], ['pan', 'panes'], ['huevo', 'huevos']]) {
    assert.equal(stem(a), stem(b), `${a} / ${b}`);
  }
  assert.deepEqual(words('Papel de baño'), ['papel', 'bano']);
});

test('everyday items', () => {
  assert.equal(A('tortillas'), 'pan');
  assert.equal(A('1 kilo de jitomate'), 'fru');
  assert.equal(A('3 aguacates'), 'fru');
  assert.equal(A('Papel de baño'), 'hig');
  assert.equal(A('crema'), 'lac');
  assert.equal(A('crema para manos'), 'hig');
  assert.equal(A('leche Lala'), 'lac');
  assert.equal(A('Zote'), 'lim');
  assert.equal(A('limones'), 'fru');
  assert.equal(A('chiles serranos'), 'fru');
});

test('the old matcher bugs stay fixed', () => {
  assert.equal(A('2 detergentes'), 'lim'); // "de" ate the next word
  assert.equal(A('2 detergente en polvo'), 'lim'); // went to Carnes via "pollo"
  assert.equal(A('3 desinfectante de cocina'), 'lim'); // went to Carnes via "cecina"
  assert.equal(keyOf('coca cola 600 ml'), 'coca cola'); // trailing number half removed
  assert.equal(A('coca cola 600 ml'), 'beb');
  assert.equal(A('dona'), 'pan'); // singular of a plural-only term
  assert.equal(A('velas'), 'lim');
  assert.equal(A('pañales'), 'bbe');
  assert.equal(A('constructor'), 'otr'); // a prototype key does not crash
});

test('longest phrase wins, then the exact spelling', () => {
  assert.equal(A('chiles en lata'), 'des');
  assert.equal(A('ajo en polvo'), 'des');
  assert.equal(A('pan dulce'), 'pan');
  assert.equal(A('papas fritas'), 'bot');
  assert.equal(A('papa'), 'fru');
  assert.equal(A('papas'), 'bot');
});

test('form words move the aisle', () => {
  assert.equal(A('lata de chile'), 'des');
  assert.equal(A('verduras congeladas'), 'con');
  assert.equal(A('helado'), 'con');
});

test('names with digits match whole', () => {
  assert.equal(A('7up'), 'beb');
  assert.equal(A('2 7up'), 'beb');
});

test('typo guesses are cautious and marked', () => {
  const g = aisleOf('aguacte', idx);
  assert.equal(g.aisle, 'fru');
  assert.equal(g.guess, true);
  assert.equal(A('pilas'), 'lim'); // known word; never guessed as piñas
  assert.equal(aisleOf('polvo', idx).aisle, 'otr'); // never guessed as pollo
});

test('hand corrections win and are keyed by the stemmed phrase', () => {
  const fixes = { [keyOf('café')]: 'des' };
  assert.equal(A('café', fixes), 'des');
  assert.equal(A('2 cafés', fixes), 'des');
});

test('unknown things go to Otros', () => {
  assert.equal(A('regalo para la tía'), 'otr');
  assert.equal(A(''), 'otr');
});

test('split hint for comma-less dictation, never for unknown words', () => {
  assert.deepEqual(splitHint('huevos leche tortillas', idx), ['huevos', 'leche', 'tortillas']);
  assert.deepEqual(splitHint('Jitomate y aguacate', idx), ['Jitomate', 'aguacate']);
  assert.deepEqual(splitHint('papel de baño crema', idx), ['papel de baño', 'crema']);
  assert.equal(splitHint('pan dulce', idx), null); // one known phrase
  assert.equal(splitHint('pan y mantequilla de la abuela', idx), null); // "abuela" is unknown
  assert.equal(splitHint('leche', idx), null);
});

test('speed: 40 items in well under 5 ms after warm-up', () => {
  const items = Object.keys(DICT.terms).concat(['2 kg de jitomate', 'regalo']).slice(0, 40);
  const fresh = buildIndex(DICT);
  const t0 = performance.now();
  for (const t of items) aisleOf(t, fresh);
  const ms = performance.now() - t0;
  assert.ok(ms < 20, `${ms.toFixed(1)} ms cold`);
});
