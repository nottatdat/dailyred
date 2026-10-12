#!/usr/bin/env bash
# Turns the built Daily Red ROM into BPS patches against vanilla Pokémon FireRed,
# so the website never serves the game itself: players load their own ROM.
#
#   FIRERED_REV1=/path/to/firered-rev1.gba scripts/make-patch.sh
#
# FireRed 1.0 is built byte-exact from the same pinned pret/pokefirered commit
# with agbcc (no dump needed); Rev 1 comes from FIRERED_REV1. Both are checked
# against their known SHA-1 before any patch is made.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TC="$ROOT/.toolchain"
OUT="$ROOT/web/game"
BUILT="$ROOT/pokefirered/pokefirered_modern.gba"
SHA_10="41cb23d8dccc8ebd7c649cd8fbb58eeace6e2fdc"
SHA_REV1="dd5945db9b930750cb39d00c84da8571feebf417"
PRET_COMMIT="$(sed -n 's/^PRET_COMMIT="\(.*\)"/\1/p' "$ROOT/scripts/get-pokefirered.sh")"
JOBS="$(nproc 2>/dev/null || sysctl -n hw.ncpu)"

sha1() {
  if command -v sha1sum >/dev/null 2>&1; then sha1sum "$1" | cut -d' ' -f1
  else shasum "$1" | cut -d' ' -f1; fi
}
need() { [ -e "$1" ] || { echo "$2"; exit 1; }; }

need "$TC/bin/flips" "Flips missing. Run scripts/setup-linux.sh first."
need "$BUILT" "Daily Red ROM missing. Run scripts/build-rom.sh first."
[ -n "${FIRERED_REV1:-}" ] || { echo "Set FIRERED_REV1 to your FireRed (USA, Europe) Rev 1 ROM."; exit 1; }
[ "$(sha1 "$FIRERED_REV1")" = "$SHA_REV1" ] || { echo "FIRERED_REV1 isn't a clean FireRed Rev 1 (SHA-1 mismatch)."; exit 1; }

# --- Vanilla FireRed 1.0, built byte-exact ------------------------------------
VAN="$TC/vanilla"
if [ ! -f "$VAN/pokefirered.gba" ] || [ "$(sha1 "$VAN/pokefirered.gba")" != "$SHA_10" ]; then
  need "$TC/agbcc-src/install.sh" "agbcc missing. Run scripts/setup-linux.sh first."
  rm -rf "$VAN/src"
  mkdir -p "$VAN"
  git init -q "$VAN/src"
  git -C "$VAN/src" fetch -q --depth 1 https://github.com/pret/pokefirered.git "$PRET_COMMIT"
  git -C "$VAN/src" checkout -q FETCH_HEAD
  (cd "$TC/agbcc-src" && PATH="$TC/arm-none-eabi/bin:$PATH" ./install.sh "$VAN/src")
  PATH="$TC/arm-none-eabi/bin:$PATH" make -C "$VAN/src" -j"$JOBS" firered
  cp "$VAN/src/pokefirered.gba" "$VAN/pokefirered.gba"
fi
[ "$(sha1 "$VAN/pokefirered.gba")" = "$SHA_10" ] || { echo "Vanilla 1.0 build isn't byte-exact (SHA-1 mismatch)."; exit 1; }

# --- Patches -----------------------------------------------------------------
mkdir -p "$OUT"
rm -f "$OUT"/*.gba "$OUT"/*.gba.gz "$OUT"/red.png "$OUT"/*.bps
"$TC/bin/flips" --create --bps-delta "$VAN/pokefirered.gba" "$BUILT" "$OUT/dailyred-firered-1.0.bps"
"$TC/bin/flips" --create --bps-delta "$FIRERED_REV1" "$BUILT" "$OUT/dailyred-firered-rev1.bps"

size() { wc -c < "$1" | tr -d ' '; }
cat > "$OUT/patches.json" <<EOT
{
  "1.0": { "sha1": "$SHA_10", "patch": "dailyred-firered-1.0.bps", "bytes": $(size "$OUT/dailyred-firered-1.0.bps") },
  "rev1": { "sha1": "$SHA_REV1", "patch": "dailyred-firered-rev1.bps", "bytes": $(size "$OUT/dailyred-firered-rev1.bps") }
}
EOT
echo
ls -l "$OUT"
