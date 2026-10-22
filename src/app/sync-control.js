// Ties the open list to its relay session, and owns the URL. A list that is not shared never
// loads the sync code (pay for what you use). The secret lives only in the #fragment.

import { html } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { store } from './store.js';
import { t } from './i18n.js';

const listeners = new Set();
let session = null;
let sessionList = '';
let qrCache = { key: '', svg: '' };

export const sync = {
  state: { status: 'local', open: 0, total: 0, others: [] },

  on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  emit() { for (const fn of listeners) fn(); },

  others() { return session ? session.others() : []; },

  /** Start, stop or switch the session to match the list on screen. */
  async follow() {
    const rec = store.rec;
    if (!rec || !rec.secret) {
      if (session) { session.stop(); session = null; sessionList = ''; }
      this.state = { status: 'local', open: 0, total: 0, others: [] };
      this.setUrl('');
      this.emit();
      return;
    }
    this.setUrl(`#k=${rec.secret}`);
    // a phone that joins by link takes a free ink once it has seen the others' (resolveInk runs
    // after every merge too); if nothing arrives, it claims one anyway
    setTimeout(() => { if (store.rec && store.rec.id === rec.id) { store.ensureInk(); store.resolveInk(); } }, 3000);
    if (session && sessionList === rec.id && session.keys) return;
    if (session) session.stop();
    sessionList = rec.id;
    this.state = { ...this.state, status: 'connecting' };
    this.emit();
    const { Session } = await import('../sync/session.js');
    if (store.rec.id !== rec.id) return; // switched while loading
    session = new Session(store, {
      onStatus: (s) => { this.state = s; this.emit(); },
      onLive: () => this.emit(),
    });
    await session.start(rec);
    this.emit();
  },

  changed() { if (session) session.changed(); },
  wake() { if (session) session.wake(); },
  typing(text) { if (session) session.typing(text).catch(() => {}); },
  leaving() { if (session) session.here(true).catch(() => {}); },

  /** Turn this list into a shared one (first time) and open the share card. */
  async share(app) {
    const rec = store.rec;
    if (!rec.secret) {
      const { newSecret } = await import('../sync/crypto.js');
      const { listKeys } = await import('../sync/session.js');
      const secret = newSecret();
      const { room } = await listKeys(secret);
      store.ensureInk();
      store.setSecret(secret, room);
      persistStorage();
      await this.follow();
    }
    app.openCard('share');
  },

  /** A new secret for the same sheet: the old link stops receiving changes. */
  async rotate() {
    const { newSecret } = await import('../sync/crypto.js');
    const { listKeys } = await import('../sync/session.js');
    const secret = newSecret();
    const { room } = await listKeys(secret);
    if (session) { session.stop(); session = null; sessionList = ''; }
    store.setSecret(secret, room);
    await this.follow();
  },

  link(rec = store.rec) {
    const u = new URL(location.href);
    u.search = '';
    u.hash = rec.secret ? `k=${rec.secret}` : '';
    return u.toString();
  },

  async sendLink(app) {
    const url = this.link();
    const title = store.title() || t.untitled;
    if (navigator.share) {
      try { await navigator.share({ title, text: t.shareText(title), url }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    await this.copyLink(app);
  },

  async copyLink(app) {
    const url = this.link();
    try { await navigator.clipboard.writeText(url); app.showToast(t.shareCopied, false); } catch { window.prompt(t.shareCopy, url); }
  },

  /** The share link as a QR code (generated here, offline; uqr, MIT). */
  qr(rec = store.rec) {
    const url = this.link(rec);
    if (qrCache.key !== url) {
      qrCache = { key: url, svg: '' };
      import('uqr').then(({ renderSVG }) => {
        qrCache = { key: url, svg: renderSVG(url, { ecc: 'M', border: 1, whiteColor: '#fffef6', blackColor: '#26282d' }) };
        this.emit();
      });
    }
    return qrCache.svg ? html`${unsafeSVG(qrCache.svg)}` : html`<span style="color:#999;font-size:13px">…</span>`;
  },

  async openList(id) {
    store.open(id);
    await this.follow();
  },

  async newList() {
    store.newList();
    await this.follow();
  },

  /** A pasted link (the iPhone home-screen app never receives links by itself). */
  async openLink(text) {
    const m = String(text).match(/#k=([A-Za-z0-9_-]{43})/);
    if (!m) return false;
    const { listKeys } = await import('../sync/session.js');
    const { room } = await listKeys(m[1]);
    store.openShared(m[1], room);
    await this.follow();
    return true;
  },

  setUrl(hash) {
    const u = new URL(location.href);
    const keepLang = u.searchParams.get('lang');
    u.search = keepLang ? `?lang=${keepLang}` : '';
    u.hash = hash;
    if (u.toString() !== location.href) history.replaceState(history.state, '', u);
  },
};

function persistStorage() {
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch { /* ignore */ }
}

store.on((kind) => {
  if (kind === 'change') sync.changed();
});
