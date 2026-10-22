// Smoke test of the flows that matter, against a running dev server (or a preview build).
// Each check prints PASS or FAIL with the measured value; exit 1 on any failure.
// Run: node tools/smoke.mjs [--base=http://localhost:5177/] [--sync]   (--sync also uses the real relays)
import puppeteer from 'puppeteer-core';
import { existsSync } from 'node:fs';
import { seedList } from './lib/seed.mjs';

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=').slice(1).join('=') || d;
const BASE = arg('base', 'http://localhost:5177/');
const SYNC = process.argv.includes('--sync');
const CHROME = ['C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium-browser'].find((p) => existsSync(p));
const PHONE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const DESK = { width: 1440, height: 900 };
const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined ? `  (${typeof detail === 'string' ? detail : JSON.stringify(detail)})` : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
async function fresh(viewport = PHONE, storage = {}, { dark = false } = {}) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport(viewport);
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }]);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  if (Object.keys(storage).length) await page.evaluateOnNewDocument((s) => { if (!sessionStorage.getItem('seeded')) { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); sessionStorage.setItem('seeded', '1'); } }, storage);
  return { ctx, page, errors };
}
async function open(page, path = '') {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForSelector('papel-app .sheet', { timeout: 20000 });
  await page.evaluate(() => document.fonts.ready);
  await sleep(400);
}
const rows = (page, sel = '.row[data-id]') => page.$$eval(sel, (els) => els.map((e) => e.querySelector('.txt').textContent));
const store = (page, fn) => page.evaluate(fn);

