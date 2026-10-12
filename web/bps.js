// Applies a BPS patch to a ROM (format: byuu's BPS, as written by Flips).
// The site ships Daily Red only as patches against the player's own FireRed.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function fail(message) {
  throw new Error(`Patch failed: ${message}`);
}

export function applyBps(source, patch) {
  if (patch.length < 19 || String.fromCharCode(...patch.subarray(0, 4)) !== 'BPS1') fail('not a BPS patch');
  const footer = new DataView(patch.buffer, patch.byteOffset + patch.length - 12, 12);
  const sourceCrc = footer.getUint32(0, true);
  const targetCrc = footer.getUint32(4, true);
  const patchCrc = footer.getUint32(8, true);
  if (crc32(patch.subarray(0, patch.length - 4)) !== patchCrc) fail('the patch file is damaged');
  if (crc32(source) !== sourceCrc) fail("the ROM doesn't match this patch");

  const end = patch.length - 12;
  let pos = 4;
  // Variable-length numbers; plain arithmetic because values can exceed 2^31.
  const number = () => {
    let value = 0;
    let shift = 1;
    for (;;) {
      if (pos >= end) fail('the patch file is damaged');
      const x = patch[pos++];
      value += (x & 0x7F) * shift;
      if (x & 0x80) return value;
      shift *= 128;
      value += shift;
    }
  };
  const signed = () => {
    const n = number();
    return (n % 2 ? -1 : 1) * Math.floor(n / 2);
  };

  const sourceSize = number();
  const targetSize = number();
  const metadataLength = number();
  pos += metadataLength; // metadata (`pos += number()` would read pos before the call advances it)
  if (sourceSize !== source.length) fail("the ROM doesn't match this patch");

  const target = new Uint8Array(targetSize);
  let out = 0;
  let sourceRel = 0;
  let targetRel = 0;
  while (pos < end) {
    const data = number();
    const action = data % 4;
    const length = Math.floor(data / 4) + 1;
    if (out + length > targetSize) fail('the patch file is damaged');
    if (action === 0) { // SourceRead
      target.set(source.subarray(out, out + length), out);
    } else if (action === 1) { // TargetRead
      if (pos + length > end) fail('the patch file is damaged');
      target.set(patch.subarray(pos, pos + length), out);
      pos += length;
    } else if (action === 2) { // SourceCopy
      sourceRel += signed();
      if (sourceRel < 0 || sourceRel + length > source.length) fail('the patch file is damaged');
      target.set(source.subarray(sourceRel, sourceRel + length), out);
      sourceRel += length;
    } else { // TargetCopy: may overlap the bytes being written, so copy one at a time
      targetRel += signed();
      if (targetRel < 0 || targetRel >= out) fail('the patch file is damaged');
      for (let i = 0; i < length; i++) target[out + i] = target[targetRel + i];
      targetRel += length;
    }
    out += length;
  }
  if (out !== targetSize || crc32(target) !== targetCrc) fail("the result isn't the expected game");
  return target;
}
