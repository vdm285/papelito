import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClock, parse, isStamp, randomId } from '../src/model/hlc.js';
import {
  emptyDoc, addItem, setText, setDone, setFix, fixes, setDeleted, setTitle, setOrder, setDevice,
  merge, sameDoc, canonical, diff, compact, sanitize, liveItems, maxStamp, TOMBSTONE_DAYS,
} from '../src/model/doc.js';

// Deterministic PRNG (mulberry32) so a failing seed can be replayed.
const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const clone = (d) => sanitize(JSON.parse(canonical(d)));

test('clock: stamps are valid, strictly increasing, and survive a clock that goes backwards', () => {
  let t = 1_000_000;
  const c = createClock('aaaaaaaa', () => t);
  const s1 = c.tick();
  t -= 5000; // the phone's clock jumps back
  const s2 = c.tick();
  const s3 = c.tick();
  assert.ok(isStamp(s1) && isStamp(s2) && isStamp(s3));
  assert.ok(s1 < s2 && s2 < s3);
  assert.equal(parse(s3).device, 'aaaaaaaa');
});

test('clock: after observing a stamp from a phone that is ahead, the next tick sorts after it', () => {
  const slow = createClock('slowslow', () => 1000);
  const fast = createClock('fastfast', () => 9_000_000);
  const remote = fast.tick();
  slow.observe(remote);
  assert.ok(slow.tick() > remote);
});

test('randomId: right length and alphabet', () => {
  for (let i = 0; i < 200; i++) assert.match(randomId(), /^[0-9a-z]{8}$/);
});

test('basic edits read back', () => {
  const c = createClock('aaaaaaaa');
  const d = emptyDoc();
  addItem(d, c, 'item0001', '  huevos   blancos ');
  addItem(d, c, 'item0002', 'leche');
  setDone(d, c, 'item0001', true);
  setFix(d, c, 'leche', 'lac');
  setTitle(d, c, 'Súper del sábado');
  const items = liveItems(d);
  assert.deepEqual(items.map((i) => i.t[0]), ['huevos blancos', 'leche']);
  assert.equal(items[0].d[0], 'aaaaaaaa');
  assert.deepEqual({ ...fixes(d) }, { leche: 'lac' });
  setDeleted(d, c, 'item0001', true);
  assert.deepEqual(liveItems(d).map((i) => i.id), ['item0002']);
});

test('two phones edit offline; both merges converge and keep both changes', () => {
  const a = createClock('phonea00');
  const b = createClock('phoneb00');
  const base = emptyDoc();
  addItem(base, a, 'item0001', 'tortillas');
  const da = clone(base);
  const db = clone(base);
  setDone(da, a, 'item0001', true); // A strikes tortillas at the store
  addItem(db, b, 'item0002', 'aguacate'); // B adds avocado at home
  const m1 = merge(da, db);
  const m2 = merge(db, da);
  assert.ok(sameDoc(m1, m2));
  assert.equal(m1.items.item0001.d[0], 'phonea00');
  assert.equal(m1.items.item0002.t[0], 'aguacate');
});

test('delete beats an older edit and loses to a newer restore', () => {
  const a = createClock('phonea00', () => 1000);
  let tb = 2000;
  const b = createClock('phoneb00', () => tb);
  const d = emptyDoc();
  addItem(d, a, 'item0001', 'pan');
  const da = clone(d);
  const db = clone(d);
  setText(da, a, 'item0001', 'pan bimbo');
  setDeleted(db, b, 'item0001', true);
  let m = merge(da, db);
  assert.equal(liveItems(m).length, 0);
  tb = 3000;
  setDeleted(db, b, 'item0001', false);
  m = merge(da, db);
  assert.equal(liveItems(m)[0].t[0], 'pan bimbo');
});

test('property: random edits on three phones with skewed clocks, merged at random, converge', () => {
  for (let seed = 1; seed <= 150; seed++) {
    const r = rng(seed);
    let wall = 1_700_000_000_000;
    const skews = [0, -600_000, 3_600_000]; // one phone 10 min behind, one an hour ahead
    const clocks = ['phonea00', 'phoneb00', 'phonec00'].map((id, i) => createClock(id, () => wall + skews[i]));
    const docs = [emptyDoc(), emptyDoc(), emptyDoc()];
    const ids = [];
    for (let step = 0; step < 60; step++) {
      wall += Math.floor(r() * 3000);
      const p = Math.floor(r() * 3);
      const c = clocks[p];
      const d = docs[p];
      const op = r();
      const known = Object.keys(d.items);
      const pick = () => known[Math.floor(r() * known.length)];
      if (op < 0.3 || !known.length) { const id = `it${String(ids.length).padStart(6, '0')}`; ids.push(id); addItem(d, c, id, `cosa ${ids.length}`); }
      else if (op < 0.5) setDone(d, c, pick(), r() < 0.7);
      else if (op < 0.6) setText(d, c, pick(), `texto ${step}`);
      else if (op < 0.7) setFix(d, c, r() < 0.5 ? 'leche' : 'cafe molido', r() < 0.6 ? 'lac' : '');
      else if (op < 0.8) setDeleted(d, c, pick(), r() < 0.8);
      else if (op < 0.85) setTitle(d, c, `lista ${step}`);
      else if (op < 0.88) setOrder(d, c, r() < 0.5 ? ['frutas', 'carnes'] : null);
      else if (op < 0.9) setDevice(d, c, 'ink', r() < 0.5 ? 'azul' : 'verde');
      else {
        // sometimes time passes and a phone purges its old tombstones
        if (r() < 0.25) { wall += (TOMBSTONE_DAYS + 1) * 864e5 * r(); compact(docs[p], wall + skews[p]); }
        // sync two phones (one direction or both), observing stamps like the app does
        const q = (p + 1 + Math.floor(r() * 2)) % 3;
        const m = merge(docs[p], docs[q]);
        clocks[p].observe(maxStamp(m));
        docs[p] = m;
        if (r() < 0.5) { clocks[q].observe(maxStamp(m)); docs[q] = clone(m); }
      }
    }
    const [x, y, z] = docs;
    // laws
    assert.ok(sameDoc(merge(x, y), merge(y, x)), `commutative, seed ${seed}`);
    assert.ok(sameDoc(merge(merge(x, y), z), merge(x, merge(y, z))), `associative, seed ${seed}`);
    assert.ok(sameDoc(merge(x, x), x), `idempotent, seed ${seed}`);
    // convergence: everyone receives everything, in different orders
    const all1 = merge(merge(x, y), z);
    const all2 = merge(z, merge(y, x));
    const all3 = merge(merge(y, z), merge(x, z));
    assert.ok(sameDoc(all1, all2) && sameDoc(all2, all3), `converges, seed ${seed}`);
    // a round trip through JSON + sanitize changes nothing
    assert.ok(sameDoc(clone(all1), all1), `sanitize keeps a valid doc, seed ${seed}`);
  }
});

