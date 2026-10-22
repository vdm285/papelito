// A minimal Nostr client for one job: keep a list's encrypted records on a few public relays and
// hear about new ones live. Protocol: NIP-01 (events, REQ/EVENT/EOSE/OK/CLOSED/NOTICE), NIP-33/78
// (kind 30078, one replaceable record per "d" tag), NIP-40 (expiration), NIP-42 (AUTH).
// Why Nostr and which relays: docs/research/2026-10-21-sync.md and -transport.md.
//
// The relays are a mailbox, not the store: every phone keeps the whole list, every record is a
// whole merged copy, and a relay that drops, delays, duplicates or replays records changes nothing
// (the merge is a CRDT). So this file can be simple and forgiving: connect to all, publish to all,
// accept from any, and never block the page.

import { schnorr } from '@noble/secp256k1';
import { toHex, fromHex } from './crypto.js';

const enc = new TextEncoder();
const sha256 = async (bytes) => new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));

export async function signEvent(sk, ev) {
  const pubkey = toHex(schnorr.getPublicKey(sk));
  const base = { pubkey, created_at: ev.created_at, kind: ev.kind, tags: ev.tags, content: ev.content };
  const id = toHex(await sha256(enc.encode(JSON.stringify([0, pubkey, base.created_at, base.kind, base.tags, base.content]))));
  const sig = toHex(await schnorr.signAsync(fromHex(id), sk));
  return { id, ...base, sig };
}

export const publicKeyOf = (sk) => toHex(schnorr.getPublicKey(sk));

/**
 * One WebSocket per relay, reconnecting with backoff. Subscriptions are re-sent on reconnect.
 * Events: onEvent(ev, relayUrl), onEose(subId, relayUrl), onStatus().
 */
export class RelayPool {
  constructor(urls, { sk, onEvent, onEose, onOk, onStatus }) {
    this.sk = sk;
    this.onEvent = onEvent;
    this.onEose = onEose || (() => {});
    this.onOk = onOk || (() => {});
    this.onStatus = onStatus || (() => {});
    this.subs = new Map(); // id → filters
    this.relays = urls.map((url) => ({ url, ws: null, state: 'idle', tries: 0, timer: 0, lastOk: 0, error: '', banned: false, pending: [], noKinds: new Set() }));
    this.sentKinds = new Map(); // event id → kind, to tell which kind a relay refused
    this.closed = false;
  }

  start() { for (const r of this.relays) this.connect(r); }

  stop() {
    this.closed = true;
    for (const r of this.relays) { clearTimeout(r.timer); try { r.ws && r.ws.close(); } catch { /* ignore */ } r.state = 'idle'; }
    this.onStatus();
  }

  /** Reconnect now (after the phone wakes up or comes back online). */
  wake() {
    for (const r of this.relays) {
      if (r.banned) continue;
      if (!r.ws || r.ws.readyState > 1) { clearTimeout(r.timer); r.tries = 0; this.connect(r); }
    }
  }

  connect(r) {
    if (this.closed || r.banned) return;
    let ws;
    try { ws = new WebSocket(r.url); } catch (e) { this.retry(r, String(e)); return; }
    r.ws = ws;
    r.state = 'connecting';
    this.onStatus();
    const giveUp = setTimeout(() => { if (ws.readyState === 0) { try { ws.close(); } catch { /* ignore */ } } }, 9000);
    ws.onopen = () => {
      clearTimeout(giveUp);
      r.state = 'open';
      r.tries = 0;
      r.error = '';
      for (const [id, filters] of this.subs) this.send(r, ['REQ', id, ...filters]);
      for (const msg of r.pending.splice(0)) this.send(r, msg);
      this.onStatus();
    };
    ws.onmessage = (m) => this.receive(r, m.data);
    ws.onerror = () => { r.error = 'error'; };
    ws.onclose = () => { clearTimeout(giveUp); if (r.ws === ws) { r.ws = null; r.state = 'closed'; this.onStatus(); this.retry(r); } };
  }

