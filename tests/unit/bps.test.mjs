import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyBps, crc32 } from '../../web/bps.js';

const FLIPS = new URL('../../.toolchain/bin/flips', import.meta.url).pathname;

function makePatch(source, target, mode = '--bps-delta') {
  const dir = mkdtempSync(join(tmpdir(), 'bps-'));
  writeFileSync(join(dir, 'a'), source);
  writeFileSync(join(dir, 'b'), target);
  execFileSync(FLIPS, ['--create', mode, join(dir, 'a'), join(dir, 'b'), join(dir, 'p.bps')]);
  return new Uint8Array(readFileSync(join(dir, 'p.bps')));
}

function randomBytes(n, seed) {
  const out = new Uint8Array(n);
  let x = seed;
  for (let i = 0; i < n; i++) { x = (x * 1103515245 + 12345) >>> 0; out[i] = x >>> 24; }
  return out;
}

test('crc32 matches the standard check value', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xCBF43926);
});

test('reproduces a target with moved, edited and new data', () => {
  const source = randomBytes(200_000, 1);
  const target = new Uint8Array(260_000);
  target.set(source.subarray(50_000, 150_000), 0);        // moved block
  target.set(source.subarray(0, 50_000), 100_000);         // another moved block
  target.set(randomBytes(60_000, 2), 150_000);             // new data
  target[123] ^= 0xFF;                                     // small edit
  for (const mode of ['--bps-delta', '--bps-linear']) {
    assert.deepEqual(applyBps(source, makePatch(source, target, mode)), target, mode);
  }
});

test('rejects the wrong source', () => {
  const source = randomBytes(10_000, 3);
  const patch = makePatch(source, randomBytes(10_000, 4));
  const other = source.slice(); other[0] ^= 1;
  assert.throws(() => applyBps(other, patch), /^Error: Patch failed: the ROM doesn't match/);
});

test('rejects a damaged patch', () => {
  const source = randomBytes(10_000, 5);
  const patch = makePatch(source, randomBytes(10_000, 6));
  patch[patch.length >> 1] ^= 1;
  assert.throws(() => applyBps(source, patch), /^Error: Patch failed: the patch file is damaged/);
});

test('rejects something that is not a BPS patch', () => {
  assert.throws(() => applyBps(new Uint8Array(4), new Uint8Array(32)), /^Error: Patch failed: not a BPS patch/);
});
