// "papel" by day, "pizarron" (a school chalkboard) by night, or as the person chose in Settings.
import { store } from '../app/store.js';
import { grain } from './ink.js';

const dark = matchMedia('(prefers-color-scheme: dark)');

export function currentTheme() {
  const p = store.prefs.theme;
  if (p === 'papel' || p === 'pizarron') return p;
  return dark.matches ? 'pizarron' : 'papel';
}

export function applyTheme() {
  const th = currentTheme();
  const root = document.documentElement;
  root.dataset.theme = th;
  root.style.setProperty('--grain', grain(th));
  root.classList.toggle('no-motion', !store.prefs.motion);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = th === 'pizarron' ? '#263630' : '#fdfbf5';
}

dark.addEventListener('change', applyTheme);
