// Keyboard and screen-reader paths: focus after strikes, deletes and cards; swipe vs click;
// the pressed state of choices. Run against a dev server or preview: node tools/keyboard.mjs [--base=URL]
import puppeteer from 'puppeteer-core';
import { existsSync } from 'node:fs';
const CHROME = ['C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium-browser'].find((p) => existsSync(p));
const BASE = (process.argv.find((a) => a.startsWith('--base=')) || '--base=http://localhost:5177/').slice(7);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
const out = [];
const check = (n, ok, d) => { out.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d !== undefined ? `  (${JSON.stringify(d)})` : ''}`); };
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.evaluate(() => { const { store } = window.__papelito; store.newList(); store.add('leche, pan, huevo, cilantro'); });
  await sleep(300);
  await page.focus('.row[data-id]');
  const first = await page.evaluate(() => document.activeElement.dataset.id);
  await page.keyboard.press('Space');
  await sleep(1900); // linger, then settle under Tachados
  const now = await page.evaluate(() => ({ id: document.activeElement.dataset && document.activeElement.dataset.id, done: document.activeElement.classList.contains('done') }));
  check('a struck row keeps the keyboard focus after it settles', now.id === first && now.done, now);
  await page.focus('.pending .row[data-id]');
  const before = await page.evaluate(() => [...document.querySelectorAll('.pending .row[data-id]')].map((r) => r.dataset.id));
  await page.keyboard.press('Delete');
  await sleep(400);
  const after = await page.evaluate(() => document.activeElement.dataset && document.activeElement.dataset.id);
  check('after Delete the focus moves to the next row', after === before[1], { after, expected: before[1] });
  await page.keyboard.press('F2');
  await sleep(300);
  const inCard = await page.evaluate(() => ({ dialog: document.activeElement.classList.contains('card'), label: document.querySelector('.card').getAttribute('aria-labelledby'), title: document.getElementById('card-title') && document.getElementById('card-title').textContent, inert: document.querySelector('.desk').inert }));
  check('F2 opens the item card and focuses the dialog, named by its title; the paper is inert', inCard.dialog && inCard.title && inCard.inert, inCard);
  await page.keyboard.press('Escape');
  await sleep(300);
  const back = await page.evaluate(() => document.activeElement.dataset && document.activeElement.dataset.id);
  check('Escape gives the focus back to the row', back === after, { back });
  // a horizontal mouse drag strikes once, and the click that follows does not undo it
  const box = await page.$eval('.pending .row[data-id] .txt', (e) => { const r = e.getBoundingClientRect(); return { x: r.left + 4, y: r.top + r.height / 2, w: r.width }; });
  const id = await page.$eval('.pending .row[data-id]', (e) => e.dataset.id);
  await page.mouse.move(box.x, box.y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(box.x + (box.w + 40) * i / 12, box.y);
  await page.mouse.up();
  await sleep(200);
  const struck = await page.evaluate((id) => window.__papelito.store.doc.items[id].d[0] !== '', id);
  check('a swipe strikes the item (the click after it is ignored)', struck);
  // a click with no pointer sequence (what a screen reader sends) strikes
  await sleep(500); // the swipe's own click window
  const id2 = await page.$eval('.pending .row[data-id]:not(.done)', (e) => e.dataset.id);
  await page.$eval('.pending .row[data-id]:not(.done)', (e) => e.click());
  await sleep(100);
  check('a bare click (screen reader activation) strikes', await page.evaluate((id) => window.__papelito.store.doc.items[id].d[0] !== '', id2));
  // Tab from a half-written word to the suggestions does not make the fragment an item
  await page.focus('.composer textarea');
  await page.keyboard.type('lec');
  await page.waitForSelector('.usual .pencil', { timeout: 5000 }).catch(() => {}); // the dictionary arrives after the first frame
  await page.keyboard.press('Tab');
  await sleep(200);
  const onSuggestion = await page.evaluate(() => !!document.activeElement.closest('.usual'));
  const fragment = await page.evaluate(() => window.__papelito.store.items().some((i) => i.t[0] === 'lec'));
  check('Tab moves from a half-written word to the suggestions without writing it', onSuggestion && !fragment, { onSuggestion, fragment });
  const pick = await page.evaluate(() => document.activeElement.textContent);
  await page.keyboard.press('Enter');
  await sleep(300);
  check('Enter on a suggestion writes it', await page.evaluate((w) => window.__papelito.store.items().some((i) => i.t[0] === w), pick), pick);
  const pressed = await page.evaluate(async () => { document.querySelector('papel-app').openCard('settings'); await new Promise((r) => setTimeout(r, 200)); return [...document.querySelectorAll('.card .chip')].map((c) => `${c.textContent}:${c.getAttribute('aria-pressed')}:${c.getAttribute('lang') || ''}`); });
  check('settings choices say which is pressed; language names carry their language', pressed.includes('Español:true:es') && pressed.includes('English:false:en'), pressed.slice(0, 3));
} finally { await browser.close(); }
console.log(out.every(Boolean) ? `all ${out.length} passed` : `${out.filter((x) => !x).length} failed`);
