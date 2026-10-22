import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/app/store.js';
import { liveItems, isDone, canonical } from '../src/model/doc.js';

class Mem {
  constructor(init = {}) { this.m = new Map(Object.entries(init)); }
  get length() { return this.m.size; }
  key(i) { return [...this.m.keys()][i] ?? null; }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
}
const texts = (s) => s.items().map((i) => i.t[0]);

test('a fresh phone opens a new, empty sheet and keeps it after a flush', () => {
  const mem = new Mem();
  const s = new Store(mem);
  s.boot('https://x.test/listolista/');
  assert.equal(s.items().length, 0);
  s.add('tortillas, jitomate');
  s.flush();
  const again = new Store(mem);
  again.boot('https://x.test/listolista/');
  assert.deepEqual(texts(again), ['tortillas', 'jitomate']);
});

test('undo brings back a delete, a clear, an emptied sheet and an edit', () => {
  const s = new Store(new Mem());
  s.boot('https://x.test/');
  const [a, b] = s.add('leche, pan, huevos');
  s.remove(a);
  assert.deepEqual(texts(s), ['pan', 'huevos']);
  s.undo();
  assert.deepEqual(texts(s), ['leche', 'pan', 'huevos']);
  s.toggle(b);
  s.clearStruck();
  assert.deepEqual(texts(s), ['leche', 'huevos']);
  s.undo();
  assert.ok(s.items().some((i) => i.t[0] === 'pan' && isDone(i)));
  s.emptyList();
  assert.equal(s.items().length, 0);
  s.undo();
  assert.equal(s.items().length, 3);
  s.edit(a, 'leche deslactosada');
  s.undo();
  assert.equal(s.doc.items[a].t[0], 'leche');
});

test('a split replaces one item by its pieces and can be undone', () => {
  const s = new Store(new Mem());
  s.boot('https://x.test/');
  const [id] = s.add('huevos leche tortillas');
  s.split(id, ['huevos', 'leche', 'tortillas']);
  assert.deepEqual(texts(s), ['huevos', 'leche', 'tortillas']);
  s.undo();
  assert.deepEqual(texts(s), ['huevos leche tortillas']);
});

test('this phone writes in its preferred ink; two phones never share one', async () => {
  const a = new Store(new Mem());
  a.boot('https://x.test/');
  assert.equal(a.inkOf(a.device), 'azul');
  a.add('tortillas');
  a.setSecret('A'.repeat(43), 'r'.repeat(32));
  a.ensureInk();
  await new Promise((r) => setTimeout(r, 5)); // real phones claim seconds apart (a same-millisecond tie is decided by the clock's counter)
  const b = new Store(new Mem());
  b.openShared('A'.repeat(43), 'r'.repeat(32));
  b.ensureInk(); // claims blue before seeing A's copy
  assert.equal(b.inkOf(b.device), 'azul');
  b.applyRemote(JSON.parse(canonical(a.doc)));
  assert.notEqual(b.inkOf(b.device), 'azul', 'B gives way: A claimed blue first');
  a.applyRemote(JSON.parse(canonical(b.doc)));
  assert.equal(a.inkOf(b.device), b.inkOf(b.device));
  assert.equal(a.inkOf(a.device), 'azul');
});

test('a phone already on the sheet learns that a new phone joined; the newcomer does not', () => {
  const a = new Store(new Mem());
  a.boot('https://x.test/');
  a.add('pan');
  a.setSecret('B'.repeat(43), 'q'.repeat(32));
  a.ensureInk();
  const b = new Store(new Mem());
  b.openShared('B'.repeat(43), 'q'.repeat(32));
  const seenByB = b.applyRemote(JSON.parse(canonical(a.doc)));
  assert.deepEqual(seenByB.joined, []);
  const seenByA = a.applyRemote(JSON.parse(canonical(b.doc)));
  assert.deepEqual(seenByA.joined, [b.device]);
});

test('"lo de siempre" suggests what is due and not already on the page', () => {
  const s = new Store(new Mem());
  s.boot('https://x.test/');
  const day = 864e5;
  const now = Date.now();
  s.history = {
    tortilla: { text: 'tortillas', n: 9, last: now - 1 * day, gaps: [3 * day] },
    'papel bano': { text: 'papel de baño', n: 3, last: now - 16 * day, gaps: [14 * day] },
    sal: { text: 'sal', n: 1, last: now - 40 * day, gaps: [] },
  };
  s.add('tortillas');
  const u = s.usual().map((x) => x.text);
  assert.deepEqual(u, ['papel de baño']); // tortillas is on the page; sal was bought only once
});

test('the old app\'s lists are imported once', () => {
  const old = { listolista_data_local_1: JSON.stringify({ items: [{ id: 1792643903802, text: 'huevos', done: false, timestamp: 1792643903802 }], meta: { title: 'SÚPER' } }) };
  const mem = new Mem(old);
  const s = new Store(mem);
  s.boot('https://x.test/');
  assert.equal(s.index.length, 1);
  assert.deepEqual(s.notices.map((n) => n.kind), ['legacy']);
  const again = new Store(mem);
  again.boot('https://x.test/');
  assert.equal(again.index.length, 1, 'not imported twice');
  assert.equal(mem.getItem('listolista_data_local_1'), old.listolista_data_local_1, 'old key untouched');
});

test('a list remembers when it last synced, and a new link starts over', () => {
  const s = new Store(new Mem());
  s.boot('https://x.test/');
  s.setSecret('C'.repeat(43), 'p'.repeat(32));
  s.noteSynced(1_800_000_000);
  s.noteSynced(1_700_000_000); // older: ignored
  assert.equal(s.rec.syncedAt, 1_800_000_000);
  s.setSecret('D'.repeat(43), 'o'.repeat(32));
  assert.equal(s.rec.syncedAt, 0);
});

test('hostile copies from a relay cannot break the sheet', () => {
  const s = new Store(new Mem());
  s.boot('https://x.test/');
  s.add('leche');
  for (const bad of [null, 42, 'x', { v: 2, items: { '<img>': 1 } }, { v: 2, title: [{}, 'z'], items: [] }, { v: 3 }]) s.applyRemote(bad);
  assert.deepEqual(texts(s), ['leche']);
});
