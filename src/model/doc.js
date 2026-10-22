// A list is a plain JSON document that any two phones can merge, in any order and any number of
// times, and reach the same result (a state-based CRDT). Every field is a register
// [value, stamp]; the later stamp wins (stamps come from hlc.js, so "later" survives a phone with
// a wrong clock). Deleting an item keeps a tombstone so the deletion reaches the other phone.
//
// doc = {
//   v: 2,
//   title: [text, stamp],
//   order: [aisleIds | null, stamp],          the walking order of the store for this list
//   dev:   { [deviceId]: { ink: [color, stamp], name: [text, stamp] } },
//   items: { [itemId]: {
//     c: stamp,                               created (also the default order on the page)
//     by: deviceId,                           who wrote it (its ink)
//     t: [text, stamp],
//     d: [deviceId | '', stamp],              struck, and by whom ('' = not struck)
//     a: [aisleId | '', stamp],               aisle chosen by hand ('' = let the dictionary decide)
//     x: [0 | 1, stamp],                      1 = deleted (tombstone)
//   } }
// }
// An unset register has the stamp '' (every real stamp sorts after it).

import { isStamp, stampTime, DEVICE_LEN } from './hlc.js';

export const DOC_VERSION = 2;
export const LIMITS = { items: 600, text: 160, title: 60, name: 24, aisles: 40, devices: 24 };
export const TOMBSTONE_DAYS = 60;

const ID_RE = /^[0-9a-z]{8,12}$/;
const DEV_RE = new RegExp(`^[0-9a-z]{${DEVICE_LEN}}$`);
const AISLE_RE = /^[a-z][a-z0-9-]{0,23}$/;
const INK_RE = /^[a-z]{3,12}$/;

const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
// Registers: keep the one with the later stamp. Equal stamps carry equal values unless a copy was
// crafted; the value tie-break keeps the merge order-independent even then.
const later = (a, b) => (b[1] > a[1] ? b : b[1] < a[1] ? a : JSON.stringify(b[0]) > JSON.stringify(a[0]) ? b : a);
const reg = (v, s) => [v, s];

export function emptyDoc() {
  return { v: DOC_VERSION, title: reg('', ''), order: reg(null, ''), dev: Object.create(null), items: Object.create(null) };
}

// ---------- reading ----------

export const isLive = (it) => it && it.x[0] !== 1;
export const isDone = (it) => it.d[0] !== '';

/** Live items in page order: by creation stamp (the order they were written). */
export function liveItems(doc) {
  return Object.entries(doc.items)
    .filter(([, it]) => isLive(it))
    .sort((a, b) => (a[1].c < b[1].c ? -1 : a[1].c > b[1].c ? 1 : 0))
    .map(([id, it]) => ({ id, ...it }));
}

// ---------- writing (mutate the doc; each change takes a fresh stamp from the clock) ----------

export function addItem(doc, clock, id, text) {
  const s = clock.tick();
  doc.items[id] = { c: s, by: clock.device, t: reg(clip(text, LIMITS.text), s), d: reg('', s), a: reg('', s), x: reg(0, s) };
  return id;
}

export function setText(doc, clock, id, text) {
  const it = doc.items[id];
  if (it) it.t = reg(clip(text, LIMITS.text), clock.tick());
}

export function setDone(doc, clock, id, done) {
  const it = doc.items[id];
  if (it) it.d = reg(done ? clock.device : '', clock.tick());
}

export function setAisle(doc, clock, id, aisle) {
  const it = doc.items[id];
  if (it) it.a = reg(aisle || '', clock.tick());
}

export function setDeleted(doc, clock, id, deleted) {
  const it = doc.items[id];
  if (it) it.x = reg(deleted ? 1 : 0, clock.tick());
}

export function setTitle(doc, clock, title) {
  doc.title = reg(clip(title, LIMITS.title), clock.tick());
}

export function setOrder(doc, clock, aisles) {
  doc.order = reg(aisles ? aisles.slice(0, LIMITS.aisles) : null, clock.tick());
}

export function setDevice(doc, clock, field, value) {
  const d = (doc.dev[clock.device] ||= { ink: reg('', ''), name: reg('', '') });
  d[field] = reg(field === 'name' ? clip(value, LIMITS.name) : value, clock.tick());
}

const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

// ---------- merging ----------

/** Merge two documents. Pure, commutative, associative and idempotent. */
export function merge(a, b) {
  const out = emptyDoc();
  out.title = later(a.title, b.title);
  out.order = later(a.order, b.order);
  for (const src of [a.dev, b.dev]) {
    for (const k of Object.keys(src)) {
      const cur = out.dev[k];
      const d = src[k];
      out.dev[k] = cur ? { ink: later(cur.ink, d.ink), name: later(cur.name, d.name) } : { ink: d.ink, name: d.name };
    }
  }
  for (const src of [a.items, b.items]) {
    for (const k of Object.keys(src)) {
      const cur = out.items[k];
      const it = src[k];
      if (!cur) { out.items[k] = { ...it }; continue; }
      // creation: the earlier stamp (both phones normally carry the same one)
      const first = it.c < cur.c || (it.c === cur.c && it.by < cur.by) ? it : cur;
      out.items[k] = { c: first.c, by: first.by, t: later(cur.t, it.t), d: later(cur.d, it.d), a: later(cur.a, it.a), x: later(cur.x, it.x) };
    }
  }
  return out;
}

