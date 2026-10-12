import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { applyBps } from '../../web/bps.js';

const root = new URL('../../', import.meta.url).pathname;
const game = `${root}web/game/`;
const built = new Uint8Array(readFileSync(`${root}pokefirered/pokefirered_modern.gba`));
const manifest = JSON.parse(readFileSync(`${game}patches.json`, 'utf8'));
const bases = {
  '1.0': `${root}.toolchain/vanilla/pokefirered.gba`,
  rev1: process.env.FIRERED_REV1,
};

for (const [version, entry] of Object.entries(manifest)) {
  test(`patch for FireRed ${version} rebuilds the Daily Red ROM exactly`, () => {
    const base = new Uint8Array(readFileSync(bases[version]));
    assert.equal(createHash('sha1').update(base).digest('hex'), entry.sha1);
    const out = applyBps(base, new Uint8Array(readFileSync(game + entry.patch)));
    assert.ok(Buffer.from(out).equals(Buffer.from(built)));
  });
}

test('both versions are covered', () => {
  assert.deepEqual(Object.keys(manifest).sort(), ['1.0', 'rev1']);
});

test('web/game ships no ROM and no Nintendo artwork', () => {
  const files = existsSync(game) ? readdirSync(game) : [];
  assert.deepEqual(files.filter((f) => /\.gba|red\.png/i.test(f)), []);
});
