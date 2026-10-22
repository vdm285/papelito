import { defineConfig } from 'vite';
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Stamp the service worker with a build id and the list of files to keep offline (public/sw.js).
const swVersion = () => {
  let out = resolve('dist');
  return {
  name: 'sw-version',
  apply: 'build',
  configResolved(config) { out = resolve(config.root, config.build.outDir); },
  closeBundle() {
    const f = resolve(out, 'sw.js');
    if (!existsSync(f)) return;
    const id = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
    // Spanish and English (á é í ó ú ñ ü ¿ ¡) live in the basic latin subset; others load on demand
    const assets = existsSync(resolve(out, 'assets'))
      ? readdirSync(resolve(out, 'assets')).filter((n) => !/\.woff2$/.test(n) || /-latin-wght/.test(n)).map((n) => `./assets/${n}`)
      : [];
    const shell = ['./', './pre.js', './dict/es-MX.json', './fonts/caveat.woff2', './fonts/atkinson.woff2', './fonts/doodles.woff2', './manifest.webmanifest', './manifest-ios.webmanifest', './favicon.svg', './icon-192.png', './icon-512.png', ...assets];
    const src = readFileSync(f, 'utf8').replace('__BUILD__', id).replace('/*__SHELL__*/[]', JSON.stringify(shell));
    writeFileSync(f, src);
    // the licence texts travel with the fonts and data we ship (OFL, Unicode): dist/licenses/
    mkdirSync(resolve(out, 'licenses'), { recursive: true });
    for (const n of readdirSync(resolve('LICENSES'))) copyFileSync(resolve('LICENSES', n), resolve(out, 'licenses', n));
    copyFileSync(resolve('LICENSE'), resolve(out, 'licenses/LICENSE-code.txt'));
  },
  };
};

// Production builds carry a Content-Security-Policy: scripts only from this site (no inline
// script at all), connections only to this site and to WebSocket relays, no plugins, no forms.
// Styles allow inline because Lit sets per-row custom properties in style attributes.
// The dev server gets none (Vite injects inline styles and its own client).
const CSP = [
  "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:",
  "font-src 'self'", "connect-src 'self' wss:", "manifest-src 'self'", "worker-src 'self'", "object-src 'none'",
  "base-uri 'self'", "form-action 'none'",
].join('; ');
const csp = () => ({
  name: 'csp',
  apply: 'build',
  transformIndexHtml: (html) => html.replace('<meta charset="utf-8" />', `<meta charset="utf-8" />
    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
});

// VITE_BASE is set by the Pages workflow (/listolista/ while the repository keeps that name).
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  build: { target: 'es2022', chunkSizeWarningLimit: 300 },
  // the top-level data/ holds caches and test-browser profiles whose locked files crash Vite's
  // watcher. Only that folder: a pattern like '**/data/**' also hid src/data/ from the dev server.
  server: { port: 5177, host: true, strictPort: true, watch: { ignored: [`${resolve('data').replace(/\\/g, '/')}/**`, '**/dist/**', '**/.git/**'] } },
  plugins: [swVersion(), csp()],
});
