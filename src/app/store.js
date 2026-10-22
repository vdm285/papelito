// The app's state, local first. A list is read from localStorage synchronously at boot so the
// first frame shows it (the Notepad benchmark); the network only ever adds to it.
//
// localStorage keys (prefix "ll."; the old app's keys are never touched, see src/model/legacy.js):
//   ll.device          this phone's id (8 chars) — also its slot on the relays
//   ll.lists           [{ id, title, updated, shared }]   the index for "Mis hojas"
//   ll.list.<id>       { id, secret?, doc, aisles, seen, wasShared?, oldId? }
//   ll.last            id of the list open last
//   ll.prefs           { lang, theme, hand, doodles, motion, awake }
//   ll.history         { [key]: { text, n, last, gaps } }  what this household buys (never synced)
//   ll.imported        1 once the old versions' lists have been imported

import { createClock, randomId } from '../model/hlc.js';
import {
  emptyDoc, addItem, setText, setDone, setDeleted, setTitle, setOrder, setDevice, setFix, fixes,
  merge, diff, sanitize, compact, canonical, liveItems, isDone, isLive, maxStamp,
} from '../model/doc.js';
import { splitInput } from '../model/parse.js';
import { keyOf } from '../model/aisles.js';
import { importLegacy, legacyLinkId } from '../model/legacy.js';

export const INKS = ['azul', 'roja', 'verde', 'negra', 'morada', 'cafe'];

const K = {
  device: 'll.device', lists: 'll.lists', last: 'll.last', prefs: 'll.prefs', history: 'll.history', imported: 'll.imported',
  list: (id) => `ll.list.${id}`,
};

// ---------- storage that never throws (private mode, full disk, blocked) ----------
function safeStorage(backend) {
  const get = () => backend || (typeof localStorage !== 'undefined' ? localStorage : null);
  return {
    get(k) { try { return get().getItem(k); } catch { return null; } },
    set(k, v) { try { get().setItem(k, v); return true; } catch { return false; } },
    remove(k) { try { get().removeItem(k); } catch { /* ignore */ } },
    json(k, d) { try { const v = JSON.parse(get().getItem(k)); return v ?? d; } catch { return d; } },
    snapshot() { const o = {}; try { const st = get(); for (let i = 0; i < st.length; i++) { const k = st.key(i); o[k] = st.getItem(k); } } catch { /* blocked */ } return o; },
  };
}

const DEFAULT_PREFS = { lang: '', theme: 'auto', hand: 'mano', doodles: true, motion: true, awake: false };

export class Store {
  constructor(backend) {
    const ls = (this.ls = safeStorage(backend));
    this.listeners = new Set();
    this.i18n = null;
    let device = ls.get(K.device);
    if (!device || !/^[0-9a-z]{8}$/.test(device)) { device = randomId(8); ls.set(K.device, device); }
    this.device = device;
    this.clock = createClock(device);
    this.prefs = { ...DEFAULT_PREFS, ...ls.json(K.prefs, {}) };
    this.history = ls.json(K.history, {});
    this.index = ls.json(K.lists, []);
    if (!Array.isArray(this.index)) this.index = [];
    this.undoStack = [];
    this.rec = null;
    this.saveTimer = 0;
    this.notices = [];
  }

  // ---------- events ----------
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(kind, detail) { for (const fn of this.listeners) fn(kind, detail); }