/** The newest stamp anywhere in the document (to advance the clock after a merge). */
export function maxStamp(doc) {
  let m = '';
  const see = (r) => { if (r[1] > m) m = r[1]; };
  see(doc.title); see(doc.order);
  for (const d of Object.values(doc.dev)) { see(d.ink); see(d.name); }
  for (const it of Object.values(doc.items)) { see(it.t); see(it.d); see(it.a); see(it.x); }
  return m;
}

/** True when the two documents hold the same registers (cheap enough for lists this size). */
export function sameDoc(a, b) {
  return canonical(a) === canonical(b);
}

/** A deterministic serialization (sorted keys), used for equality and as the bytes we encrypt. */
export function canonical(doc) {
  const sortObj = (o) => Object.keys(o).sort().reduce((acc, k) => { acc[k] = o[k]; return acc; }, {});
  const items = sortObj(doc.items);
  const dev = sortObj(doc.dev);
  return JSON.stringify({ v: DOC_VERSION, title: doc.title, order: doc.order, dev, items });
}

/** What changed from `before` to `after`, for animating the other phone's work. */
export function diff(before, after) {
  const changes = { added: [], removed: [], struck: [], unstruck: [], edited: [], moved: [], title: before.title[0] !== after.title[0] };
  for (const [id, it] of Object.entries(after.items)) {
    const old = before.items[id];
    const was = old && isLive(old);
    const is = isLive(it);
    if (is && !was) { changes.added.push(id); continue; }
    if (!is && was) { changes.removed.push(id); continue; }
    if (!is) continue;
    if (isDone(it) && !isDone(old)) changes.struck.push(id);
    if (!isDone(it) && isDone(old)) changes.unstruck.push(id);
    if (it.t[0] !== old.t[0]) changes.edited.push(id);
    if (it.a[0] !== old.a[0]) changes.moved.push(id);
  }
  return changes;
}

/** Drop tombstones older than TOMBSTONE_DAYS (a phone offline longer than that may resurrect one). */
export function compact(doc, now = Date.now()) {
  const cutoff = now - TOMBSTONE_DAYS * 864e5;
  for (const [id, it] of Object.entries(doc.items)) {
    if (it.x[0] === 1 && stampTime(it.x[1]) < cutoff) delete doc.items[id];
  }
  return doc;
}

// ---------- validation of anything that arrives from outside ----------

const okReg = (r, test) => Array.isArray(r) && r.length === 2 && (r[1] === '' || isStamp(r[1])) && test(r[0]);
const okText = (n) => (v) => typeof v === 'string' && v.length <= n;

/**
 * Rebuild a document from untrusted JSON, keeping only well-formed fields. Anyone with a list's
 * link can write to it, so a decrypted copy is still treated as hostile input.
 */
export function sanitize(raw) {
  const doc = emptyDoc();
  if (!raw || typeof raw !== 'object' || raw.v !== DOC_VERSION) return doc;
  if (okReg(raw.title, okText(LIMITS.title))) doc.title = [raw.title[0], raw.title[1]];
  if (okReg(raw.order, (v) => v === null || (Array.isArray(v) && v.length <= LIMITS.aisles && v.every((x) => typeof x === 'string' && AISLE_RE.test(x))))) {
    doc.order = [raw.order[0] ? [...raw.order[0]] : null, raw.order[1]];
  }
  if (raw.dev && typeof raw.dev === 'object') {
    for (const k of Object.keys(raw.dev).slice(0, LIMITS.devices)) {
      const d = raw.dev[k];
      if (!DEV_RE.test(k) || !d || typeof d !== 'object') continue;
      const ink = okReg(d.ink, (v) => v === '' || (typeof v === 'string' && INK_RE.test(v))) ? [d.ink[0], d.ink[1]] : ['', ''];
      const name = okReg(d.name, okText(LIMITS.name)) ? [d.name[0], d.name[1]] : ['', ''];
      doc.dev[k] = { ink, name };
    }
  }
  if (raw.items && typeof raw.items === 'object') {
    let n = 0;
    for (const k of Object.keys(raw.items)) {
      if (n >= LIMITS.items) break;
      const it = raw.items[k];
      if (!ID_RE.test(k) || !it || typeof it !== 'object' || !own(raw.items, k)) continue;
      if (!isStamp(it.c) || typeof it.by !== 'string' || !DEV_RE.test(it.by)) continue;
      if (!okReg(it.t, okText(LIMITS.text))) continue;
      if (!okReg(it.d, (v) => v === '' || (typeof v === 'string' && DEV_RE.test(v)))) continue;
      if (!okReg(it.a, (v) => v === '' || (typeof v === 'string' && AISLE_RE.test(v)))) continue;
      if (!okReg(it.x, (v) => v === 0 || v === 1)) continue;
      doc.items[k] = { c: it.c, by: it.by, t: [it.t[0], it.t[1]], d: [it.d[0], it.d[1]], a: [it.a[0], it.a[1]], x: [it.x[0], it.x[1]] };
      n++;
    }
  }
  return doc;
}
