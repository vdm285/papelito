// Scripted screenshots at exact viewports (puppeteer-core driving the installed Chrome; nothing is
// downloaded). Each scene starts in a fresh incognito context with seeded storage.
// Run (dev server up): node tools/shots.mjs [--base=http://localhost:5177/] [--only=name,name] [--sync]
// Output: data/cache/shots/<scene>.png
import puppeteer from 'puppeteer-core';
import sharp from 'sharp';
import { existsSync, mkdirSync } from 'node:fs';
import { seedList } from './lib/seed.mjs';

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=').slice(1).join('=') || d;
const BASE = arg('base', 'http://localhost:5177/');
const ONLY = arg('only', '') ? arg('only').split(',') : null;
const OUT = 'data/cache/shots';
mkdirSync(OUT, { recursive: true });
const CHROME = ['C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium-browser'].find((p) => existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PHONE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const DESK = { width: 1600, height: 900, deviceScaleFactor: 1 };

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--force-color-profile=srgb', '--font-render-hinting=none'] });
const errors = [];

async function page(viewport, storage = {}, { dark = false } = {}) {
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  await p.setViewport(viewport);
  await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }]);
  p.on('pageerror', (e) => errors.push(String(e)));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await p.evaluateOnNewDocument((s) => { if (!sessionStorage.getItem('seeded')) { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); sessionStorage.setItem('seeded', '1'); } }, storage);
  return { ctx, p };
}

async function open(p, hash = '') {
  await p.goto(`${BASE}${hash}`, { waitUntil: 'networkidle2', timeout: 60000 });
  await p.waitForSelector('papel-app .sheet');
  await p.evaluate(() => document.fonts.ready);
  await sleep(700);
}

async function shot(p, name) {
  await p.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`${OUT}/${name}.png`);
}

const scenes = {
  async 'phone-first'() {
    const { ctx, p } = await page(PHONE);
    await open(p);
    await shot(p, 'phone-first');
    await ctx.close();
  },
  async 'phone-list'() {
    const { ctx, p } = await page(PHONE, seedList());
    await open(p);
    await shot(p, 'phone-list');
    // a tap strikes; capture after the ink and before it settles, then after
    const row = await p.$('.pending .row:nth-child(3)');
    await row.tap();
    await sleep(380);
    await shot(p, 'phone-strike');
    await sleep(1600);
    await shot(p, 'phone-settled');
    await ctx.close();
  },
  async 'phone-aisles'() {
    const { ctx, p } = await page(PHONE, seedList({ aisles: true, fresh: false }));
    await open(p);
    await sleep(800);
    await shot(p, 'phone-aisles');
    await ctx.close();
  },
  async 'phone-menu'() {
    const { ctx, p } = await page(PHONE, seedList({ fresh: false }));
    await open(p);
    await p.click('.head .icon-btn');
    await sleep(500);
    await shot(p, 'phone-menu');
    await ctx.close();
  },
  async 'phone-item'() {
    const { ctx, p } = await page(PHONE, seedList({ fresh: false }));
    await open(p);
    await p.click('.pending .row:nth-child(4)', { button: 'right' });
    await sleep(500);
    await shot(p, 'phone-item');
    await ctx.close();
  },
  async 'phone-composer'() {
    const { ctx, p } = await page(PHONE, seedList({ fresh: false }));
    await open(p);
    await p.focus('.composer textarea');
    await sleep(300);
    await shot(p, 'phone-usual');
    await p.keyboard.type('huevos leche tortillas');
    await p.keyboard.press('Enter');
    await sleep(500);
    await shot(p, 'phone-split');
    await ctx.close();
  },
  async 'phone-pizarron'() {
    const { ctx, p } = await page(PHONE, seedList(), { dark: true });
    await open(p);
    await shot(p, 'phone-pizarron');
    await ctx.close();
  },
  async 'phone-molde'() {
    const { ctx, p } = await page(PHONE, seedList({ hand: 'molde' }));
    await open(p);
    await shot(p, 'phone-molde');
    await ctx.close();
  },
  async 'desk-list'() {
    const { ctx, p } = await page(DESK, seedList());
    await open(p);
    await shot(p, 'desk-list');
    await ctx.close();
  },
  async 'desk-pizarron'() {
    const { ctx, p } = await page(DESK, seedList(), { dark: true });
    await open(p);
    await shot(p, 'desk-pizarron');
    await ctx.close();
  },
  /** Two phones, one sheet, through the real relays. */
  async 'two-phones'() {
    if (!process.argv.includes('--sync') && !ONLY) return; // needs the real relays: opt in
    const a = await page(PHONE, seedList({ fresh: false }));
    await open(a.p);
    await a.p.click('.head .pill');
    await a.p.waitForFunction(() => location.hash.startsWith('#k='), { timeout: 20000 });
    const link = await a.p.evaluate(() => location.href);
    await a.p.keyboard.press('Escape');
    const b = await page(PHONE, {});
    await b.p.goto(link, { waitUntil: 'networkidle2' });
    await b.p.waitForFunction(() => document.querySelectorAll('.row[data-id]').length >= 10, { timeout: 30000 });
    await sleep(1500);
    // B strikes, A adds; each sees the other
    await b.p.evaluate(() => { const row = [...document.querySelectorAll('.pending .row')].find((r) => r.textContent.includes('aguacates')); row.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 200, clientY: 10, pointerId: 1, button: 0, pointerType: 'touch' })); row.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 200, clientY: 10, pointerId: 1, button: 0, pointerType: 'touch' })); row.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 200, clientY: 10 })); });
    await a.p.focus('.composer textarea');
    await a.p.keyboard.type('limones');
    await a.p.keyboard.press('Enter');
    await a.p.waitForFunction(() => [...document.querySelectorAll('.row.done')].some((r) => r.textContent.includes('aguacates')), { timeout: 20000 });
    await b.p.waitForFunction(() => [...document.querySelectorAll('.row')].some((r) => r.textContent.includes('limones')), { timeout: 20000 });
    await sleep(600);
    await a.p.screenshot({ path: `${OUT}/two-a.png` });
    await b.p.screenshot({ path: `${OUT}/two-b.png` });
    const [ia, ib] = [await sharp(`${OUT}/two-a.png`).toBuffer(), await sharp(`${OUT}/two-b.png`).toBuffer()];
    const W = PHONE.width * 2;
    const H = PHONE.height * 2;
    await sharp({ create: { width: W * 2 + 120, height: H + 80, channels: 3, background: '#e7e1d5' } })
      .composite([{ input: ia, left: 40, top: 40 }, { input: ib, left: W + 80, top: 40 }])
      .png().toFile(`${OUT}/two-phones.png`);
    console.log(`${OUT}/two-phones.png`);
    await a.ctx.close();
    await b.ctx.close();
  },
};

for (const [name, fn] of Object.entries(scenes)) {
  if (ONLY && !ONLY.includes(name)) continue; // --only takes scene names (the keys below)
  try { await fn(); } catch (e) { console.log(`FAIL ${name}: ${e.message}`); errors.push(`${name}: ${e.message}`); }
}
await browser.close();
if (errors.length) { console.log('page errors:'); for (const e of [...new Set(errors)].slice(0, 10)) console.log(`  ${e}`); }
