// Installing as an app, keeping the screen on, and the iPhone's separate world.
// Platform facts: docs/research/2026-10-21-pwa.md.
import { t } from './i18n.js';

let deferred = null;
let lock = null;
const loadedAt = location.href; // what Safari will remember as the icon's address
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; });

const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const ios = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const install = {
  standalone,
  ios,
  canInstall: () => !standalone() && (!!deferred || ios()),
  async prompt(app) {
    if (deferred) { deferred.prompt(); deferred = null; app.closeCard(); return; }
    // iPhone: no install prompt exists, and Safari remembers the address the page was LOADED with
    // when it reads the manifest (docs/research/2026-10-21-pwa.md §3.1). If the list became shared
    // during this visit, reload first so the icon opens this list, then show the steps.
    if (location.href !== loadedAt) {
      try { sessionStorage.setItem('ll.installHint', '1'); } catch { /* ignore */ }
      location.reload();
      return;
    }
    this.showHint(app);
  },
  showHint(app) {
    app.showToast(t.installIos, false);
    clearTimeout(app.toastTimer);
    app.toastTimer = setTimeout(() => { app.toast = null; }, 14000);
    app.closeCard();
  },
  /** After the reload above: show the steps once. */
  pendingHint() {
    try { if (sessionStorage.getItem('ll.installHint')) { sessionStorage.removeItem('ll.installHint'); return true; } } catch { /* ignore */ }
    return false;
  },
  async keepAwake(on) {
    try {
      if (on && 'wakeLock' in navigator && document.visibilityState === 'visible') lock = await navigator.wakeLock.request('screen');
      else if (!on && lock) { await lock.release(); lock = null; }
    } catch { lock = null; }
  },
};
