// The link between one shared list and the relays (design: docs/research/2026-10-21-sync.md §6).
// Every phone publishes its whole merged copy of the list to its own replaceable slot (kind 30078,
// d = HMAC of its device id), signed with a key derived from the link secret, so only link holders
// can write. Every phone listens to all the list's slots and merges whatever arrives.
// Ephemeral events (kind 21078, never stored by relays) carry "this phone has the sheet open" and
// what someone is writing right now, so the other sheet can show the pen moving.

import { deriveKeys, seal, open, slotTag } from './crypto.js';
import { RelayPool, signEvent, publicKeyOf, dTag } from './nostr.js';
import { canonical } from '../model/doc.js';

export const KIND = 30078;
export const LIVE = 21078;
const EXPIRE_DAYS = 180;

import { RELAYS } from './relays.js';

export { RELAYS };
const MIN_GAP_MS = 600; // be gentle: a burst of taps goes out as one record (at most two copies a second)
const DEV_RE = /^[0-9a-z]{8}$/;
const INK_RE = /^[a-z]{3,12}$/; // goes into a CSS variable name: letters only

let offsetP = null;
/**
 * Seconds to add to this phone's clock to get the web server's (the Date header of a HEAD request
 * to our own page). Relays refuse records dated more than a few minutes ahead, and a presence
 * query "since 30 seconds ago" asks for the future on a phone whose clock runs fast. Only an
 * offset beyond 90 s is used: the header has one-second resolution, plus the round trip.
 */
export function serverOffset() {
  if (offsetP) return offsetP;
  offsetP = (async () => {
    if (typeof location === 'undefined' || !/^https?:$/.test(location.protocol) || typeof fetch !== 'function') return 0;
    try {
      const t0 = Date.now();
      const res = await fetch(location.href.split('#')[0], { method: 'HEAD', cache: 'no-store' });
      const server = Date.parse(res.headers.get('date') || '');
      if (!Number.isFinite(server)) return 0;
      const off = Math.round((server + 500 - (t0 + Date.now()) / 2) / 1000);
      return Math.abs(off) > 90 ? off : 0;
    } catch { return 0; }
  })();
  return offsetP;
}

export async function listKeys(secret) {
  const k = await deriveKeys(secret);
  let sk = k.sign;
  let pk;
  try { pk = publicKeyOf(sk); } catch { sk = k.signAlt; pk = publicKeyOf(sk); } // out of range: about 2^-128
  return { ...k, sk, pk };
}

export class Session {
  /**
   * @param store the app store (applyRemote, rec, device, doc)
   * @param opts  { relays, onStatus(status), onLive(msg) }
   */
  constructor(store, opts = {}) {
    this.store = store;
    this.relays = opts.relays || RELAYS;
    this.onStatus = opts.onStatus || (() => {});
    this.onLive = opts.onLive || (() => {});
    this.onMoved = opts.onMoved || (() => {});
    this.pool = null;
    this.keys = null;
    this.mySlot = '';
    this.seenIds = new Set();
    this.lastCreated = 0;
    this.lastEvent = null;
    this.lastHash = '';
    this.confirmed = false;
    this.timer = 0;
    this.repairTimer = 0;
    this.slotsAt = new Map(); // relay → created_at of our slot it holds
    this.slots = new Set(); // every slot tag seen for this list (ours and the other phones')
    this.maxSeen = 0; // newest created_at seen on any slot (markers must sort after all of them)
    this.moved = false;
    this.peers = new Map(); // device → { ink, name, at, typing }
    this.listId = '';
    this.status = 'connecting';
    this.offset = 0; // seconds, see serverOffset
    this.junk = new Set(); // ids of events that did not decrypt (never trusted, never retried)
  }

  /** Relay time in seconds: this phone's clock, corrected if it is far off. */
  now() { return Math.floor(Date.now() / 1000) + this.offset; }

  async start(rec) {
    this.listId = rec.id;
    this.keys = await listKeys(rec.secret);
    this.mySlot = await slotTag(this.keys.slotKey, this.store.device);
    this.slots.add(this.mySlot);
    this.pool = new RelayPool(this.relays, {
      sk: this.keys.sk,
      onEvent: (ev, url) => this.receive(ev, url),
      onEose: (sub, url) => this.eose(sub, url),
      onOk: (id, ok, reason, url) => { if (ok && this.lastEvent && id === this.lastEvent.id) { this.confirmed = true; this.slotsAt.set(url, this.lastEvent.created_at); } },
      onStatus: () => this.reportStatus(),
    });
    // a short wait for the clock check (same origin, usually ~100 ms); never more than 0.8 s
    this.offset = await Promise.race([serverOffset(), new Promise((r) => setTimeout(() => r(0), 800))]);
    serverOffset().then((o) => { this.offset = o; if (this.store.setSkew) this.store.setSkew(o * 1000); });
    const now = this.now();
    // every record is a whole merged copy, so only the newest per slot matters. Some relays keep
    // every version (relay.ditto.pub): after the first visit, ask only for what is new since the
    // last sync (with a margin for clocks); the first time, the newest 60 records are plenty.
    const since = rec.syncedAt ? { since: rec.syncedAt - 3600 } : {};
    // two subscriptions: a relay that refuses the ephemeral kind (relay.coinos.io) closes only that one
    this.pool.subscribe('ll', [{ kinds: [KIND], authors: [this.keys.pk], limit: 60, ...since }]);
    this.pool.subscribe('lv', [{ kinds: [LIVE], authors: [this.keys.pk], since: now - 30 }]);
    this.pool.start();
    // publish our copy soon even if no relay answers the first query (a brand-new shared list)
    this.schedule(1500);
    this.presenceTimer = setInterval(() => this.here(), 25_000);
    setTimeout(() => this.here(), 1200);
    return this;
  }

