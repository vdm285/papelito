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

test('a seventh phone borrows the quietest phone\'s ink, and does not keep re-claiming it', async () => {
  const phones = [];
  const secret = 'C'.repeat(43);
  const first = new Store(new Mem());
  first.boot('https://x.test/');
  first.setSecret(secret, 'p'.repeat(32));
  first.ensureInk();
  phones.push(first);
  let doc = JSON.parse(canonical(first.doc));
  for (let i = 1; i < 6; i++) {
    await new Promise((r) => setTimeout(r, 3));
    const p = new Store(new Mem());
    p.openShared(secret, 'p'.repeat(32));
    p.applyRemote(doc);
    p.ensureInk();
    p.resolveInk();
    p.add(`cosa ${i}`); // everyone but the first phone wrote something lately
    doc = JSON.parse(canonical(p.doc));
    phones.push(p);
  }
  const inks = new Set(phones.map((p) => p.inkOf(p.device)));
  assert.equal(inks.size, 6, 'six phones, six inks');
  const late = new Store(new Mem());
  late.openShared(secret, 'p'.repeat(32));
  late.applyRemote(doc);
  late.ensureInk();
  late.resolveInk();
  assert.equal(late.inkOf(late.device), first.inkOf(first.device), 'the quietest phone (the first) lends its ink');
  const before = canonical(late.doc);
  late.resolveInk();
  late.applyRemote(doc);
  assert.equal(canonical(late.doc), before, 'no claim loop');
});

test('deleting a sheet from the list card can be undone, and reopens it if it was open', () => {
  const s = new Store(new Mem());
  s.boot('https://x.test/');
  s.add('cilantro');
  const id = s.rec.id;
  s.newList();
  s.add('pan');
  s.open(id);
  const back = s.forgetList(id);
  assert.ok(!s.index.some((l) => l.id === id));
  assert.notEqual(s.rec.id, id);
  back();
  assert.equal(s.rec.id, id);
  assert.deepEqual(texts(s), ['cilantro']);
});

test('a blank, untitled, unshared sheet is dropped when you leave it', () => {
  const s = new Store(new Mem());
  s.boot('https://x.test/');
  s.add('leche');
  const kept = s.rec.id;
  s.newList();
  const blank = s.rec.id;
  s.open(kept);
  assert.ok(!s.index.some((l) => l.id === blank));
  assert.equal(s.index.length, 1);
});

test('two tabs never clobber each other\'s list of sheets', () => {
  const mem = new Mem();
  const a = new Store(mem);
  a.boot('https://x.test/');
  a.add('pan');
  a.flush();
  const b = new Store(mem); // a second tab, opened now
  b.boot('https://x.test/');
  a.newList();
  a.add('jabón');
  a.flush();
  const made = a.rec.id;
  b.setTitle('Súper');
  b.flush();
  b.saveIndex(); // B still holds the index it read before A's new sheet
  assert.ok(new Store(mem).index.some((l) => l.id === made), 'A\'s new sheet survives B saving');
  a.forgetList(made);
  b.saveIndex();
  assert.ok(!new Store(mem).index.some((l) => l.id === made), 'and a sheet A deleted is not brought back by B');
});

test('a link with a trailing period opens; a cut one says so', () => {
  const s = new Store(new Mem());
  assert.equal(s.boot(`https://x.test/#k=${'D'.repeat(43)}.`).secret, 'D'.repeat(43));
  assert.equal(new Store(new Mem()).boot(`https://x.test/#k=${'D'.repeat(44)}`).badLink, true, 'one character too many is not silently cut');
  assert.equal(new Store(new Mem()).boot(`https://x.test/#k=${'D'.repeat(20)}`).badLink, true);
});

test('a browser that refuses storage is noticed', () => {
  const refusing = { get length() { return 0; }, key: () => null, getItem: () => null, setItem() { throw new Error('QuotaExceededError'); }, removeItem() {} };
  const s = new Store(refusing);
  assert.ok(s.notices.some((n) => n.kind === 'noStorage'));
});
