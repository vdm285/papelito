// Hybrid logical clock. A stamp is wall-clock milliseconds plus a counter plus the device id, so
// a phone whose clock runs behind still stamps its next change after every change it has seen,
// and two phones never produce the same stamp. Stamps compare as plain strings (fixed widths).
//
//   0mgx3k2a1 0000 ab12cd34
//   └ ms ───┘ └ n┘ └device┘   (no separators; 9 + 4 + 8 characters)

const MS = 9;
const N = 4;
export const DEVICE_LEN = 8;
const MAX_N = 36 ** N - 1;
const MAX_MS = 36 ** MS - 1; // the year 5188: a clock beyond it would make stamps one character too long

const pad = (s, w) => (s.length >= w ? s : '0'.repeat(w - s.length) + s);

export function format(ms, n, device) {
  return pad(ms.toString(36), MS) + pad(n.toString(36), N) + device;
}

export function parse(stamp) {
  return {
    ms: parseInt(stamp.slice(0, MS), 36),
    n: parseInt(stamp.slice(MS, MS + N), 36),
    device: stamp.slice(MS + N),
  };
}

/** Milliseconds since the epoch encoded in a stamp (for "added 3 days ago"; never for ordering). */
export const stampTime = (stamp) => parseInt(stamp.slice(0, MS), 36);

export const isStamp = (s) => typeof s === 'string' && /^[0-9a-z]{13}[0-9a-z]{8}$/.test(s);

export function createClock(device, now = () => Date.now()) {
  if (typeof device !== 'string' || device.length !== DEVICE_LEN) throw new Error('device id must be 8 characters');
  let last = 0;
  let n = 0;
  let skew = 0; // ms to add to this phone's clock (from the web server's Date, see sync/session.js)
  return {
    device,
    /** Correct this phone's clock by `ms` from now on (a phone whose clock is days off). */
    setSkew(ms) { skew = Number.isFinite(ms) ? ms : 0; },
    /** A new stamp, later than every stamp issued or observed so far. */
    tick() {
      const t = Math.min(Math.floor(now() + skew), MAX_MS);
      if (t > last) { last = t; n = 0; } else if (n < MAX_N) n++; else { last++; n = 0; }
      return format(last, n, device);
    },
    /** Remember a stamp that arrived from another phone so the next tick sorts after it. */
    observe(stamp) {
      if (!isStamp(stamp)) return;
      const p = parse(stamp);
      // a stamp far in the future (a crafted copy, or a phone whose clock is broken) must not drag
      // this clock to the end of time: every later edit of this phone would then look ancient
      if (p.ms > now() + skew + 864e5) return;
      if (p.ms > last || (p.ms === last && p.n > n)) { last = p.ms; n = p.n; }
    },
  };
}

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';
/** Random lowercase base-36 id from the platform's CSPRNG (bytes ≥ 252 are rejected: no bias). */
export function randomId(len = DEVICE_LEN) {
  let s = '';
  while (s.length < len) {
    for (const b of crypto.getRandomValues(new Uint8Array(len * 2))) {
      if (b < 252 && s.length < len) s += ALPHABET[b % 36];
    }
  }
  return s;
}
