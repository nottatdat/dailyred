import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { identifyRom, saveRom, loadRom, forgetRom, ROM_SIZE } from '../../web/rom-store.js';

const rev1 = process.env.FIRERED_REV1 && new Uint8Array(readFileSync(process.env.FIRERED_REV1));

test('identifies FireRed Rev 1 by its bytes', { skip: !rev1 && 'FIRERED_REV1 not set' }, async () => {
  assert.equal(await identifyRom(rev1), 'rev1');
});

test('rejects a modified ROM', { skip: !rev1 && 'FIRERED_REV1 not set' }, async () => {
  const hacked = rev1.slice(); hacked[0x100] ^= 1;
  assert.equal(await identifyRom(hacked), null);
});

test('rejects wrong sizes without hashing', async () => {
  const huge = new Uint8Array(200 * 1024 * 1024);
  const started = performance.now();
  assert.equal(await identifyRom(huge), null);
  assert.ok(performance.now() - started < 50, 'should not hash');
  assert.equal(await identifyRom(new Uint8Array(ROM_SIZE - 1)), null);
});

test('without IndexedDB the ROM is kept for the visit', async () => {
  // Node has no indexedDB: this is the private-mode path.
  const bytes = new Uint8Array([1, 2, 3]);
  await saveRom(bytes);
  assert.deepEqual(await loadRom(), bytes);
  await forgetRom();
  assert.equal(await loadRom(), null);
});
