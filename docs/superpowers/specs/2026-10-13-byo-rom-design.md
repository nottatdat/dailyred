# Bring-your-own-ROM hosting for Daily Red — design

Date: 2026-10-13. Branch: `byo-rom`. Status: approved in conversation, awaiting spec review.

## Goal

Host Daily Red publicly at **https://red.tatd.at** without the server ever
serving Pokémon FireRed game content. Players supply their own FireRed ROM;
the site turns it into the Daily Red game inside their browser.

Success means:

- The deployed site contains no ROM, no built game, and no Nintendo artwork.
- A player with an English FireRed 1.0 or Rev 1 ROM can load it once and play
  the daily battle exactly as the current site does (same team, same seed
  injection, same stats).
- Any other file is rejected with a message that names the accepted versions.
- The player's ROM never leaves their browser.

## Constraints

- Battles still run on the real FireRed engine: the ROM is still built from
  pret/pokefirered @ `037335f` plus `patches/`, with the pinned toolchain.
- The site stays static. No server code, no uploads, no database.
- The existing flow after the ROM bytes are in memory (`rom-config.js`
  seed injection, `game-link.js`, `daily.js` stats) does not change.

## Components

### 1. Patch build: `scripts/make-patch.sh` (new)

Turns the built Daily Red ROM into BPS patches against vanilla FireRed.

- Inputs: `pokefirered/pokefirered_modern.gba` (from `build-rom.sh`) and the
  vanilla base ROMs.
- Base ROMs:
  - **Rev 1**: path given by `FIRERED_REV1` (the user's dump). Must have
    SHA-1 `dd5945db9b930750cb39d00c84da8571feebf417`.
  - **1.0**: built byte-exact by pret's matching build (agbcc) of the same
    pinned commit. Must have SHA-1
    `41cb23d8dccc8ebd7c649cd8fbb58eeace6e2fdc`; the script fails otherwise.
- Outputs: `web/game/dailyred-firered-1.0.bps` and
  `web/game/dailyred-firered-rev1.bps`, plus `web/game/patches.json`
  mapping base SHA-1 → patch file and the expected output CRC32.
- The script deletes any `web/game/*.gba*` and `web/game/red.png` so that a
  ROM cannot be deployed by accident.
- Patch creation uses a pinned BPS creator that supports relocated source
  copies (`flips --create --bps-delta`), so moved graphics/music are copied
  from the player's ROM instead of being stored in the patch.

`build-rom.sh` stops writing `web/game/dailyred.gba.gz` and `red.png`.

### 2. BPS applier: `web/bps.js` (new)

`applyBps(source: Uint8Array, patch: Uint8Array): Uint8Array`

- Implements the BPS format (SourceRead, TargetRead, SourceCopy, TargetCopy).
- Verifies the source CRC32, target CRC32 and patch CRC32 from the patch
  footer; throws a descriptive error on any mismatch.
- No dependencies.

### 3. ROM intake: `web/rom-store.js` (new) + UI

- `identifyRom(bytes)` → `'1.0' | 'rev1' | null` by SHA-1 (`crypto.subtle`).
  Headered/trimmed/zipped files are not accepted.
- `saveRom(bytes)`, `loadRom()`, `forgetRom()` keep the **original** ROM in
  IndexedDB (database `dailyred`, store `rom`). Storing the original rather
  than the patched result means a site update never needs a re-upload. If
  IndexedDB is unavailable, the ROM is held for the session only.
- UI (in `index.html`/`app.js`/`style.css`): when no ROM is stored, the Play
  area shows "Load your Pokémon FireRed ROM (English, 1.0 or Rev 1)" with a
  file picker and drag-and-drop. Errors appear inline. A small "Forget my
  ROM" link appears once a ROM is stored.

### 4. Game files: `web/game-files.js` (changed)

`loadGameFiles()` keeps its signature and return shape. Instead of fetching
`game/dailyred.gba.gz`, it loads the stored ROM, fetches `patches.json` and
the matching `.bps`, and returns `applyBps(rom, patch)` as `rom`. Progress
reporting covers the patch and emulator core downloads.

### 5. Content cleanup

- Remove the RED sprite `<img>` from the title card (it came from the decomp
  graphics).
- README: hosting section rewritten for the bring-your-own-ROM model, and a
  note that players need their own FireRed (USA/Europe 1.0 or Rev 1).
- Footer: same one-line note.

### 6. Linux toolchain: `scripts/setup-linux.sh` (new)

Same pinned xPack arm-none-eabi-gcc 14.2.1 as `setup-macos.sh`, linux-x64
build, into `.toolchain/`; uses system libpng. No sudo. Plus agbcc for the
matching 1.0 build. `build-rom.sh` gets the Linux CPU count path (already
falls back to `nproc`).

## Error handling

| Situation | Behaviour |
|---|---|
| Wrong file (other game, language, hack, zip, headered) | Rejected before storing: "This isn't English Pokémon FireRed 1.0 or Rev 1." |
| Patch download fails | Existing download error path ("Couldn't download …") with retry. |
| CRC mismatch while patching | Error shown, stored ROM kept; "Forget my ROM" offered. |
| IndexedDB blocked (private mode) | ROM kept in memory for the visit; player re-loads it next time. |

## Testing

- **Unit (Node):** `applyBps` on the real patches reproduces
  `pokefirered_modern.gba` byte for byte from each base ROM; a corrupted
  patch and a wrong source both throw.
- **Browser (existing headless suite):** the tests load the Rev 1 ROM through
  the file input (path from `FIRERED_REV1`) instead of relying on a served
  ROM, then run the existing smoke/party/site checks unchanged. Added cases:
  wrong-file rejection, ROM remembered across reloads, "Forget my ROM".
- **Deploy check:** `web/` contains no `*.gba*` and no `red.png`; after
  deploy, `https://red.tatd.at/game/` lists only `.bps`/`patches.json`, and a
  full daily battle starts in a real browser.

## Deployment (fountain)

Follows the three existing sites on fountain:

- Build on magnus; `rsync` `web/` to `fountain:~/sites/dailyred/web`.
- `~/.config/systemd/user/dailyred.service`: `node serve.mjs 8030`, serving
  that directory. `serve.mjs` gains a `HOST` env var (default unchanged) so
  the service binds `127.0.0.1` only.
- Tunnel: `cloudflared tunnel create dailyred`,
  `cloudflared tunnel route dns dailyred red.tatd.at`, `~/.cloudflared/red.yml`
  (ingress `red.tatd.at → http://127.0.0.1:8030`, else 404), and
  `red-tunnel.service` matching `chess-tunnel.service`.

## Out of scope

Pushing to GitHub, LeafGreen or non-English ROMs, zipped uploads, server-side
stats.
