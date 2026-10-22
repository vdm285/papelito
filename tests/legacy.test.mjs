import { test } from 'node:test';
import assert from 'node:assert/strict';
import { importLegacy, legacyLinkId, sentenceCase } from '../src/model/legacy.js';
import { liveItems, sanitize, canonical, isDone } from '../src/model/doc.js';

const DEV = 'phonea00';
const S = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]));

// The exact shape the live app wrote (from the audit's harness run on 2026-10-21).
const LIVE = {
  listolista_data_local_1792643903472: { items: [
    { id: 1792643903802, text: 'huevos, leche', category: 'Lácteos y Huevos 🧀', done: false, deleted: false, timestamp: 1792643903802, lastAuthor: 'User_844' },
    { id: 1792643903808, text: 'pan', category: 'Panadería y Tortillas 🍞', done: true, deleted: false, timestamp: 1792643903831, lastAuthor: 'User_844' },
    { id: 1792643903813, text: 'jabón', category: 'Limpieza y Hogar 🧹', done: false, deleted: true, timestamp: 1792643903837, lastAuthor: 'User_844' },
    { id: 1792643903824, text: 'papel de baño', category: null, done: false, deleted: false, timestamp: 1792643903824, lastAuthor: 'User_844' },
  ], meta: { title: 'SÚPER <B>X</B>', timestamp: 1792643903843, lastAuthor: '' } },
  last_local_id: 'local_1792643903472',
  listolista_index_local: { local_1792643903472: { title: 'NUEVA LISTA', lastVisited: 1792643903843 } },
};

test('the live app\'s lists come back with their items, strikes and title', () => {
  const { lists } = importLegacy(S(LIVE), DEV);
  assert.equal(lists.length, 1);
  const l = lists[0];
  assert.equal(l.oldId, 'local_1792643903472');
  assert.equal(l.title, 'Súper <b>x</b>'); // text, never HTML; sentence case from the capitals bug
  const items = liveItems(l.doc);
  assert.deepEqual(items.map((i) => i.t[0]), ['huevos, leche', 'pan', 'papel de baño']); // deleted jabón stays gone
  assert.deepEqual(items.map((i) => isDone(i)), [false, true, false]);
  assert.equal(l.wasShared, false);
  // valid document, same ids on every phone
  assert.equal(canonical(sanitize(JSON.parse(canonical(l.doc)))), canonical(l.doc));
  const again = importLegacy(S(LIVE), 'phoneb00').lists[0];
  assert.deepEqual(Object.keys(again.doc.items).sort(), Object.keys(l.doc.items).sort());
});

test('a shared list and the local copy the old "share" left behind import once', () => {
  const room = 'room_0123456789abcdef0123456789abcdef';
  const store = { ...LIVE, [`listolista_data_${room}`]: LIVE.listolista_data_local_1792643903472, listolista_index_shared: { [room]: { title: 'X', lastVisited: 1 } } };
  const { lists } = importLegacy(S(store), DEV);
  assert.equal(lists.length, 1);
});

test('a shared list that grew after sharing is its own list and is marked as once shared', () => {
  const room = 'room_mkbu4uyo';
  const grown = JSON.parse(JSON.stringify(LIVE.listolista_data_local_1792643903472));
  grown.items.push({ id: 1792643999999, text: 'tortillas', done: false, deleted: false, timestamp: 1792643999999 });
  const { lists } = importLegacy(S({ ...LIVE, [`listolista_data_${room}`]: grown }), DEV);
  assert.equal(lists.length, 2);
  assert.equal(lists.find((l) => l.oldId === room).wasShared, true);
});

test('December 2025 and 2024 formats', () => {
  const store = S({
    listolista_v1: { title: 'MI LISTA', items: [{ id: 1766700000000, txt: 'tortillas', done: false, ts: 1766700000000, dt: null }, { id: 1766700000500, txt: 'frijoles', done: true, ts: 1766700000500, dt: 1766700001000 }] },
    inputs: [{ value: 'leche', done: true }, { value: 'pan', done: false }, { value: '', done: false }],
  });
  const { lists } = importLegacy(store, DEV);
  assert.equal(lists.length, 2);
  const v1 = lists.find((l) => l.oldId === 'v1');
  assert.equal(v1.title, ''); // "MI LISTA" was the default title, not a name
  assert.deepEqual(liveItems(v1.doc).map((i) => i.t[0]), ['tortillas', 'frijoles']);
  const old = lists.find((l) => l.oldId === 'inputs');
  assert.deepEqual(liveItems(old.doc).map((i) => [i.t[0], isDone(i)]), [['leche', true], ['pan', false]]);
  // 2024 positions make distinct ids even past ten lines
  const many = importLegacy(S({ inputs: Array.from({ length: 12 }, (_, i) => `cosa ${i}`) }), DEV).lists[0];
  assert.equal(Object.keys(many.doc.items).length, 12);
});

test('the array-only form of listolista_v1 and junk under our keys', () => {
  const store = { listolista_v1: JSON.stringify([{ id: 1766600000000, txt: 'sal', done: false, ts: 1766600000000 }]), listolista_data_bad: '{not json', inputs: '"a string"' };
  const { lists } = importLegacy(store, DEV);
  assert.equal(lists.length, 1);
  assert.equal(liveItems(lists[0].doc)[0].t[0], 'sal');
});

test('nothing to import on a fresh phone', () => {
  assert.deepEqual(importLegacy({}, DEV).lists, []);
  assert.deepEqual(importLegacy({ inputs: '["", ""]' }, DEV).lists, []);
});

test('old link formats are recognized', () => {
  assert.equal(legacyLinkId('https://vdm285.github.io/listolista/?room=room_0123456789abcdef0123456789abcdef'), 'room_0123456789abcdef0123456789abcdef');
  assert.equal(legacyLinkId('https://vdm285.github.io/listolista/?local=local_1792643903472'), 'local_1792643903472');
  assert.equal(legacyLinkId('https://vdm285.github.io/listolista/#mju992ww53qm1'), 'mju992ww53qm1');
  assert.equal(legacyLinkId('https://vdm285.github.io/listolista/#k=abc'), null);
  assert.equal(legacyLinkId('https://vdm285.github.io/listolista/'), null);
});

test('sentence case only touches all-capitals titles', () => {
  assert.equal(sentenceCase('SÚPER DEL SÁBADO'), 'Súper del sábado');
  assert.equal(sentenceCase('Fiesta de Ana'), 'Fiesta de Ana');
  assert.equal(sentenceCase('ÑOÑO'), 'Ñoño');
});
