// Two phones, one sheet, through the real public relays (no browser): phone A writes and shares,
// phone B opens the link, then each edits and we time how long the other takes to see it.
// Prints PASS/FAIL lines with measured values; exit 1 on any failure.
// Run: node tools/sync-live.mjs [--relays=wss://a,wss://b]
import { Store } from '../src/app/store.js';
import { Session, RELAYS, listKeys } from '../src/sync/session.js';
import { newSecret } from '../src/sync/crypto.js';
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
const healthy = sc.pool.relays.filter((r) => r.state === 'open').map((r) => r.url.replace('wss://', ''));
console.log(`relays open for C: ${healthy.length}/${relays.length}: ${healthy.join(', ')}`);
const banned = sc.pool.relays.filter((r) => r.banned).map((r) => `${r.url} (${r.error})`);
if (banned.length) console.log(`relays that refused: ${banned.join('; ')}`);
sc.stop();

console.log(`total ${((Date.now() - t0) / 1000).toFixed(1)} s; ${failed ? `${failed} FAILED` : 'all passed'}`);
process.exit(failed ? 1 : 0);
