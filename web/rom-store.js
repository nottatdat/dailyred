// The player's own Pokémon FireRed ROM: recognising it, and remembering it in
// this browser (IndexedDB) so it's only loaded once. The original ROM is stored,
// not the patched game, so a site update never needs a new upload. Nothing here
// ever sends the ROM anywhere.

export const ROM_SIZE = 16 * 1024 * 1024;
export const FIRERED_VERSIONS = {
  '41cb23d8dccc8ebd7c649cd8fbb58eeace6e2fdc': '1.0',
  dd5945db9b930750cb39d00c84da8571feebf417: 'rev1',
};
export const WRONG_ROM_MESSAGE = "This isn't English Pokémon FireRed (1.0 or Rev 1).";

export async function identifyRom(bytes) {
  if (bytes.length !== ROM_SIZE) return null;
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-1', bytes));
  const hex = Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
  return FIRERED_VERSIONS[hex] ?? null;
}

const DB = 'dailyred';
const STORE = 'rom';
const KEY = 'firered';
let memory = null; // fallback when IndexedDB is unavailable (e.g. private mode)

function request(mode, run) {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB unavailable')); return; }
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    open.onerror = () => reject(open.error);
    open.onblocked = () => reject(new Error('IndexedDB blocked'));
    open.onsuccess = () => {
      const db = open.result;
      db.onversionchange = () => db.close();
      const fail = (err) => { db.close(); reject(err); };
      try {
        const tx = db.transaction(STORE, mode);
        const req = run(tx.objectStore(STORE));
        let result;
        req.onsuccess = () => { result = req.result; };
        // Resolve only once the transaction has committed, so a failed write
        // (e.g. quota) rejects instead of reporting success.
        tx.oncomplete = () => { db.close(); resolve(result); };
        tx.onabort = () => fail(tx.error ?? new Error('IndexedDB transaction aborted'));
        tx.onerror = () => fail(tx.error ?? new Error('IndexedDB transaction error'));
      } catch (err) {
        fail(err);
      }
    };
  });
}

export async function saveRom(bytes) {
  memory = bytes;
  try {
    await request('readwrite', (store) => store.put(bytes, KEY));
  } catch (err) {
    console.warn('ROM kept for this visit only:', err.message);
  }
}

export async function loadRom() {
  if (memory) return memory;
  try {
    const stored = await request('readonly', (store) => store.get(KEY));
    memory = stored ? new Uint8Array(stored) : null;
  } catch {
    memory = null;
  }
  return memory;
}

export async function forgetRom() {
  memory = null;
  try {
    await request('readwrite', (store) => store.delete(KEY));
  } catch { /* nothing stored */ }
}
