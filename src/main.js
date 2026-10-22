// Boot. The list on this phone is drawn from storage before anything else (the first frame is the
// list); the dictionary and, for shared lists, the sync code arrive afterwards.
import './style.css';
import { store } from './app/store.js';
import { t, setLang } from './app/i18n.js';
import { applyTheme } from './ui/theme.js';
import { sync } from './app/sync-control.js';
import { loadDict } from './data/dict.js';
import { install } from './app/install.js';

store.i18n = new Proxy({}, { get: (_, k) => t[k] });

// language: ?lang= in a link (read once), then the saved choice, then Spanish
const url = new URL(location.href);
const qLang = url.searchParams.get('lang');
if (qLang === 'en' || qLang === 'es') store.savePrefs({ lang: qLang });
setLang(store.prefs.lang || 'es');
applyTheme();

const booted = store.boot(location.href);
if (booted.legacyMissing) store.notices.push({ kind: 'legacyMissing' });

await import('./ui/app.js');
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
  const m = location.hash.match(/^#k=([A-Za-z0-9_-]{43})$/);
  if (m && (!store.rec || store.rec.secret !== m[1])) await sync.openLink(location.href);
});

// waking up, coming back online, leaving
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') { sync.wake(); if (store.prefs.awake) install.keepAwake(true); }
  else { store.flush(); sync.leaving(); }
});
addEventListener('online', () => sync.wake());
addEventListener('pagehide', () => store.flush());

if (install.standalone()) { try { navigator.storage?.persist?.(); } catch { /* ignore */ } }
if (store.prefs.awake) install.keepAwake(true);

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
}

// for tools/smoke.mjs and debugging
window.__papelito = { store, sync };