  stop() {
    clearTimeout(this.timer); this.timer = 0; this.dueAt = 0;
    clearTimeout(this.repairTimer);
    clearInterval(this.presenceTimer);
    if (this.pool) this.pool.stop();
    this.pool = null;
  }

  wake() { if (this.pool) { this.pool.wake(); this.schedule(400); this.here(); } }

  /** Something changed locally: publish our slot soon (taps close together go out as one). */
  changed() { this.confirmed = false; this.schedule(120); this.reportStatus(); } // a tap is one event: send it now

  schedule(ms) {
    const wait = Math.max(ms, (this.lastSent || 0) + MIN_GAP_MS - Date.now());
    const due = Date.now() + wait;
    // never push a publish that is already due sooner further out: the republish after absorbing
    // the other phone's copy (2.5 s) used to postpone this phone's own pending edit
    if (this.timer && this.dueAt && this.dueAt <= due) return;
    clearTimeout(this.timer);
    this.dueAt = due;
    this.timer = setTimeout(() => { this.timer = 0; this.dueAt = 0; this.publish(); }, wait);
  }

  async publish(force = false) {
    if (!this.pool || this.moved || this.store.rec.id !== this.listId) return;
    const doc = this.store.doc;
    const hash = canonical(doc);
    if (!force && hash === this.lastHash && this.lastEvent) return;
    const now = this.now();
    const created = Math.max(now, this.lastCreated + 1); // relays keep the newest created_at per slot
    this.lastCreated = created;
    const content = await seal(this.keys.encKey, { v: 2, doc: JSON.parse(hash) }, this.aad(this.mySlot));
    const ev = await signEvent(this.keys.sk, {
      kind: KIND,
      created_at: created,
      tags: [['d', this.mySlot], ['expiration', String(now + EXPIRE_DAYS * 86400)]],
      content,
    });
    this.lastEvent = ev;
    this.lastHash = hash;
    this.lastSent = Date.now();
    this.seenIds.add(ev.id);
    this.pool.publish(ev);
    this.reportStatus();
  }

  aad(slot) { return `ll2|${this.keys.pk}|${slot}`; }

  async receive(ev, url) {
    if (!ev || ev.pubkey !== this.keys.pk || typeof ev.content !== 'string' || typeof ev.id !== 'string') return;
    if (this.junk.has(ev.id)) return;
    if (ev.kind === KIND) {
      const slot = dTag(ev);
      // an event we published or already opened is genuine (the id covers created_at); anything
      // else is trusted only once it decrypts with the link's key. A relay can neither forge a
      // signature check we skip nor a sealed record, so a bogus created_at from the year 3000
      // never reaches lastCreated (it would make every later record of ours unpublishable)
      const known = this.seenIds.has(ev.id);
      const value = known ? null : await open(this.keys.encKey, ev.content, this.aad(slot));
      if (!known && (!value || value.v !== 2)) { this.junk.add(ev.id); if (this.junk.size > 2000) this.junk.clear(); return; }
      const at = Number.isFinite(ev.created_at) && ev.created_at <= this.now() + 86400 ? ev.created_at : 0;
      if (/^[0-9a-f]{32}$/.test(slot)) this.slots.add(slot);
      if (at > this.maxSeen) this.maxSeen = at;
      if (slot === this.mySlot && at) {
        this.slotsAt.set(url, Math.max(this.slotsAt.get(url) || 0, at));
        if (at > this.lastCreated) this.lastCreated = at; // our copy from another tab or an old install
      }
      if (known) return;
      this.seenIds.add(ev.id);
      if (this.seenIds.size > 3000) this.seenIds = new Set([...this.seenIds].slice(-1000));
      if (value.moved) {
        // the sheet got a new link: stop publishing here (it would only put the list back on the old link)
        if (!this.moved) { this.moved = true; clearTimeout(this.timer); this.timer = 0; this.dueAt = 0; clearTimeout(this.repairTimer); this.onMoved(); this.reportStatus(); }
        return;
      }
      if (!value.doc) return; // a newer format
      const changes = this.store.applyRemote(value.doc);
      if (at) this.store.noteSynced(at);
      // keep a second full copy on the relays: republish ours after absorbing someone else's
      if (changes && slot !== this.mySlot) this.schedule(2500);
      this.status = 'synced';
      this.reportStatus();
    } else if (ev.kind === LIVE) {
      if (this.seenIds.has(ev.id) || this.moved) return;
      this.seenIds.add(ev.id);
      const msg = await open(this.keys.encKey, ev.content, this.aad('live'));
      if (!msg || typeof msg.dev !== 'string' || !DEV_RE.test(msg.dev) || msg.dev === this.store.device) return;
      const p = this.peers.get(msg.dev) || {};
      const at = Date.now();
      this.peers.set(msg.dev, { ...p, ink: typeof msg.ink === 'string' && INK_RE.test(msg.ink) ? msg.ink : p.ink, at, typing: typeof msg.typing === 'string' ? msg.typing.slice(0, 160) : p.typing, typingAt: typeof msg.typing === 'string' ? at : p.typingAt, gone: !!msg.gone });
      this.onLive(msg);
      this.reportStatus();
    }
  }

