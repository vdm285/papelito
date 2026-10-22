// Lists written by the older versions of this app on the same origin (vdm285.github.io) become
// new documents, once. The old keys are never changed or deleted: they are the way back, and the
// origin is shared with other projects, so a generic key such as `inputs` may not even be ours.
// Shapes and history: docs/research/2026-10-21-old-apps.md (from the audit of every deployed
// version). In short, in the order we read them:
//   listolista_data_<id>       {items:[{id,text,done,deleted,timestamp,...}], meta:{title,timestamp}}  (Jan–Oct 2026)
//   listolista_v2_current_<id> {items:[{id,text,done,timestamp}], meta:{title,timestamp}}            (12 Jan 2026, 17 min)
//   listolista_v1              [{id,txt,done,ts,dt}] or {title, items:[...]}                           (Dec 2025)
//   inputs                     ["texto", ...] or [{value, done}]                                       (2024)
// Old titles were stored in capitals by a bug (the original case is gone); we show them in
// sentence case. Old shared lists come back as local lists: their room names were public on a
// broker, so they cannot be the secret of a private list (the person shares again).

import { emptyDoc, see } from './doc.js';
import { format } from './hlc.js';

const MAX_ITEMS = 600;

/**
 * @param {Record<string,string>} store  a snapshot of localStorage (key → raw string)
 * @param {string} device                this phone's device id (8 chars)
 * @returns {{ lists: Array<{ oldId, title, doc, wasShared, lastVisited, source }> }}
 */
export function importLegacy(store, device) {
  const lists = [];
  const seen = new Set(); // signature of item ids, to drop the duplicate the old "share" left behind
  const parse = (k) => { try { return JSON.parse(store[k]); } catch { return undefined; } };
  const index = { ...obj(parse('listolista_index_local')), ...obj(parse('listolista_index_shared')), ...obj(parse('listolista_library')) };
  const sharedIds = new Set(Object.keys(obj(parse('listolista_index_shared'))));

  const keys = Object.keys(store).sort();
  for (const k of keys) {
    let m = k.match(/^listolista_data_(.+)$/) || k.match(/^listolista_v2_current_(.+)$/);
    if (!m) continue;
    const id = m[1];
    const v = parse(k);
    if (!v || !Array.isArray(v.items)) continue;
    const items = v.items.filter((it) => it && !it.deleted).map((it) => ({ id: it.id, text: it.text, done: !!it.done, t: num(it.timestamp) }));
    add(id, v.meta && v.meta.title, items, { wasShared: sharedIds.has(id) || /^room_/.test(id), lastVisited: num(index[id] && index[id].lastVisited) || num(v.meta && v.meta.timestamp), source: k });
  }

  const v1 = parse('listolista_v1');
  if (v1) {
    const arr = Array.isArray(v1) ? v1 : Array.isArray(v1.items) ? v1.items : null;
    if (arr) add('v1', Array.isArray(v1) ? '' : v1.title, arr.map((it) => it && { id: it.id, text: it.txt ?? it.text, done: !!it.done, t: num(it.ts) }).filter(Boolean), { wasShared: false, lastVisited: 0, source: 'listolista_v1' });
  }

  const inputs = parse('inputs');
  if (Array.isArray(inputs) && inputs.length && inputs.every((x) => typeof x === 'string' || (x && typeof x === 'object' && typeof x.value === 'string'))) {
    const items = inputs.map((x, i) => (typeof x === 'string' ? { id: i, text: x, done: false, t: 0 } : { id: i, text: x.value, done: !!x.done, t: 0 }));
    add('inputs', 'Lista de 2024', items, { wasShared: false, lastVisited: 0, source: 'inputs' });
  }

  return { lists };

  function add(oldId, title, items, extra) {
    const clean = items.filter((it) => typeof it.text === 'string' && it.text.trim()).slice(0, MAX_ITEMS);
    if (!clean.length) return;
    const sig = clean.map((it) => String(it.id)).sort().join(',');
    if (seen.has(sig)) return; // the same list under its local and its shared key
    seen.add(sig);
    const doc = emptyDoc();
    const base = extra.lastVisited || Date.now();
    clean.forEach((it, i) => {
      const created = createdMs(it, base, i);
      const s = format(created, 0, device);
      const iid = itemId(oldId, it.id, i);
      doc.items[iid] = { c: s, by: device, t: [it.text.replace(/\s+/g, ' ').trim().slice(0, 160), s], d: [it.done ? device : '', s], x: [0, s] };
      see(doc, device, s);
    });
    const t = sentenceCase(String(title ?? '').trim()).slice(0, 60);
    doc.title = [t === 'Nueva lista' || t === 'Mi lista' || t === 'Lista' ? '' : t, t ? format(base, 0, device) : ''];
    lists.push({ oldId, title: doc.title[0], doc, ...extra });
  }
}

/** Old item ids were creation milliseconds (from Date.now()); fall back to the order on the page. */
function createdMs(it, base, i) {
  const id = Number(it.id);
  const cands = [id, it.t].filter((x) => Number.isFinite(x) && x > 1.4e12 && x < 4e12);
  return cands.length ? Math.min(...cands) : base - 1000 + i;
}

/** The same old item gets the same new id on every phone (so copies can later meet). */
function itemId(oldId, id, i) {
  const n = Number(id);
  if (Number.isFinite(n) && n > 1e9) return `o${Math.floor(n).toString(36)}`.slice(0, 12); // a Date.now() id
  return `o${String(i).padStart(7, '0')}`; // 2024 lines had no ids: their position
}

export function sentenceCase(s) {
  if (!s || s !== s.toUpperCase() || s === s.toLowerCase()) return s; // only fix all-capitals titles
  const low = s.toLocaleLowerCase('es-MX');
  return low.charAt(0).toLocaleUpperCase('es-MX') + low.slice(1);
}

const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Old links: ?local=, ?room= and the Dec 2025 bare hash. Returns the old id or null. */
export function legacyLinkId(href) {
  try {
    const u = new URL(href);
    const q = u.searchParams.get('local') || u.searchParams.get('room');
    if (q) return q;
    const h = u.hash.slice(1);
    if (/^[0-9a-z]{12,14}$/.test(h)) return h;
  } catch { /* not a URL */ }
  return null;
}
