// First-load timing on a modest phone: 4x CPU throttle and a slow 4G-like network, against a
// production preview (npx vite preview --port 5178). Prints paint timings and bytes by type,
// cold (empty cache) and warm (service worker), for an empty sheet and a seeded list.
// Run: node tools/perf.mjs [--base=http://localhost:5178/]
import puppeteer from 'puppeteer-core';
import { existsSync } from 'node:fs';
import { seedList } from './lib/seed.mjs';

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=').slice(1).join('=') || d;
const BASE = arg('base', 'http://localhost:5178/');
const CHROME = ['C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome'].find((p) => existsSync(p));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });

async function run(label, storage, warm) {
  const n = Number(arg('runs', '3'));
  const res = [];
  for (let i = 0; i < n; i++) res.push(await once(storage, warm));
  const med = (k) => { const v = res.map((r) => r[k]).filter((x) => x !== undefined).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : '-'; };
  console.log(`${label.padEnd(26)} median of ${n}: FCP ${String(med('fcp')).padStart(5)} ms · sheet ready ${String(med('ready')).padStart(5)} ms · fonts ${String(med('fonts')).padStart(5)} ms · ${med('kb')} KB over the network`);
}

async function once(storage, warm) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  if (storage) await page.evaluateOnNewDocument((s) => { if (!localStorage.getItem('ll.device')) for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); }, storage);
  const cdp = await page.createCDPSession();
  await cdp.send('Network.enable');
  if (warm) { await page.goto(BASE, { waitUntil: 'networkidle0' }); await page.evaluate(() => Promise.race([navigator.serviceWorker ? navigator.serviceWorker.ready : null, new Promise((r) => setTimeout(r, 6000))])); await new Promise((r) => setTimeout(r, 800)); }
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  const bytes = {};
  cdp.on('Network.loadingFinished', (e) => { bytes.total = (bytes.total || 0) + e.encodedDataLength; });
  const t0 = Date.now();
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForSelector('papel-app .composer textarea', { timeout: 30000 });
  const listAt = Date.now() - t0;
  await page.evaluate(() => document.fonts.ready);
  const fontsAt = Date.now() - t0;
  const paint = await page.evaluate(() => Object.fromEntries(performance.getEntriesByType('paint').map((p) => [p.name, Math.round(p.startTime)])));
  await ctx.close();
  return { fcp: paint['first-contentful-paint'], ready: listAt, fonts: fontsAt, kb: Math.round((bytes.total || 0) / 1024) };
}

await run('cold, empty sheet', null, false);
await run('cold, a 12-item list', seedList({ fresh: false }), false);
await run('warm (service worker)', seedList({ fresh: false }), true);
await browser.close();
