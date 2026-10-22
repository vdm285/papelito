// End-to-end encryption for shared lists. The secret lives only in the link's #fragment (browsers
// never send the fragment to any server). From it we derive, with HKDF-SHA-256:
//   enc   an AES-256-GCM key for the list's contents
//   sign  32 bytes for the key that signs our records on public relays (who may write the slot)
//   room  16 bytes that name the list on the relays (unguessable, reveals nothing about the secret)
// A sealed blob is: version byte ‖ 12-byte IV ‖ AES-GCM( 4-byte length ‖ deflate(JSON) ‖ zero pad ).
// Padding rounds every blob up to a multiple of PAD bytes, so its size says little about the list.

const enc = new TextEncoder();
const dec = new TextDecoder();
const SALT = enc.encode('papelito/v2');
const PAD = 512;
const VERSION = 2;

export const SECRET_BYTES = 32;

export function newSecret() {
  return toB64url(crypto.getRandomValues(new Uint8Array(SECRET_BYTES)));
}

export const isSecret = (s) => typeof s === 'string' && /^[A-Za-z0-9_-]{43}$/.test(s);

export async function deriveKeys(secret) {
  const raw = fromB64url(secret);
  if (raw.length !== SECRET_BYTES) throw new Error('bad secret');
  const base = await crypto.subtle.importKey('raw', raw, 'HKDF', false, ['deriveBits', 'deriveKey']);
  const bits = (info, n) => crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: SALT, info: enc.encode(info) }, base, n * 8).then((b) => new Uint8Array(b));
  const encKey = await crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: SALT, info: enc.encode('enc') }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const slotKey = await crypto.subtle.importKey('raw', await bits('slot', 32), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return { encKey, slotKey, sign: await bits('sign', 32), signAlt: await bits('sign/1', 32), room: toHex(await bits('room', 16)) };
}

/** Each phone's slot on the relays: an HMAC of its device id, so relays never see the id itself. */
export async function slotTag(slotKey, device) {
  return toHex(new Uint8Array(await crypto.subtle.sign('HMAC', slotKey, enc.encode(device)))).slice(0, 32);
}

export async function seal(encKey, value, aad = '') {
  const json = enc.encode(JSON.stringify(value));
  const packed = await deflate(json);
  const total = Math.ceil((4 + packed.length) / PAD) * PAD;
  const plain = new Uint8Array(total);
  new DataView(plain.buffer).setUint32(0, packed.length);
  plain.set(packed, 4);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(aad) }, encKey, plain));
  const out = new Uint8Array(1 + 12 + ct.length);
  out[0] = VERSION;
  out.set(iv, 1);
  out.set(ct, 13);
  return toB64(out);
}

/** Returns the decrypted value, or null when the blob is not ours (wrong key, tampered, other version). */
export async function open(encKey, blob, aad = '') {
  try {
    const bytes = fromB64(blob);
    if (bytes[0] !== VERSION || bytes.length < 13 + 16 + PAD) return null;
    const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.subarray(1, 13), additionalData: enc.encode(aad) }, encKey, bytes.subarray(13)));
    const n = new DataView(plain.buffer).getUint32(0);
    if (n > plain.length - 4) return null;
    return JSON.parse(dec.decode(await inflate(plain.subarray(4, 4 + n))));
  } catch {
    return null;
  }
}

async function pipe(bytes, stream) {
  const res = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await res.arrayBuffer());
}
const deflate = (b) => pipe(b, new CompressionStream('deflate-raw'));
const inflate = (b) => pipe(b, new DecompressionStream('deflate-raw'));

// ---------- encodings ----------

export function toB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
export function fromB64(s) {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
export const toB64url = (bytes) => toB64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const fromB64url = (s) => fromB64(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
export const toHex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
export const fromHex = (h) => new Uint8Array(h.match(/../g).map((x) => parseInt(x, 16)));