  retry(r, why) {
    if (this.closed || r.banned) return;
    if (why) r.error = why;
    r.state = 'waiting';
    const delay = Math.min(60_000, 1000 * 2 ** Math.min(r.tries++, 6)) * (0.75 + Math.random() * 0.5);
    clearTimeout(r.timer);
    r.timer = setTimeout(() => this.connect(r), delay);
  }

  send(r, msg) {
    if (r.ws && r.ws.readyState === 1) { try { r.ws.send(JSON.stringify(msg)); return true; } catch { /* fall through */ } }
    return false;
  }

  subscribe(id, filters) {
    this.subs.set(id, filters);
    for (const r of this.relays) this.send(r, ['REQ', id, ...filters]);
  }

  /** Publish to every relay; queued for relays that are reconnecting. */
  publish(ev) {
    this.sentKinds.set(ev.id, ev.kind);
    if (this.sentKinds.size > 500) this.sentKinds.delete(this.sentKinds.keys().next().value);
    for (const r of this.relays) {
      if (r.banned || r.noKinds.has(ev.kind)) continue;
      if (!this.send(r, ['EVENT', ev])) { r.pending = r.pending.filter((m) => !(m[0] === 'EVENT' && sameSlot(m[1], ev))); r.pending.push(['EVENT', ev]); }
    }
  }

  publishTo(url, ev) {
    const r = this.relays.find((x) => x.url === url);
    if (r && !r.banned && !this.send(r, ['EVENT', ev])) r.pending.push(['EVENT', ev]);
  }

  async receive(r, data) {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }
    if (!Array.isArray(msg)) return;
    const [type] = msg;
    if (type === 'EVENT' && msg[2] && typeof msg[2] === 'object') this.onEvent(msg[2], r.url, msg[1]);
    else if (type === 'EOSE') this.onEose(msg[1], r.url);
    else if (type === 'OK') {
      const [, id, ok, reason = ''] = msg;
      if (ok) r.lastOk = Date.now();
      else this.rejected(r, reason, this.sentKinds.get(id));
      this.onOk(id, !!ok, reason, r.url);
      this.onStatus();
    } else if (type === 'CLOSED') {
      const reason = String(msg[2] || '');
      if (/^auth-required/.test(reason)) return; // AUTH follows
      const k = reason.match(/\bkind\s*(\d+)/i);
      this.rejected(r, reason, k ? Number(k[1]) : undefined);
    } else if (type === 'AUTH' && typeof msg[1] === 'string') {
      // NIP-42: every phone that holds the link is the list's owner, so it can log in as the list
      const ev = await signEvent(this.sk, { kind: 22242, created_at: Math.floor(Date.now() / 1000), tags: [['relay', r.url], ['challenge', msg[1]]], content: '' });
      this.send(r, ['AUTH', ev]);
      for (const [id, filters] of this.subs) this.send(r, ['REQ', id, ...filters]);
    }
  }

  rejected(r, reason, kind) {
    r.error = reason;
    // a relay that refuses one kind (relay.coinos.io: "blocked: kind 21078 not allowed") still
    // carries the others: stop sending only that kind there
    if (kind !== undefined && /\bkind\b/i.test(reason)) { r.noKinds.add(kind); this.onStatus(); return; }
    // policies we cannot satisfy (paid, web of trust, whitelists): stop using that relay
    if (/^(blocked|restricted)/.test(reason) || /paid|payment|web of trust|not allowed|whitelist|nip-05/i.test(reason)) {
      r.banned = true;
      try { r.ws && r.ws.close(); } catch { /* ignore */ }
      this.onStatus();
    }
  }

  /** Counts for the status line: how many relays are open, and whether any confirmed recently. */
  health() {
    const live = this.relays.filter((r) => !r.banned);
    const open = live.filter((r) => r.state === 'open').length;
    return { open, total: live.length, confirmed: live.filter((r) => Date.now() - r.lastOk < 120_000).length };
  }
}

const sameSlot = (a, b) => a.kind === b.kind && a.pubkey === b.pubkey && dTag(a) === dTag(b);
export const dTag = (ev) => (ev.tags.find((t) => t[0] === 'd') || [])[1] || '';
