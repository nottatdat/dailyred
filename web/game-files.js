// Builds the game in the browser: the player's own FireRed ROM (rom-store.js)
// plus this site's Daily Red patch (bps.js). The emulator core is downloaded
// once per visit and kept in memory, so a new run only restarts the emulator.
import { applyBps } from './bps.js';
import { identifyRom, loadRom, forgetRom, WRONG_ROM_MESSAGE } from './rom-store.js';

export class NoRomError extends Error {}

const CORE = {
  coreJs: 'vendor/mgba_libretro.js',
  coreWasm: 'vendor/mgba_libretro.wasm',
};

let cached = null;

// onProgress(loadedBytes, totalBytes) — totalBytes is 0 when unknown.
export function loadGameFiles(onProgress = () => {}) {
  cached ??= build(onProgress).catch((err) => {
    cached = null; // allow a retry
    throw err;
  });
  return cached;
}

// After the player loads or forgets a ROM.
export function resetGameFiles() {
  cached = null;
}

async function fetchOk(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Couldn't download ${url} (HTTP ${res.status}).`);
  return res;
}

async function build(onProgress) {
  const base = await loadRom();
  if (!base) throw new NoRomError('Load your Pokémon FireRed ROM first.');
  const version = await identifyRom(base);
  if (!version) {
    await forgetRom();
    throw new NoRomError(WRONG_ROM_MESSAGE);
  }
  const manifest = await (await fetchOk('game/patches.json')).json();
  const entry = manifest[version];
  if (!entry) throw new Error(`This site has no patch for FireRed ${version}.`);

  const urls = [`game/${entry.patch}`, CORE.coreJs, CORE.coreWasm];
  const responses = await Promise.all(urls.map(fetchOk));
  // Content-Length is only meaningful when the host didn't re-encode the file.
  const sizes = responses.map((r) => (r.headers.get('Content-Encoding') ? 0 : Number(r.headers.get('Content-Length')) || 0));
  const total = sizes.every(Boolean) ? sizes.reduce((a, b) => a + b, 0) : 0;
  let loaded = 0;
  const report = (n) => { loaded += n; onProgress(loaded, total); };

  const [patch, coreJs, coreWasm] = await Promise.all(responses.map((res) => readAll(res, report)));
  return {
    rom: applyBps(base, patch),
    coreJs: new Blob([coreJs], { type: 'text/javascript' }),
    coreWasm: new Blob([coreWasm], { type: 'application/wasm' }),
  };
}

async function readAll(res, report) {
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
    report(value.length);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