try {
  // 1. first visit on a phone
  {
    const { ctx, page, errors } = await fresh();
    await open(page);
    check('opens in Mexican Spanish', (await page.evaluate(() => document.documentElement.lang)) === 'es-MX');
    check('first frame is the paper with a writing line', !!(await page.$('.composer textarea')));
    const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    check('no sideways scroll on a phone', over <= 0, `${over}px`);
    // write
    await page.tap('.composer textarea');
    await page.keyboard.type('tortillas, jitomate, 2 aguacates');
    await page.keyboard.press('Enter');
    await sleep(300);
    check('commas make three items', (await rows(page)).join('|') === 'tortillas|jitomate|2 aguacates', await rows(page));
    check('the writing line keeps focus after Enter', await page.evaluate(() => document.activeElement && document.activeElement.matches('.composer textarea')));
    // paste a WhatsApp message
    await page.evaluate(() => {
      const ta = document.querySelector('.composer textarea');
      ta.focus();
      ta.value = '[18:03, 21/10/2026] Ana: *huevos*\n- leche\n1. papel de baño';
      ta.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste' }));
    });
    await sleep(300);
    const after = await rows(page);
    check('a pasted WhatsApp list becomes clean items', after.slice(3).join('|') === 'huevos|leche|papel de baño', after.slice(3));
    // a half-written line is kept when leaving the writing line
    await page.type('.composer textarea', 'cilantro');
    await page.tap('.title');
    await sleep(300);
    check('leaving the writing line keeps what was written', (await rows(page)).includes('cilantro'));
    // strike by tap, then it settles under Tachados
    const target = (await page.$$('.pending .row'))[1];
    await target.tap();
    await sleep(200);
    check('a tap strikes the item', await page.evaluate(() => [...document.querySelectorAll('.row.done')].some((r) => r.textContent.includes('jitomate'))));
    check('the strike is drawn', await page.evaluate(() => { const r = [...document.querySelectorAll('.row.done')].find((x) => x.textContent.includes('jitomate')); return !!(r && r.querySelector('.strike path').getAttribute('d')); }));
    await sleep(1700);
    check('the struck item settles under Tachados', (await rows(page, '.struck .row')).includes('jitomate'), await rows(page, '.struck .row'));
    // persistence
    await page.reload({ waitUntil: 'networkidle2' });
    await page.waitForSelector('.row[data-id]');
    check('everything is still there after a reload', (await rows(page)).length === 7, (await rows(page)).length);
    check('no errors in the console', errors.length === 0, errors.slice(0, 3));
    await ctx.close();
  }

  // 2. undo, edit and the item card on a desk
  {
    const { ctx, page, errors } = await fresh(DESK, seedList({ fresh: false }));
    await open(page);
    const before = (await rows(page, '.pending .row')).length;
    await page.click('.pending .row:nth-child(2)', { button: 'right' });
    await page.waitForSelector('.card textarea');
    check('right-click opens the item card', true);
    await page.click('.card .btn.danger');
    await sleep(300);
    check('delete removes the item', (await rows(page, '.pending .row')).length === before - 1);
    check('a toast offers Deshacer', !!(await page.$('.toast button')));
    await page.click('.toast button');
    await sleep(300);
    check('Deshacer brings it back', (await rows(page, '.pending .row')).length === before);
    await page.click('.pending .row:nth-child(3)', { button: 'right' });
    await page.waitForSelector('.card textarea');
    await page.evaluate(() => { const ta = document.querySelector('.card textarea'); ta.value = 'cebolla morada'; });
    await page.click('.card .btn.solid');
    await sleep(300);
    check('editing an item changes its text', (await rows(page)).includes('cebolla morada'));
    await page.keyboard.down('Control'); await page.keyboard.press('z'); await page.keyboard.up('Control');
    await sleep(300);
    check('Ctrl+Z undoes the edit', (await rows(page)).includes('cebolla') && !(await rows(page)).includes('cebolla morada'));
    for (const w of [375, 768, 1024, 1600]) {
      await page.setViewport({ width: w, height: 900 });
      await sleep(250);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      check(`no sideways scroll at ${w}px`, over <= 0, `${over}px`);
    }
    check('no errors in the console', errors.length === 0, errors.slice(0, 3));
    await ctx.close();
  }

  // 3. lists written by the old app on this origin come back, untouched
  {
    const old = {
      listolista_data_local_1792643903472: JSON.stringify({ items: [{ id: 1792643903802, text: 'huevos', done: false, deleted: false, timestamp: 1792643903802 }, { id: 1792643903808, text: 'pan', done: true, deleted: false, timestamp: 1792643903831 }], meta: { title: 'SÚPER', timestamp: 1792643903843 } }),
      listolista_index_local: JSON.stringify({ local_1792643903472: { title: 'NUEVA LISTA', lastVisited: 1792643903843 } }),
      last_local_id: 'local_1792643903472',
    };
    const { ctx, page } = await fresh(PHONE, old);
    await open(page, '?local=local_1792643903472');
    check('an old list is imported and opened from its old link', (await rows(page)).join('|') === 'huevos|pan', await rows(page));
    check('its title is no longer in capitals', (await page.$eval('.title', (e) => e.value)) === 'Súper');
    check('the old link is cleaned from the address', !(await page.evaluate(() => location.search.includes('local='))));
    check('the old keys are left as they were', (await page.evaluate(() => localStorage.getItem('last_local_id'))) === 'local_1792643903472');
    await ctx.close();
  }

  // 4. sharing: a link with the key in the #fragment, a QR, and settings
  {
    const { ctx, page, errors } = await fresh(PHONE, seedList({ fresh: false }));
    await open(page);
    await page.tap('.head .pill');
    await page.waitForSelector('.card .qr svg', { timeout: 15000 });
    const hash = await page.evaluate(() => location.hash);
    check('Compartir puts a 43-character secret in the #fragment', /^#k=[A-Za-z0-9_-]{43}$/.test(hash), hash.slice(0, 8));
    check('the share card shows a QR code', !!(await page.$('.card .qr svg')));
    check('no query string carries anything', (await page.evaluate(() => location.search)) === '');
    await page.keyboard.press('Escape');
    await sleep(300);
    check('Escape closes the card', !(await page.$('.card')));
    // settings: English, chalkboard, print
    await page.tap('.head .icon-btn');
    await page.waitForSelector('.card');
    await page.evaluate(() => [...document.querySelectorAll('.card .menu-item')].find((b) => /Ajustes/.test(b.textContent)).click());
    await sleep(300);
    await page.evaluate(() => [...document.querySelectorAll('.card .chip')].find((b) => b.textContent === 'English').click());
    await sleep(300);
    check('English is a setting that sticks', (await page.evaluate(() => document.documentElement.lang)) === 'en' && /Settings/.test(await page.$eval('.card h2', (e) => e.textContent)));
    await page.evaluate(() => [...document.querySelectorAll('.card .chip')].find((b) => /Chalkboard/.test(b.textContent)).click());
    await sleep(300);
    check('the chalkboard theme applies', (await page.evaluate(() => document.documentElement.dataset.theme)) === 'pizarron');
    check('no errors in the console', errors.filter((e) => !/WebSocket/.test(e)).length === 0, errors.slice(0, 3));
    await ctx.close();
  }

  // 5. what the first self-audit fixed (each was a real bug)
  {
    const { ctx, page, errors } = await fresh(PHONE, seedList({ fresh: false }));
    await open(page);
    // strikes in a row: nothing moves under the finger until a pause, then they settle together
    const three = await page.$$eval('.pending .row[data-id]', (els) => els.slice(0, 3).map((e) => e.dataset.id));
    for (const id of three) { await page.tap(`.row[data-id="${id}"] .txt`); await sleep(350); }
    const mid = await page.$$eval('.pending .row[data-id]', (els) => els.map((e) => e.dataset.id));
    check('strikes in a row stay in place while you keep striking', three.every((id) => mid.includes(id)));
    await sleep(1700);
    const after = await page.$$eval('.struck .row[data-id]', (els) => els.map((e) => e.dataset.id));
    check('then they settle under Tachados together', three.every((id) => after.includes(id)), after.length);
    // the split hint is on its own rule, and its button is not covered by the writing line
    await page.tap('.composer textarea');
    await page.keyboard.type('huevos leche tortillas');
    await page.keyboard.press('Enter');
    await page.waitForSelector('.hint-chip .chip', { timeout: 5000 });
    await sleep(500); // the writing block glides into place first
    const covered = await page.$eval('.hint-chip .chip', (b) => { const r = b.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !(hit === b || b.contains(hit)); });
    check('the "¿Separar en 3?" button is not covered', !covered);
    await page.tap('.hint-chip .chip');
    await sleep(300);
    const texts = await rows(page);
    check('tapping it makes three items', ['huevos', 'leche', 'tortillas'].every((w) => texts.includes(w)) && !texts.includes('huevos leche tortillas'));
    // typing a title while the other phone's changes arrive: what you type stays
    await page.tap('.title');
    await page.$eval('.title', (e) => e.select()); // the seeded sheet has a title already
    await page.keyboard.type('Súper');
    await page.evaluate(async () => {
      const { store } = window.__papelito;
      const D = await import(new URL('./src/model/doc.js', location.href).href).catch(() => null);
      if (!D) { store.emit('remote', { added: [], removed: [], struck: [], unstruck: [], edited: [], joined: [] }); return; } // production build: a re-render is enough
      const H = await import(new URL('./src/model/hlc.js', location.href).href);
      const doc = D.sanitize(JSON.parse(D.canonical(store.doc)));
      D.addItem(doc, H.createClock('zz9otro0'), 'otroitem01', 'cilantro');
      store.applyRemote(JSON.parse(D.canonical(doc)));
    });
    await sleep(700); // past the title's save pause
    await page.keyboard.type(' del sábado');
    check('a title being typed is never overwritten by a render', (await page.$eval('.title', (e) => e.value)) === 'Súper del sábado', await page.$eval('.title', (e) => e.value));
    await page.keyboard.press('Enter');
    // deleting the open sheet from Mis hojas, then Deshacer: the same sheet comes back, open
    const openId = await page.evaluate(() => window.__papelito.store.rec.id);
    const n = (await rows(page)).length;
    await page.tap('.head .icon-btn');
    await page.waitForSelector('.card');
    await page.evaluate(() => [...document.querySelectorAll('.card .menu-item')].find((b) => /Mis hojas/.test(b.textContent)).click());
    await sleep(300);
    await page.evaluate(() => document.querySelector('.card .icon-btn[aria-label^="Borrar"]').click());
    await sleep(300);
    check('deleting the open sheet opens another one', (await page.evaluate(() => window.__papelito.store.rec.id)) !== openId);
    await page.evaluate(() => [...document.querySelectorAll('.toast button')].find((b) => /Deshacer/.test(b.textContent)).click());
    await sleep(400);
    check('Deshacer brings the sheet back, open, with its items', (await page.evaluate(() => window.__papelito.store.rec.id)) === openId && (await rows(page)).length === n);
    // a card closed with Back after making a new link keeps the new link (it reopened the old one)
    if (await page.$('.card')) { await page.keyboard.press('Escape'); await sleep(300); }
    await page.tap('.head .pill');
    await page.waitForFunction(() => location.hash.startsWith('#k='), { timeout: 15000 });
    await page.waitForSelector('.card .qr svg', { timeout: 15000 });
    const oldHash = await page.evaluate(() => location.hash);
    await page.evaluate(() => [...document.querySelectorAll('.card .btn')].find((b) => /enlace nuevo/i.test(b.textContent)).click());
    await page.waitForFunction((h) => location.hash !== h && location.hash.startsWith('#k='), { timeout: 20000 }, oldHash);
    await page.goBack();
    await sleep(800);
    const now = await page.evaluate(() => ({ hash: location.hash, secret: window.__papelito.store.rec.secret, card: !!document.querySelector('.card') }));
    // a toast while a card is open on a phone never covers the card's buttons
    await page.evaluate(() => { const app = document.querySelector('papel-app'); app.openCard('item', { id: window.__papelito.store.items()[0].id }); });
    await page.waitForSelector('.card .chip');
    await page.evaluate(() => [...document.querySelectorAll('.card .chip')].find((c) => c.getAttribute('aria-pressed') === 'false').click());
    await page.waitForSelector('.toast');
    const clash = await page.evaluate(() => {
      const t = document.querySelector('.toast').getBoundingClientRect();
      return [...document.querySelectorAll('.card button')].some((b) => { const r = b.getBoundingClientRect(); return r.width && r.left < t.right && r.right > t.left && r.top < t.bottom && r.bottom > t.top; });
    });
    check('a toast over an open card does not cover its buttons', !clash);
    await page.keyboard.press('Escape');
    await sleep(300);
    check('Back closes the card and keeps the new link', !now.card && now.hash !== oldHash && now.hash === `#k=${now.secret}`, now.hash.slice(0, 8));
    check('no errors in the console', errors.filter((e) => !/WebSocket/.test(e)).length === 0, errors.slice(0, 3));
    await ctx.close();
  }

  // 6. two phones through the real relays (opt-in)
  if (SYNC) {
    const a = await fresh(PHONE, seedList({ fresh: false }));
    await open(a.page);
    await a.page.tap('.head .pill');
    await a.page.waitForFunction(() => location.hash.startsWith('#k='));
    const link = await a.page.evaluate(() => location.href);
    const b = await fresh(PHONE);
    const t0 = Date.now();
    await b.page.goto(link, { waitUntil: 'domcontentloaded' });
    await b.page.waitForFunction(() => document.querySelectorAll('.row[data-id]').length >= 10, { timeout: 30000 });
    check('a second phone opening the link gets the list', true, `${Date.now() - t0} ms`);
    await a.page.keyboard.press('Escape');
    await a.page.tap('.composer textarea');
    await a.page.keyboard.type('limones');
    const t1 = Date.now();
    await a.page.keyboard.press('Enter');
    await b.page.waitForFunction(() => [...document.querySelectorAll('.row')].some((r) => r.textContent.includes('limones')), { timeout: 20000 });
    check('what one phone writes appears on the other', true, `${Date.now() - t1} ms`);
    await a.ctx.close();
    await b.ctx.close();
  }
} catch (e) {
  check('smoke run finished', false, String(e && e.message));
}
await browser.close();
const failed = results.filter((x) => !x).length;
console.log(failed ? `${failed} FAILED of ${results.length}` : `all ${results.length} passed`);
process.exit(failed ? 1 : 0);
