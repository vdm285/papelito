import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitInput, splitQuantity } from '../src/model/parse.js';

test('commas, semicolons and new lines end items; "y" does not', () => {
  assert.deepEqual(splitInput('huevos, leche; pan'), ['huevos', 'leche', 'pan']);
  assert.deepEqual(splitInput('huevos\nleche\n\n pan '), ['huevos', 'leche', 'pan']);
  assert.deepEqual(splitInput('pan y mantequilla'), ['pan y mantequilla']);
  assert.deepEqual(splitInput('  ,, ;  '), []);
});

test('decimal commas survive', () => {
  assert.deepEqual(splitInput('1,5 kg de jitomate, cebolla'), ['1,5 kg de jitomate', 'cebolla']);
});

test('bullets, numbering and checkboxes are removed', () => {
  const pasted = '- huevos\n* leche\n• pan\n1. tortillas\n2) frijoles\n[ ] arroz\n[x] sal\n☐ azúcar\n✓ café\na) chiles';
  assert.deepEqual(splitInput(pasted), ['huevos', 'leche', 'pan', 'tortillas', 'frijoles', 'arroz', 'sal', 'azúcar', 'café', 'chiles']);
});

test('numbers that are part of the item stay', () => {
  assert.deepEqual(splitInput('1.5 kg de queso'), ['1.5 kg de queso']);
  assert.deepEqual(splitInput('7up'), ['7up']);
  assert.deepEqual(splitInput('2 aguacates'), ['2 aguacates']);
});

test('WhatsApp copies lose their prefixes and formatting', () => {
  const ios = '[18:03, 21/10/2026] Ana: *huevos*\n[18:04, 21/10/2026] Ana: _leche_ deslactosada, ~pan~';
  assert.deepEqual(splitInput(ios), ['huevos', 'leche deslactosada', 'pan']);
  const android = '21/10/26, 18:03 - Ana: tortillas\n21/10/26, 6:04 p. m. - Beto: jabón zote';
  assert.deepEqual(splitInput(android), ['tortillas', 'jabón zote']);
});

test('headings are dropped, item-with-colon lines are kept', () => {
  assert.deepEqual(splitInput('Lista del súper:\nhuevos\nleche'), ['huevos', 'leche']);
  assert.deepEqual(splitInput('Trae: huevos, leche'), ['huevos', 'leche']);
  assert.deepEqual(splitInput('Leche: 2 litros'), ['Leche: 2 litros']);
});

test('a trailing period goes; inner spaces collapse', () => {
  assert.deepEqual(splitInput('papel   de baño.'), ['papel de baño']);
});

test('quantities split from the thing', () => {
  const q = (s) => { const r = splitQuantity(s); return [r.qty, r.what]; };
  assert.deepEqual(q('2 kg de tortillas'), ['2 kg', 'tortillas']);
  assert.deepEqual(q('2kg tortillas'), ['2kg', 'tortillas']);
  assert.deepEqual(q('1/2 kilo de jamón'), ['1/2 kilo', 'jamón']);
  assert.deepEqual(q('media docena de huevos'), ['media docena', 'huevos']);
  assert.deepEqual(q('un paquete de servilletas'), ['un paquete', 'servilletas']);
  assert.deepEqual(q('2x leche'), ['2x', 'leche']);
  assert.deepEqual(q('3 limones'), ['3', 'limones']);
  assert.deepEqual(q('leche x2'), ['x2', 'leche']);
  assert.deepEqual(q('coca cola 600 ml'), ['600 ml', 'coca cola']);
  assert.deepEqual(q('aguacate (3)'), ['3', 'aguacate']);
  assert.deepEqual(q('tortillas'), ['', 'tortillas']);
  assert.deepEqual(q('2 detergentes'), ['2', 'detergentes']);
  assert.deepEqual(q('2 detergente en polvo'), ['2', 'detergente en polvo']);
  assert.deepEqual(q('3 desinfectante de cocina'), ['3', 'desinfectante de cocina']);
});