  eose(sub, url) {
    // repair: a relay that lost or never stored our latest slot gets it again
    clearTimeout(this.repairTimer);
    this.repairTimer = setTimeout(() => {
      if (!this.lastEvent) { this.publish(); return; }
      for (const r of this.pool.relays) {
        if (r.state === 'open' && (this.slotsAt.get(r.url) || 0) < this.lastEvent.created_at) this.pool.publishTo(r.url, this.lastEvent);
      }
    }, 800);
    if (this.status !== 'synced') { this.status = 'synced'; this.reportStatus(); }
  }

  /**
   * The sheet moved to a new link: replace every slot we know under the OLD key with a sealed
   * "moved" marker (we still hold the old signing key), so the old link stops carrying the list
   * on relays that keep only the newest record per slot. Phones still on the old link see a notice.
   */
  async scrubForMove() {
    if (!this.pool || !this.keys) return 0;
    const now = this.now();
    // first, a NIP-09 deletion of every old version of every slot (relay.ditto.pub keeps them
    // all), dated before the markers so the markers themselves survive
    const upTo = Math.max(now, this.lastCreated + 1, this.maxSeen + 1);
    const del = await signEvent(this.keys.sk, { kind: 5, created_at: upTo, tags: [...this.slots].map((s) => ['a', `${KIND}:${this.keys.pk}:${s}`]), content: '' });
    this.pool.publish(del);
    this.lastCreated = upTo;
    let n = 0;
    for (const slot of this.slots) {
      const created = Math.max(now, this.lastCreated + 1);
      this.lastCreated = created;
      const content = await seal(this.keys.encKey, { v: 2, moved: true }, this.aad(slot));
      const ev = await signEvent(this.keys.sk, { kind: KIND, created_at: created, tags: [['d', slot], ['expiration', String(now + 30 * 86400)]], content });
      this.seenIds.add(ev.id);
      this.pool.publish(ev);
      n++;
    }
    await new Promise((r) => setTimeout(r, 1500)); // let the relays take them before closing
    return n;
  }

  /** Ephemeral: "this phone has the sheet open" (and in which ink). */
  async here(gone = false) {
    if (!this.pool || (!gone && typeof document !== 'undefined' && document.visibilityState === 'hidden')) return;
    await this.live({ dev: this.store.device, ink: this.store.inkOf(this.store.device), gone });
  }

  /** Ephemeral: what is being written right now on this phone (throttled by the caller). */
  async typing(text) {
    await this.live({ dev: this.store.device, ink: this.store.inkOf(this.store.device), typing: String(text).slice(0, 160) });
  }

  async live(msg) {
    if (!this.pool || !this.keys) return;
    const content = await seal(this.keys.encKey, msg, this.aad('live'));
    const ev = await signEvent(this.keys.sk, { kind: LIVE, created_at: this.now(), tags: [], content });
    this.seenIds.add(ev.id);
    this.pool.publish(ev);
  }

  /** Phones seen in the last minute (not this one), for the presence dots. */
  others() {
    if (this.moved) return []; // nobody is on this link any more
    const now = Date.now();
    return [...this.peers.entries()].filter(([, p]) => !p.gone && now - p.at < 65_000).map(([dev, p]) => ({ dev, ...p, typing: p.typingAt && now - p.typingAt < 8000 ? p.typing : '' }));
  }

  reportStatus() {
    if (!this.pool) return;
    const h = this.pool.health();
    let status;
    if (this.moved) status = 'moved';
    else if (typeof navigator !== 'undefined' && navigator.onLine === false) status = 'offline';
    else if (h.open === 0) status = h.total === 0 ? 'trouble' : 'connecting';
    else if (h.clock && !h.confirmed) status = 'clock'; // refused for its date: the phone's clock is far off
    else if (this.lastEvent && !this.confirmed && this.lastHash !== canonical(this.store.doc)) status = 'sending';
    else status = this.status === 'synced' || this.confirmed ? 'synced' : 'connecting';
    this.onStatus({ status, ...h, others: this.others() });
  }
}