  // ---------- boot ----------
  /** Pick the list to show from the URL and storage. Returns { rec, secret, legacyMissing }. */
  boot(href) {
    this.importOldVersionsOnce();
    const url = new URL(href);
    const m = url.hash.match(/^#k=([A-Za-z0-9_-]{43})$/);
    if (m) return { secret: m[1] }; // the session resolves the room, then calls openShared()
    const old = legacyLinkId(href);
    if (old) {
      const hit = this.index.find((l) => l.oldId === old);
      if (hit) { this.open(hit.id); return { rec: this.rec, cleanUrl: true }; }
      this.openLast();
      return { rec: this.rec, legacyMissing: true, cleanUrl: true };
    }
    const l = url.hash.match(/^#l=([0-9a-z]{10})$/);
    if (l && this.index.some((x) => x.id === l[1])) { this.open(l[1]); return { rec: this.rec }; }
    this.openLast();
    return { rec: this.rec };
  }

  importOldVersionsOnce() {
    if (this.ls.get(K.imported)) return;
    const { lists } = importLegacy(this.ls.snapshot(), this.device);
    let n = 0;
    for (const l of lists) {
      if (this.index.some((x) => x.oldId === l.oldId)) continue;
      const id = randomId(10);
      const rec = { id, doc: l.doc, aisles: false, seen: maxStamp(l.doc), wasShared: l.wasShared, oldId: l.oldId };
      this.writeRec(rec);
      this.index.push({ id, title: l.title, updated: l.lastVisited || Date.now(), shared: false, oldId: l.oldId });
      n++;
    }
    if (n) { this.saveIndex(); this.notices.push({ kind: 'legacy', n }); }
    this.ls.set(K.imported, '1');
  }

  openLast(newest = false) {
    const last = newest ? null : this.ls.get(K.last);
    const pick = this.index.find((l) => l.id === last) || [...this.index].sort((a, b) => b.updated - a.updated)[0];
    if (pick) this.open(pick.id); else this.newList();
  }

  open(id) {
    if (this.rec && this.rec.id !== id) { this.flush(); this.dropIfBlank(); }
    const raw = this.ls.json(K.list(id), null);
    if (!raw) { this.newList(); return; }
    // this phone's own copy is trusted with its stamps (no future horizon): if the clock was set
    // back after writing, nothing written before may disappear
    const rec = { id, secret: raw.secret, doc: compact(sanitize(raw.doc, Infinity)), aisles: !!raw.aisles, seen: raw.seen || '', wasShared: !!raw.wasShared, oldId: raw.oldId, syncedAt: Number(raw.syncedAt) || 0 };
    this.clock.observe(maxStamp(rec.doc));
    this.rec = rec;
    this.undoStack = [];
    this.ls.set(K.last, id);
    this.emit('list', rec);
  }

  /** A shared list arrives by its secret: find it on this phone or start an empty copy of it. */
  openShared(secret, room) {
    let entry = this.index.find((l) => l.room === room);
    if (!entry) {
      const id = randomId(10);
      const rec = { id, secret, doc: emptyDoc(), aisles: false, seen: '' };
      this.writeRec(rec);
      entry = { id, title: '', updated: Date.now(), shared: true, room };
      this.index.push(entry);
      this.saveIndex();
      this.notices.push({ kind: 'firstShared' });
    }
    this.open(entry.id);
    if (this.rec.secret !== secret) { this.rec.secret = secret; this.save(); }
    return this.rec;
  }

  newList() {
    this.flush();
    this.dropIfBlank();
    const id = randomId(10);
    const rec = { id, doc: emptyDoc(), aisles: false, seen: '' };
    this.writeRec(rec);
    this.index.push({ id, title: '', updated: Date.now(), shared: false });
    this.saveIndex();
    this.rec = rec;
    this.undoStack = [];
    this.ls.set(K.last, id);
    this.emit('list', rec);
    return rec;
  }

  /** Remove a sheet from this phone. Returns a function that brings it back (and reopens it). */
  forgetList(id) {
    const i = this.index.findIndex((l) => l.id === id);
    if (i < 0) return () => {};
    if (this.rec && this.rec.id === id) this.flush();
    const entry = this.index[i];
    const raw = this.ls.get(K.list(id));
    const wasOpen = this.rec && this.rec.id === id;
    this.index.splice(i, 1);
    this.saveIndex();
    this.ls.remove(K.list(id));
    if (wasOpen) this.openLast(true);
    this.emit('index');
    return () => {
      if (raw) this.ls.set(K.list(id), raw);
      if (!this.index.some((l) => l.id === id)) this.index.push(entry);
      this.saveIndex();
      if (wasOpen) this.open(id);
      this.emit('index');
    };
  }

  /** A sheet nobody wrote on (no items, no title, not shared) is not worth keeping when you leave it. */
  dropIfBlank() {
    const r = this.rec;
    if (!r || r.secret || r.doc.title[0] || Object.keys(r.doc.items).length) return;
    if (this.index.length <= 1) return;
    this.index = this.index.filter((l) => l.id !== r.id);
    this.saveIndex();
    this.ls.remove(K.list(r.id));
    this.rec = null;
  }

  // ---------- reading ----------
  get doc() { return this.rec.doc; }
  items() { return liveItems(this.rec.doc); }
  fixes() { return fixes(this.rec.doc); }
  title() { return this.rec.doc.title[0]; }
  inkOf(device) {
    const d = this.rec.doc.dev[device];
    if (d && d.ink[0]) return d.ink[0];
    // this phone, on a list it has not claimed an ink on yet: the ink it chose once (blue at first)
    if (device === this.device) return this.prefs.ink || INKS[0];
    // a device that never chose (an old copy): the first ink nobody else holds, stable per device
    const used = new Set(Object.values(this.rec.doc.dev).map((x) => x.ink[0]).filter(Boolean));
    const free = INKS.filter((i) => !used.has(i));
    let h = 0;
    for (const ch of device) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return (free.length ? free[h % free.length] : INKS[h % INKS.length]) || 'azul';
  }
  nameOf(device) {
    if (device === this.device) return this.t('you');
    const d = this.rec.doc.dev[device];
    return (d && d.name[0]) || '';
  }

  // ---------- writing ----------
  /** Add what was typed; returns the ids added (one per item after splitting). */
  add(text) {
    const parts = splitInput(text);
    const ids = [];
    for (const p of parts) {
      const id = randomId(10);
      addItem(this.doc, this.clock, id, p);
      ids.push(id);
    }
    if (ids.length) this.changed('add', { ids });
    return ids;
  }

  /** Replace one item by several (the "¿Separar en 3?" chip). Undoable. */
  split(id, pieces) {
    const it = this.doc.items[id];
    if (!it) return [];
    const ids = [];
    setDeleted(this.doc, this.clock, id, true);
    for (const p of pieces) { const nid = randomId(10); addItem(this.doc, this.clock, nid, p); ids.push(nid); }
    this.pushUndo(this.t('splitDone')(pieces.length), () => {
      for (const nid of ids) setDeleted(this.doc, this.clock, nid, true);
      setDeleted(this.doc, this.clock, id, false);
      this.changed('undo');
    });
    this.changed('split', { ids, from: id });
    return ids;
  }

  toggle(id) {
    const it = this.doc.items[id];
    if (!it || !isLive(it)) return;
    const done = !isDone(it);
    setDone(this.doc, this.clock, id, done);
    if (done) this.remember(it.t[0]);
    this.changed('toggle', { id, done });
  }

  edit(id, text) {
    const it = this.doc.items[id];
    if (!it) return;
    const clean = String(text).replace(/\s+/g, ' ').trim();
    if (!clean) { this.remove(id); return; }
    if (clean === it.t[0]) return;
    const before = it.t[0];
    setText(this.doc, this.clock, id, clean);
    this.pushUndo(this.t('edited')(clean), () => { setText(this.doc, this.clock, id, before); this.changed('undo'); });
    this.changed('edit', { id });
  }

  remove(id) {
    const it = this.doc.items[id];
    if (!it) return;
    setDeleted(this.doc, this.clock, id, true);
    this.pushUndo(this.t('removed')(it.t[0]), () => { setDeleted(this.doc, this.clock, id, false); this.changed('undo', { ids: [id] }); });
    this.changed('remove', { id });
  }

  clearStruck() {
    const ids = this.items().filter((i) => isDone(i)).map((i) => i.id);
    if (!ids.length) return;
    for (const id of ids) setDeleted(this.doc, this.clock, id, true);
    this.pushUndo(this.t('cleared')(ids.length), () => { for (const id of ids) setDeleted(this.doc, this.clock, id, false); this.changed('undo', { ids }); });
    this.changed('clear', { ids });
  }

  emptyList() {
    const ids = this.items().map((i) => i.id);
    if (!ids.length) return;
    for (const id of ids) setDeleted(this.doc, this.clock, id, true);
    this.pushUndo(this.t('emptied'), () => { for (const id of ids) setDeleted(this.doc, this.clock, id, false); this.changed('undo', { ids }); });
    this.changed('clear', { ids });
  }

  restore(ids) {
    for (const id of ids) if (this.doc.items[id]) setDeleted(this.doc, this.clock, id, false);
    this.changed('undo', { ids });
  }

  setTitle(text) {
    const clean = String(text).replace(/\s+/g, ' ').trim();
    if (clean === this.title()) return;
    setTitle(this.doc, this.clock, clean);
    this.changed('title');
  }

  setFix(text, aisle) {
    const key = keyOf(text);
    if (!key) return;
    setFix(this.doc, this.clock, key, aisle);
    this.changed('fix', { key, aisle });
  }

  setOrder(aisles) {
    setOrder(this.doc, this.clock, aisles);
    this.changed('order');
  }

  setAisleView(on) {
    this.rec.aisles = !!on;
    this.save();
    this.emit('view');
  }

  setInk(ink) {
    setDevice(this.doc, this.clock, 'ink', ink);
    this.savePrefs({ ink }); // the ink this phone prefers on every sheet
    this.changed('ink');
  }

  /** The ink of whoever last wrote the title (the stamp ends with the device id). */
  titleInk() {
    const s = this.rec.doc.title[1];
    return s ? this.inkOf(s.slice(13)) : this.inkOf(this.device);
  }

  setName(name) {
    setDevice(this.doc, this.clock, 'name', name);
    this.changed('name');
  }

  /** Mark everything on the page as seen (removes the highlighter from new items). */
  markSeen() {
    const m = maxStamp(this.doc);
    if (m && m !== this.rec.seen) { this.rec.seen = m; this.save(); this.emit('seen'); }
  }
  isNew(item) { return item.by !== this.device && item.c > (this.rec.seen || '') && !!this.rec.seen; }

  // ---------- the other phone ----------
  /** Merge a copy that arrived from a relay or another tab. Returns the changes for animation. */
  applyRemote(raw) {
    const incoming = sanitize(raw);
    const before = this.doc;
    const after = merge(before, incoming);
    if (canonical(after) === canonical(before)) return null;
    this.clock.observe(maxStamp(after));
    const changes = diff(before, after);
    // phones that appear in this sheet for the first time (not this one)
    // (only on a phone that was already part of it: the one opening a link sees no news)
    changes.joined = before.dev[this.device] ? Object.keys(after.dev).filter((d) => d !== this.device && !before.dev[d] && after.dev[d].ink[0]) : [];
    // remember strikes made on the other phone too (the household's habits)
    for (const id of changes.struck) this.remember(after.items[id].t[0]);
    this.rec.doc = after;
    this.save();
    this.emit('remote', changes);
    this.resolveInk();
    return changes;
  }

  /** The newest record time (seconds) merged from the relays, so the next visit asks only for newer ones. */
  noteSynced(createdAt) {
    if (this.rec && Number.isFinite(createdAt) && createdAt > (this.rec.syncedAt || 0)) { this.rec.syncedAt = createdAt; this.save(); }
  }

  // ---------- sharing ----------
  setSecret(secret, room) {
    this.rec.secret = secret;
    this.rec.syncedAt = 0; // a new link is a new place on the relays
    const entry = this.index.find((l) => l.id === this.rec.id);
    if (entry) { entry.shared = true; entry.room = room; }
    this.rec.wasShared = false;
    this.saveIndex();
    this.save();
    this.emit('shared');
  }

  /**
   * Two phones must never write in the same ink. Keep mine if nobody else has it, or if I
   * claimed it first; otherwise take the first free one. Runs after every merge of a shared list.
   */
  resolveInk() {
    if (!this.rec || !this.rec.secret) return;
    const mine = this.doc.dev[this.device];
    const others = Object.entries(this.doc.dev).filter(([k]) => k !== this.device);
    const used = new Set(others.map(([, d]) => d.ink[0]).filter(Boolean));
    if (mine && mine.ink[0]) {
      const rival = others.find(([, d]) => d.ink[0] === mine.ink[0]);
      if (!rival) return;
      if (mine.ink[1] < rival[1].ink[1] || (mine.ink[1] === rival[1].ink[1] && this.device < rival[0])) return;
    }
    const wanted = this.prefs.ink || INKS[0];
    const free = !used.has(wanted) ? wanted : INKS.find((i) => !used.has(i)) || INKS[0];
    setDevice(this.doc, this.clock, 'ink', free);
    this.changed('ink');
  }

  /** A device id that has not written yet still needs an ink: claim a free one on first share. */
  ensureInk() {
    if (!this.rec) return;
    const mine = this.doc.dev[this.device];
    if (mine && mine.ink[0]) return;
    const used = new Set(Object.entries(this.doc.dev).filter(([k]) => k !== this.device).map(([, d]) => d.ink[0]).filter(Boolean));
    const wanted = this.prefs.ink || INKS[0];
    const free = !used.has(wanted) ? wanted : INKS.find((i) => !used.has(i)) || INKS[0];
    setDevice(this.doc, this.clock, 'ink', free);
    this.save();
  }

  // ---------- history ("lo de siempre") ----------
  remember(text) {
    const key = keyOf(text);
    if (!key) return;
    const h = this.history[key] || { text, n: 0, last: 0, gaps: [] };
    const now = Date.now();
    if (h.last && now - h.last > 6 * 3600e3) h.gaps = [...h.gaps.slice(-5), now - h.last];
    if (!h.last || now - h.last > 6 * 3600e3) h.n++;
    h.last = now;
    h.text = text;
    this.history[key] = h;
    const keys = Object.keys(this.history);
    if (keys.length > 400) { keys.sort((a, b) => this.history[a].last - this.history[b].last); for (const k of keys.slice(0, keys.length - 400)) delete this.history[k]; }
    this.ls.set(K.history, JSON.stringify(this.history));
  }

  /** Things this household buys often and that are not on the page now, most due first. */
  usual(limit = 8) {
    const onPage = new Set(this.items().filter((i) => !isDone(i)).map((i) => keyOf(i.t[0])));
    const now = Date.now();
    return Object.entries(this.history)
      .filter(([k, h]) => h.n >= 2 && !onPage.has(k))
      .map(([k, h]) => {
        const gap = h.gaps.length ? median(h.gaps) : 7 * 864e5;
        return { key: k, text: h.text, n: h.n, due: (now - h.last) / gap };
      })
      .sort((a, b) => b.due - a.due || b.n - a.n)
      .slice(0, limit);
  }

  // ---------- undo ----------
  pushUndo(label, run) {
    this.undoStack.push({ label, run });
    if (this.undoStack.length > 20) this.undoStack.shift();
    this.emit('undoable', { label });
  }
  undo() {
    const u = this.undoStack.pop();
    if (u) u.run();
  }

  // ---------- persistence ----------
  changed(kind, detail) {
    this.save();
    this.emit('change', { kind, ...detail });
  }

  save() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flush(), 120);
  }

