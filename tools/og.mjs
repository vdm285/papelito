// The link preview image (WhatsApp, Telegram, iMessage): a real capture of the app at 1200×630 with
// the demo list, so the preview shows the thing itself. Output: public/og.png (committed).
// Run with the dev server up: node tools/og.mjs [--base=http://localhost:5177/]
import puppeteer from 'puppeteer-core';
import sharp from 'sharp';
import { existsSync } from 'node:fs';
import { seedList } from './lib/seed.mjs';

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=').slice(1).join('=') || d;
const BASE = arg('base', 'http://localhost:5177/');
const CHROME = ['C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome'].find((p) => existsSync(p));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--force-color-profile=srgb'] });
const ctx = await browser.createBrowserContext();
const page = await ctx.newPage();
await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
const seed = seedList();
await page.evaluateOnNewDocument((s) => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); }, seed);
await page.goto(BASE, { waitUntil: 'networkidle2' });
await page.waitForSelector('.row[data-id]');
await page.evaluate(() => document.fonts.ready);
// strike two items the way a person would, then let the ink settle
await page.evaluate(() => { for (const t of ['jitomate', 'leche Lala']) { const r = [...document.querySelectorAll('.pending .row')].find((x) => x.textContent.includes(t)); r.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 300, clientY: 10, pointerId: 1, button: 0 })); r.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 300, clientY: 10, pointerId: 1, button: 0 })); r.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 300, clientY: 10 })); } });
await new Promise((r) => setTimeout(r, 550)); // the strokes are drawn; the rows have not settled yet (1.4 s)
await page.evaluate(() => { document.activeElement && document.activeElement.blur(); });
const png = await page.screenshot();
await sharp(png).png({ compressionLevel: 9, palette: true, quality: 90 }).toFile('public/og.png');
console.log('public/og.png');
await browser.close();
