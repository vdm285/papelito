import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newSecret, isSecret, deriveKeys, seal, open, toB64url, fromB64url } from '../src/sync/crypto.js';

test('secrets are 43 url-safe characters and round-trip', () => {
  for (let i = 0; i < 50; i++) {
    const s = newSecret();
    assert.ok(isSecret(s), s);
    assert.equal(toB64url(fromB64url(s)), s);
  }
});

test('the same secret derives the same keys on every phone; another secret derives others', async () => {
  const s = newSecret();
  const a = await deriveKeys(s);
  const b = await deriveKeys(s);
  const c = await deriveKeys(newSecret());
  assert.equal(a.room, b.room);
  assert.deepEqual(a.sign, b.sign);
  assert.notEqual(a.room, c.room);
  assert.match(a.room, /^[0-9a-f]{32}$/);
});

test('seal and open round-trip; a wrong key, wrong context or a flipped bit gives null', async () => {
  const k = await deriveKeys(newSecret());
  const other = await deriveKeys(newSecret());
  const value = { v: 2, items: { a: ['jitomate saladet', 'x'] }, title: ['Súper ñ ü ¿¡', ''] };
  const blob = await seal(k.encKey, value, 'slot-1');
  assert.deepEqual(await open(k.encKey, blob, 'slot-1'), value);
  assert.equal(await open(other.encKey, blob, 'slot-1'), null);
  assert.equal(await open(k.encKey, blob, 'slot-2'), null);
  const bytes = Buffer.from(blob, 'base64');
  bytes[40] ^= 1;
  assert.equal(await open(k.encKey, bytes.toString('base64'), 'slot-1'), null);
  assert.equal(await open(k.encKey, 'not base64 at all!', 'slot-1'), null);
});

test('padding hides small differences in size', async () => {
  const k = await deriveKeys(newSecret());
  const a = await seal(k.encKey, { items: ['leche'] });
  const b = await seal(k.encKey, { items: ['leche', 'huevos', 'pan', 'tortillas'] });
  assert.equal(a.length, b.length);
});

test('a 600-item list fits comfortably in one relay message', async () => {
  const k = await deriveKeys(newSecret());
  const items = {};
  for (let i = 0; i < 600; i++) items[`it${String(i).padStart(6, '0')}`] = { c: '0mgx3k2a10000phonea00', by: 'phonea00', t: [`producto número ${i} con un nombre largo`, '0mgx3k2a10000phonea00'], d: ['', ''], a: ['', ''], x: [0, '0mgx3k2a10000phonea00'] };
  const blob = await seal(k.encKey, { v: 2, items });
  assert.ok(blob.length < 60_000, `${blob.length} chars`);
});