test('diff reports what the other phone did', () => {
  const a = createClock('phonea00');
  const before = emptyDoc();
  addItem(before, a, 'item0001', 'jitomate');
  addItem(before, a, 'item0002', 'cebolla');
  const after = clone(before);
  addItem(after, a, 'item0003', 'cilantro');
  setDone(after, a, 'item0001', true);
  setText(after, a, 'item0002', 'cebolla morada');
  setTitle(after, a, 'Para la salsa');
  const ch = diff(before, after);
  assert.deepEqual(ch.added, ['item0003']);
  assert.deepEqual(ch.struck, ['item0001']);
  assert.deepEqual(ch.edited, ['item0002']);
  assert.equal(ch.title, true);
});

test('a purged item never comes back from a stale copy (and the control without `seen` would)', () => {
  let now = 1_800_000_000_000;
  const a = createClock('phonea00', () => now);
  const b = createClock('phoneb00', () => now);
  const d = emptyDoc();
  addItem(d, a, 'item0001', 'cilantro');
  addItem(d, a, 'item0002', 'cebolla');
  const stale = clone(d); // phone B goes into a drawer
  setDeleted(d, a, 'item0001', true);
  now += (TOMBSTONE_DAYS + 5) * 864e5;
  compact(d, now); // the tombstone is purged on phone A
  assert.equal(d.items.item0001, undefined);
  addItem(stale, b, 'item0003', 'limones'); // B adds offline, months later
  const m1 = merge(d, stale);
  const m2 = merge(stale, d);
  assert.ok(sameDoc(m1, m2));
  assert.deepEqual(liveItems(m1).map((i) => i.t[0]).sort(), ['cebolla', 'limones']);
  // control: forget what A had seen, and the deleted item resurrects
  const forgetful = clone(d);
  forgetful.seen = Object.create(null);
  assert.ok(liveItems(merge(forgetful, stale)).some((i) => i.t[0] === 'cilantro'), 'control should resurrect');
});

test('compact drops only old tombstones', () => {
  const now = 1_800_000_000_000;
  const old = createClock('phonea00', () => now - (TOMBSTONE_DAYS + 1) * 864e5);
  const fresh = createClock('phoneb00', () => now);
  const d = emptyDoc();
  addItem(d, old, 'item0001', 'viejo');
  setDeleted(d, old, 'item0001', true);
  addItem(d, fresh, 'item0002', 'nuevo');
  setDeleted(d, fresh, 'item0002', true);
  addItem(d, old, 'item0003', 'vivo pero viejo');
  compact(d, now);
  assert.deepEqual(Object.keys(d.items).sort(), ['item0002', 'item0003']);
});

test('sanitize rejects hostile input', () => {
  const bad = {
    v: 2,
    title: ['x'.repeat(500), '0000000010000aaaaaaaa'],
    order: [['<script>'], '0000000010000aaaaaaaa'],
    dev: { __proto__x: {}, 'BAD!': {} },
    items: {
      '__proto__': { c: 'x' },
      good0001: { c: '0000000010000aaaaaaaa', by: 'aaaaaaaa', t: ['ok', '0000000010000aaaaaaaa'], d: ['', ''], x: [0, ''] },
      bad00001: { c: '0000000010000aaaaaaaa', by: 'aaaaaaaa', t: [{ evil: 1 }, '0000000010000aaaaaaaa'], d: ['', ''], x: [0, ''] },
    },
    fix: {
      leche: ['lac', '0000000010000aaaaaaaa'],
      'Bad Key!': ['lac', '0000000010000aaaaaaaa'],
      cafe: ['<b>', '0000000010000aaaaaaaa'],
    },
  };
  // a literal __proto__ key only survives as an own key when it arrives as JSON text
  const json = JSON.stringify(bad).replace('"items":{', '"items":{"__proto__":{"c":"x"},"constructor":{"c":"0000000010000aaaaaaaa"},');
  const d = sanitize(JSON.parse(json));
  assert.equal(d.title[0], '');
  assert.equal(d.order[0], null);
  assert.deepEqual(Object.keys(d.items), ['good0001']);
  assert.equal(Object.keys(d.dev).length, 0);
  assert.deepEqual(Object.keys(d.fix), ['leche']);
  assert.equal(sanitize(null).v, 2);
  assert.equal(sanitize({ v: 1 }).title[1], '');
});
