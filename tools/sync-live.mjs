// Two phones, one sheet, through the real public relays (no browser): phone A writes and shares,
// phone B opens the link, then each edits and we time how long the other takes to see it.
// Prints PASS/FAIL lines with measured values; exit 1 on any failure.
// Run: node tools/sync-live.mjs [--relays=wss://a,wss://b]
import { Store } from '../src/app/store.js';
import { Session, RELAYS, listKeys } from '../src/sync/session.js';
import { newSecret, open } from '../src/sync/crypto.js';
import { RelayPool, dTag } from '../src/sync/nostr.js';
import { liveItems, isDone } from '../src/model/doc.js';

class MemoryStorage {
  constructor() { this.m = new Map(); }
  get length() { return this.m.size; }
  key(i) { return [...this.m.keys()][i] ?? null; }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
}

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=').slice(1).join('=') || d;
const relays = arg('relays', '') ? arg('relays').split(',') : RELAYS;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (name, ok, detail) => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined ? `  (${detail})` : ''}`); };
async function until(fn, ms = 15000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return Date.now() - t0; await sleep(25); } return -1; }

const A = new Store(new MemoryStorage());
const B = new Store(new MemoryStorage());
const statuses = { A: '', B: '' };

// phone A writes a list and shares it
A.newList();
A.setTitle('Súper del sábado');
A.add('tortillas, jitomate, 2 aguacates');
const secret = newSecret();
const { room } = await listKeys(secret);
A.setSecret(secret, room);
A.ensureInk();
const sa = new Session(A, { relays, onStatus: (s) => { statuses.A = s.status; } });
await sa.start(A.rec);
A.on((kind) => { if (kind === 'change') sa.changed(); });

const t0 = Date.now();
const firstOk = await until(() => sa.confirmed, 15000);
check('phone A: a relay confirmed its slot', firstOk >= 0, `${firstOk} ms`);

// phone B opens the link
B.openShared(secret, room);
B.ensureInk();
const sb = new Session(B, { relays, onStatus: (s) => { statuses.B = s.status; } });
await sb.start(B.rec);
B.on((kind) => { if (kind === 'change') sb.changed(); });
const got = await until(() => liveItems(B.doc).length === 3 && B.title() === 'Súper del sábado', 20000);
check('phone B receives the list and its title', got >= 0, `${got} ms after opening`);

// A adds an item live; B sees it
const tAdd = Date.now();
A.add('papel de baño');
const seenAdd = await until(() => liveItems(B.doc).some((i) => i.t[0] === 'papel de baño'), 15000);
check('A adds → B sees it', seenAdd >= 0, `${seenAdd} ms`);

// B strikes an item; A sees the strike in B's ink
const tort = liveItems(B.doc).find((i) => i.t[0] === 'tortillas');
B.toggle(tort.id);
const seenStrike = await until(() => { const it = A.doc.items[tort.id]; return it && isDone(it) && it.d[0] === B.device; }, 15000);
check('B strikes → A sees it, struck by B', seenStrike >= 0, `${seenStrike} ms`);

// both edit at the same moment; both converge
A.add('cebolla');
B.add('cilantro');
const conv = await until(() => {
  const a = liveItems(A.doc).map((i) => i.t[0]).sort().join('|');
  const b = liveItems(B.doc).map((i) => i.t[0]).sort().join('|');
  return a === b && a.includes('cebolla') && a.includes('cilantro');
}, 20000);
check('simultaneous adds on both phones converge', conv >= 0, `${conv} ms`);

// the two phones write in different inks, and both agree on whose is whose
const inks = await until(() => A.inkOf(A.device) !== A.inkOf(B.device) && A.inkOf(B.device) === B.inkOf(B.device) && B.inkOf(A.device) === A.inkOf(A.device), 15000);
check('each phone writes in its own ink, the same on both phones', inks >= 0, `A ${A.inkOf(A.device)}, B ${B.inkOf(B.device)}`);

// presence: each sees the other
const pres = await until(() => sa.others().length >= 1 && sb.others().length >= 1, 15000);
check('each phone sees the other as present', pres >= 0, `${pres} ms`);

// a third phone opening later, after A and B left, still gets everything from the relays
sa.stop(); sb.stop();
await sleep(1200);
const C = new Store(new MemoryStorage());
C.openShared(secret, room);
const sc = new Session(C, { relays });
await sc.start(C.rec);
const late = await until(() => liveItems(C.doc).length === 6, 20000);
check('a phone opening later gets the whole list from the relays alone', late >= 0, `${late} ms, ${liveItems(C.doc).length} items`);
// A comes back later and asks only for what is new since its last sync: it still gets C's change
C.on((kind) => { if (kind === 'change') sc.changed(); });
C.add('tomate verde');
await sleep(1500);
check('phone A remembers when it last synced', A.rec.syncedAt > 0, A.rec.syncedAt);
const sa2 = new Session(A, { relays });
await sa2.start(A.rec);
const back = await until(() => liveItems(A.doc).some((i) => i.t[0] === 'tomate verde'), 20000);
check('a phone coming back gets what changed while it was away', back >= 0, `${back} ms`);
sa2.stop();

// A makes a new link: the old link stops carrying the list (old slots scrubbed and deleted)
const sa3 = new Session(A, { relays });
await sa3.start(A.rec);
await sleep(2500);
const oldSecret = A.rec.secret;
const scrubbed = await sa3.scrubForMove();
sa3.stop();
check('rotating the link replaces every old slot with a "moved" marker', scrubbed >= 2, `${scrubbed} slots`);
await sleep(2500);
const D = new Store(new MemoryStorage());
const { room: oldRoom } = await listKeys(oldSecret);
D.openShared(oldSecret, oldRoom);
let movedSeen = false;
const sd = new Session(D, { relays, onMoved: () => { movedSeen = true; } });
await sd.start(D.rec);
await sleep(6000);
check('a phone opening the old link learns that the sheet moved', movedSeen);
// scrubbing the old copies off the relays is best effort (each relay deletes at its own pace,
// and none promises to): report it; the guarantee is the next check
console.log(`info  old copies still served to the old link right after rotating: ${liveItems(D.doc).length} items`);
// the guarantee: what is written after the rotation never reaches the old link
const sa4 = new Session(A, { relays });
A.setSecret((await import('../src/sync/crypto.js')).newSecret(), 'x'.repeat(32));
const { room: newRoom } = await listKeys(A.rec.secret);
A.setSecret(A.rec.secret, newRoom);
await sa4.start(A.rec);
A.on((kind) => { if (kind === 'change') sa4.changed(); });
A.add('secreto nuevo');
await sleep(4000);
check('what is written after rotating never reaches the old link', !liveItems(D.doc).some((i) => i.t[0] === 'secreto nuevo'));
sa4.stop();
sd.stop();
if (process.argv.includes('--debug-scrub')) {
  const ok = await listKeys(oldSecret);
  for (const url of relays) {
    const got = [];
    const pool = new RelayPool([url], { sk: ok.sk, onEvent: (ev) => got.push(ev), onEose: () => {} });
    pool.subscribe('q', [{ kinds: [30078], authors: [ok.pk], limit: 60 }]);
    pool.start();
    await sleep(2500);
    pool.stop();
    const out = [];
    for (const ev of got) {
      const v = await open(ok.encKey, ev.content, `ll2|${ok.pk}|${dTag(ev)}`);
      out.push(`${dTag(ev).slice(0, 6)}@${ev.created_at % 1000}:${v ? (v.moved ? 'moved' : 'FULL') : '?'}`);
    }
    console.log(`  ${url.replace('wss://', '').padEnd(24)} ${out.join(' ')}`);
  }
}
const healthy = sc.pool.relays.filter((r) => r.state === 'open').map((r) => r.url.replace('wss://', ''));
console.log(`relays open for C: ${healthy.length}/${relays.length}: ${healthy.join(', ')}`);
const banned = sc.pool.relays.filter((r) => r.banned).map((r) => `${r.url} (${r.error})`);
if (banned.length) console.log(`relays that refused everything: ${banned.join('; ')}`);
const partial = sc.pool.relays.filter((r) => r.noKinds.size).map((r) => `${r.url} (no kind ${[...r.noKinds].join(',')})`);
if (partial.length) console.log(`relays that refused one kind: ${partial.join('; ')}`);
check('no relay is dropped for refusing only the presence kind', !sc.pool.relays.some((r) => r.banned && /kind/i.test(r.error)));
sc.stop();

console.log(`total ${((Date.now() - t0) / 1000).toFixed(1)} s; ${failed ? `${failed} FAILED` : 'all passed'}`);
process.exit(failed ? 1 : 0);
