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

/**
 * Default relays (docs/research/2026-10-21-transport.md §6): five that took a fresh key, served the
 * newest copy back and kept data for years in the 2026-10-21 probes, from different operators; one
 * (relay.ditto.pub) runs different software, so one strfry policy change cannot take out all of
 * them; plus one fallback. Every phone writes to and reads from all of them.
 */
export const RELAYS = [
  'wss://relay.primal.net',
  'wss://relay.nostr.net',
  'wss://nostr.mom',
  'wss://relay.coinos.io',
  'wss://relay.ditto.pub',
  'wss://nostr.oxtr.dev',
];
const MIN_GAP_MS = 1200; // be gentle: a burst of taps goes out as one record

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
  }

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
    const now = Math.floor(Date.now() / 1000);
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
    clearTimeout(this.timer);
    clearTimeout(this.repairTimer);
    clearInterval(this.presenceTimer);
    if (this.pool) this.pool.stop();
    this.pool = null;
  }

  wake() { if (this.pool) { this.pool.wake(); this.schedule(400); this.here(); } }

  /** Something changed locally: publish our slot soon (taps close together go out as one). */
  changed() { this.confirmed = false; this.schedule(120); this.reportStatus(); } // a tap is one event: send it now

  schedule(ms) {
    clearTimeout(this.timer);
    const wait = Math.max(ms, (this.lastSent || 0) + MIN_GAP_MS - Date.now());
    this.timer = setTimeout(() => this.publish(), wait);
  }

  async publish(force = false) {
    if (!this.pool || this.moved || this.store.rec.id !== this.listId) return;
    const doc = this.store.doc;
    const hash = canonical(doc);
    if (!force && hash === this.lastHash && this.lastEvent) return;
    const now = Math.floor(Date.now() / 1000);
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
    if (!ev || ev.pubkey !== this.keys.pk || typeof ev.content !== 'string') return;
    if (ev.kind === KIND) {
      const slot = dTag(ev);
      if (/^[0-9a-f]{32}$/.test(slot)) this.slots.add(slot);
      if (Number.isFinite(ev.created_at) && ev.created_at > this.maxSeen) this.maxSeen = ev.created_at;
      if (slot === this.mySlot) {
        this.slotsAt.set(url, Math.max(this.slotsAt.get(url) || 0, ev.created_at));
        if (ev.created_at > this.lastCreated) this.lastCreated = ev.created_at; // our copy from another tab or an old install
      }
      if (this.seenIds.has(ev.id)) return;
      this.seenIds.add(ev.id);
      if (this.seenIds.size > 3000) this.seenIds = new Set([...this.seenIds].slice(-1000));
      const value = await open(this.keys.encKey, ev.content, this.aad(slot));
      if (value && value.v === 2 && value.moved) {
        // the sheet got a new link: stop publishing here (it would only put the list back on the old link)
        if (!this.moved) { this.moved = true; clearTimeout(this.timer); clearTimeout(this.repairTimer); this.onMoved(); }
        return;
      }
      if (!value || value.v !== 2 || !value.doc) return; // not ours, tampered, or a newer format
      const changes = this.store.applyRemote(value.doc);
      this.store.noteSynced(ev.created_at);
      // keep a second full copy on the relays: republish ours after absorbing someone else's
      if (changes && slot !== this.mySlot) this.schedule(2500);
      this.status = 'synced';
      this.reportStatus();
    } else if (ev.kind === LIVE) {
      if (this.seenIds.has(ev.id)) return;
      this.seenIds.add(ev.id);
      const msg = await open(this.keys.encKey, ev.content, this.aad('live'));
      if (!msg || typeof msg.dev !== 'string' || msg.dev === this.store.device) return;
      const p = this.peers.get(msg.dev) || {};
      const at = Date.now();
      this.peers.set(msg.dev, { ...p, ink: typeof msg.ink === 'string' ? msg.ink : p.ink, at, typing: typeof msg.typing === 'string' ? msg.typing.slice(0, 160) : p.typing, typingAt: typeof msg.typing === 'string' ? at : p.typingAt, gone: !!msg.gone });
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
    const now = Math.floor(Date.now() / 1000);
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
    const ev = await signEvent(this.keys.sk, { kind: LIVE, created_at: Math.floor(Date.now() / 1000), tags: [], content });
    this.seenIds.add(ev.id);
    this.pool.publish(ev);
  }

  /** Phones seen in the last minute (not this one), for the presence dots. */
  others() {
    const now = Date.now();
    return [...this.peers.entries()].filter(([, p]) => !p.gone && now - p.at < 65_000).map(([dev, p]) => ({ dev, ...p, typing: p.typingAt && now - p.typingAt < 8000 ? p.typing : '' }));
  }

  reportStatus() {
    if (!this.pool) return;
    const h = this.pool.health();
    let status;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) status = 'offline';
    else if (h.open === 0) status = h.total === 0 ? 'trouble' : 'connecting';
    else if (this.lastEvent && !this.confirmed && this.lastHash !== canonical(this.store.doc)) status = 'sending';
    else status = this.status === 'synced' || this.confirmed ? 'synced' : 'connecting';
    this.onStatus({ status, ...h, others: this.others() });
  }
}
