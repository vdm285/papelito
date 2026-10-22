// Boot. The list on this phone is drawn from storage before anything else (the first frame is the
// list); the dictionary and, for shared lists, the sync code arrive afterwards.
import './style.css';
import { store } from './app/store.js';
import { t, setLang } from './app/i18n.js';
import { applyTheme } from './ui/theme.js';
import { sync } from './app/sync-control.js';
import { loadDict } from './data/dict.js';
import { install } from './app/install.js';
import './ui/app.js'; // static: the sheet must not wait for another round trip

store.i18n = new Proxy({}, { get: (_, k) => t[k] });

// language: ?lang= in a link (read once), then the saved choice, then Spanish
const url = new URL(location.href);
const qLang = url.searchParams.get('lang');
if (qLang === 'en' || qLang === 'es') store.savePrefs({ lang: qLang });
setLang(store.prefs.lang || 'es');
applyTheme();

const booted = store.boot(location.href);
if (booted.legacyMissing) store.notices.push({ kind: 'legacyMissing' });

const app = document.createElement('papel-app');
document.body.prepend(app);
document.getElementById('boot')?.remove();

if (booted.secret) {
  const { listKeys } = await import('./sync/session.js');
  const { room } = await listKeys(booted.secret);
  store.openShared(booted.secret, room);
}
sync.follow();

// after the first frame: the dictionary (aisles, doodles, suggestions)
requestIdleCallback(() => loadDict().then(() => app.requestUpdate()), { timeout: 1500 });

// another tab of this site changed this list, or opened a link to a list
addEventListener('storage', (e) => store.fromOtherTab(e.key, e.newValue));
addEventListener('hashchange', async () => {
  // going back to close a card lands on an older history entry: put the open sheet's link back
  if (Date.now() < sync.holdUrlUntil) { sync.holdUrlUntil = 0; sync.setUrl(store.rec && store.rec.secret ? `#k=${store.rec.secret}` : ''); return; }
  const m = location.hash.match(/^#k=([A-Za-z0-9_-]{43})$/);
  if (m && (!store.rec || store.rec.secret !== m[1])) await sync.openLink(location.href);
});

// The keyboard: Android shrinks the page (interactive-widget=resizes-content); iPhone covers its
// bottom instead. --kb is the covered height, so the sticky writing line and the toast stay above
// the keyboard. (Measured from the visual viewport; to be checked on a real iPhone.)
if (window.visualViewport) {
  const vv = window.visualViewport;
  const kb = () => {
    const covered = Math.max(0, Math.round(innerHeight - (vv.offsetTop + vv.height)));
    document.documentElement.style.setProperty('--kb', `${covered > 80 ? covered : 0}px`);
  };
  vv.addEventListener('resize', kb);
  vv.addEventListener('scroll', kb);
}

// waking up, coming back online, leaving
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') { sync.wake(); if (store.prefs.awake) install.keepAwake(true); }
  else { store.flush(); sync.leaving(); }
});
addEventListener('online', () => sync.wake());
addEventListener('pagehide', () => store.flush());

if (install.standalone()) { try { navigator.storage?.persist?.(); } catch { /* ignore */ } }
if (store.prefs.awake) install.keepAwake(true);

// offline: production builds only (the dev server's files change on every save); localhost counts
// as secure, so a local preview of a build behaves like the real site
if ('serviceWorker' in navigator && import.meta.env.PROD && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
}

// for tools/smoke.mjs and debugging
window.__papelito = { store, sync };
