// Installing as an app, keeping the screen on, and the iPhone's separate world.
// Platform facts: docs/research/2026-10-21-pwa.md.
import { t } from './i18n.js';

let deferred = null;
let lock = null;
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; });

const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const ios = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const install = {
  standalone,
  ios,
  canInstall: () => !standalone() && (!!deferred || ios()),
  async prompt(app) {
    if (deferred) { deferred.prompt(); deferred = null; app.closeCard(); return; }
    // iPhone: no install prompt exists; Safari remembers the page's URL when the manifest is read,
    // so make sure the page was loaded with the list's own #k= before the person adds it
    app.showToast(t.installIos, false);
    app.toastTimer && clearTimeout(app.toastTimer);
    app.toastTimer = setTimeout(() => { app.toast = null; }, 14000);
    app.closeCard();
  },
  async keepAwake(on) {
    try {
      if (on && 'wakeLock' in navigator && document.visibilityState === 'visible') lock = await navigator.wakeLock.request('screen');
      else if (!on && lock) { await lock.release(); lock = null; }
    } catch { lock = null; }
  },
};
