import { defineConfig } from 'vite';
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Stamp the service worker with a build id and the list of files to keep offline (public/sw.js).
const swVersion = () => ({
  name: 'sw-version',
  apply: 'build',
  closeBundle() {
    const f = resolve('dist/sw.js');
    if (!existsSync(f)) return;
    const id = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
    // Spanish and English (á é í ó ú ñ ü ¿ ¡) live in the basic latin subset; others load on demand
    const assets = existsSync(resolve('dist/assets'))
      ? readdirSync(resolve('dist/assets')).filter((n) => !/\.woff2$/.test(n) || /-latin-wght/.test(n)).map((n) => `./assets/${n}`)
      : [];
    const shell = ['./', './dict/es-MX.json', './fonts/caveat.woff2', './fonts/atkinson.woff2', './manifest.webmanifest', './manifest-ios.webmanifest', './favicon.svg', './icon-192.png', './icon-512.png', ...assets];
    const src = readFileSync(f, 'utf8').replace('__BUILD__', id).replace('/*__SHELL__*/[]', JSON.stringify(shell));
    writeFileSync(f, src);
    // the licence texts travel with the fonts and data we ship (OFL, Unicode): dist/licenses/
    mkdirSync(resolve('dist/licenses'), { recursive: true });
    for (const n of readdirSync(resolve('LICENSES'))) copyFileSync(resolve('LICENSES', n), resolve('dist/licenses', n));
    copyFileSync(resolve('LICENSE'), resolve('dist/licenses/LICENSE-code.txt'));
  },
});

// VITE_BASE is set by the Pages workflow (/listolista/ while the repository keeps that name).
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  build: { target: 'es2022', chunkSizeWarningLimit: 300 },
  // the top-level data/ holds caches and test-browser profiles whose locked files crash Vite's
  // watcher. Only that folder: a pattern like '**/data/**' also hid src/data/ from the dev server.
  server: { port: 5177, host: true, strictPort: true, watch: { ignored: [`${resolve('data').replace(/\\/g, '/')}/**`, '**/dist/**', '**/.git/**'] } },
  plugins: [swVersion()],
});
