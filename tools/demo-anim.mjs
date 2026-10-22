// An animated capture of two real phones on one sheet, through the real relays: phone B writes
// (phone A sees the pen moving, then the word), A strikes (B sees the line draw itself), B strikes.
// Output: data/cache/shots/two-phones.webp (animated WebP, real frame timing).
// Run with the dev server up: node tools/demo-anim.mjs [--base=http://localhost:5177/]
import puppeteer from 'puppeteer-core';
import sharp from 'sharp';
import { existsSync, mkdirSync } from 'node:fs';
import { seedList } from './lib/seed.mjs';

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=').slice(1).join('=') || d;
const BASE = arg('base', 'http://localhost:5177/');
const OUT = 'data/cache/shots';
mkdirSync(OUT, { recursive: true });
const CHROME = ['C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome'].find((p) => existsSync(p));
const W = 390;
const H = 640;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--force-color-profile=srgb'] });

async function phone(storage) {
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  await p.setViewport({ width: W, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  if (storage) await p.evaluateOnNewDocument((s) => { if (!sessionStorage.getItem('seeded')) { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); sessionStorage.setItem('seeded', '1'); } }, storage);
  return { ctx, p };
}
const tapRow = (p, text) => p.evaluate((t) => {
  const r = [...document.querySelectorAll('.pending .row')].find((x) => x.querySelector('.txt').textContent === t);
  const o = { bubbles: true, clientX: 200, clientY: 10, pointerId: 1, button: 0, pointerType: 'touch' };
  r.dispatchEvent(new PointerEvent('pointerdown', o)); r.dispatchEvent(new PointerEvent('pointerup', o));
}, text);

const a = await phone(seedList({ fresh: false, short: true, title: 'Súper del sábado' }));
await a.p.goto(BASE, { waitUntil: 'networkidle2' });
await a.p.waitForSelector('.row[data-id]');
await a.p.click('.head .pill');
await a.p.waitForFunction(() => location.hash.startsWith('#k='));
const link = await a.p.evaluate(() => location.href);
await a.p.keyboard.press('Escape');
const b = await phone(null);
await b.p.goto(link, { waitUntil: 'networkidle2' });
await b.p.waitForFunction(() => document.querySelectorAll('.row[data-id]').length >= 7, { timeout: 30000 });
await sleep(15500); // inks resolved, the first-open notice faded, presence up
await Promise.all([a.p, b.p].map((p) => p.evaluate(() => { document.activeElement && document.activeElement.blur(); window.scrollTo(0, 0); })));

// Chrome's screencast pushes a frame whenever the page paints: smooth, with real timing
const t0 = Date.now();
async function cast(p) {
  const got = [];
  const cdp = await p.createCDPSession();
  cdp.on('Page.screencastFrame', async (f) => {
    got.push({ t: Date.now() - t0, data: Buffer.from(f.data, 'base64') });
    try { await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }); } catch { /* closing */ }
  });
  await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 });
  return { got, stop: () => cdp.send('Page.stopScreencast') };
}
const [ca, cb] = await Promise.all([cast(a.p), cast(b.p)]);

await sleep(700);
await b.p.focus('.composer textarea');
await b.p.keyboard.type('limones', { delay: 160 });
await sleep(400);
await b.p.keyboard.press('Enter');
await b.p.evaluate(() => document.activeElement && document.activeElement.blur());
await sleep(2600);
await tapRow(a.p, 'jitomate');
await sleep(2600);
await tapRow(b.p, 'cebolla');
await sleep(2800);
await ca.stop();
await cb.stop();
const end = Date.now() - t0;
// resample both phones to 15 frames a second (the latest frame of each at every tick)
const latest = (arr, t) => { let f = arr[0]; for (const x of arr) { if (x.t <= t) f = x; else break; } return f; };
const frames = [];
for (let t = 0; t <= end; t += 1000 / 15) {
  const fa = latest(ca.got, t);
  const fb = latest(cb.got, t);
  if (!fa || !fb) continue;
  const crop = (buf) => sharp(buf).resize(W).extract({ left: 0, top: 0, width: W, height: H }).png().toBuffer();
  frames.push({ t, ia: await crop(fa.data), ib: await crop(fb.data) });
}

// compose: two phones on the desk, with labels drawn as text under each
const pad = 24;
const label = (txt) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="30"><text x="${W / 2}" y="20" font-family="Segoe UI, sans-serif" font-size="15" fill="#6f6658" text-anchor="middle">${txt}</text></svg>`);
const [la, lb] = [label('Teléfono A (tinta azul)'), label('Teléfono B (tinta roja)')];
const composed = [];
for (const f of frames) {
  composed.push(await sharp({ create: { width: W * 2 + pad * 3, height: H + pad + 40, channels: 3, background: '#e7e1d5' } })
    .composite([{ input: f.ia, left: pad, top: pad }, { input: f.ib, left: W + pad * 2, top: pad }, { input: la, left: pad, top: H + pad + 6 }, { input: lb, left: W + pad * 2, top: H + pad + 6 }])
    .png().toBuffer());
}
const delays = frames.map((f, i) => (i === frames.length - 1 ? 1500 : Math.round(1000 / 15)));
await sharp(composed, { join: { animated: true } }).webp({ quality: 72, effort: 5, loop: 0, delay: delays }).toFile(`${OUT}/two-phones.webp`);
console.log(`${OUT}/two-phones.webp: ${frames.length} frames over ${((frames.at(-1).t) / 1000).toFixed(1)} s`);
await browser.close();