  flush() {
    clearTimeout(this.saveTimer);
    if (!this.rec) return;
    this.writeRec(this.rec);
    const entry = this.index.find((l) => l.id === this.rec.id);
    if (entry) {
      const title = this.rec.doc.title[0];
      if (entry.title !== title || Date.now() - entry.updated > 60e3) { entry.title = title; entry.updated = Date.now(); this.saveIndex(); }
    }
  }

  writeRec(rec) {
    const out = { id: rec.id, secret: rec.secret, doc: JSON.parse(canonical(rec.doc)), aisles: rec.aisles, seen: rec.seen, wasShared: rec.wasShared || undefined, oldId: rec.oldId, syncedAt: rec.syncedAt || undefined };
    if (!this.ls.set(K.list(rec.id), JSON.stringify(out))) this.emit('storageFull');
  }

  saveIndex() { this.ls.set(K.lists, JSON.stringify(this.index)); }

  savePrefs(patch) {
    this.prefs = { ...this.prefs, ...patch };
    this.ls.set(K.prefs, JSON.stringify(this.prefs));
    this.emit('prefs', this.prefs);
  }

  /** Another tab wrote this list: merge it in. */
  fromOtherTab(key, value) {
    if (!this.rec || key !== K.list(this.rec.id) || !value) return;
    try { const raw = JSON.parse(value); if (raw && raw.doc) this.applyRemote(raw.doc); } catch { /* ignore */ }
  }

  // late-bound i18n (store.js stays free of DOM imports for tests)
  t(k) { return this.i18n ? this.i18n[k] : (x) => String(x ?? k); }
}

const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export const store = new Store();
export { K as STORAGE_KEYS };
