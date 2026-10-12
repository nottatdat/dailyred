#!/usr/bin/env bash
# Installs everything needed to build Daily Red and its patches on Linux x86_64,
# into ./.toolchain (no sudo). Needs: curl, git, make, a host C/C++ compiler,
# and libpng headers (the system libpng is used for pokefirered's gbagfx).
#
#   - xPack GNU Arm Embedded GCC (same pinned version as setup-macos.sh)
#   - pret/agbcc, for the byte-exact vanilla FireRed 1.0 build (make-patch.sh)
#   - Flips, to create the BPS patches
#
# Re-running is safe: finished steps are skipped.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TC="$ROOT/.toolchain"
mkdir -p "$TC/downloads" "$TC/bin"

GCC_VER="14.2.1-1.1"
AGBCC_COMMIT="da598c1d918402c42c0c0d7128ba14567f3175e9"
FLIPS_COMMIT="ff216a75df0987047a67d7923567dc4482ce07ac"

[ "$(uname -m)" = x86_64 ] || { echo "Unsupported CPU: $(uname -m)"; exit 1; }
pkg-config --exists libpng || { echo "libpng development files are required (e.g. pacman -S libpng)"; exit 1; }

# --- arm-none-eabi GCC --------------------------------------------------------
GCC_NAME="xpack-arm-none-eabi-gcc-$GCC_VER"
if [ ! -x "$TC/arm-none-eabi/bin/arm-none-eabi-gcc" ]; then
  tarball="$GCC_NAME-linux-x64.tar.gz"
  url="https://github.com/xpack-dev-tools/arm-none-eabi-gcc-xpack/releases/download/v$GCC_VER/$tarball"
  echo ">> Downloading $tarball"
  curl -fL --retry 3 -o "$TC/downloads/$tarball" "$url"
  curl -fsL -o "$TC/downloads/$tarball.sha" "$url.sha"
  expected="$(awk '{print $1}' "$TC/downloads/$tarball.sha")"
  actual="$(sha256sum "$TC/downloads/$tarball" | awk '{print $1}')"
  [ "$expected" = "$actual" ] || { echo "Checksum mismatch for $tarball"; exit 1; }
  tar -xzf "$TC/downloads/$tarball" -C "$TC"
  rm -f "$TC/arm-none-eabi" && ln -s "$GCC_NAME" "$TC/arm-none-eabi"
  rm -f "$TC/downloads/$tarball"
fi
"$TC/arm-none-eabi/bin/arm-none-eabi-gcc" --version | head -1
echo 'int f(void){return 0;}' | "$TC/arm-none-eabi/bin/arm-none-eabi-gcc" -x c -c -o /dev/null -

# --- agbcc (pret's GCC 2.95 fork, for the matching vanilla build) ------------
if [ ! -x "$TC/agbcc/bin/agbcc" ]; then
  src="$TC/downloads/agbcc"
  rm -rf "$src"
  git init -q "$src"
  git -C "$src" fetch -q --depth 1 https://github.com/pret/agbcc.git "$AGBCC_COMMIT"
  git -C "$src" checkout -q FETCH_HEAD
  # build.sh needs arm-none-eabi-as/ar on PATH
  (cd "$src" && PATH="$TC/arm-none-eabi/bin:$PATH" ./build.sh)
  mkdir -p "$TC/agbcc"
  cp -r "$src"/agbcc "$src"/old_agbcc "$src"/agbcc_arm "$TC/agbcc/" 2>/dev/null || true
  # install.sh copies into <pokefirered>/tools/agbcc; make-patch.sh runs it against
  # the vanilla checkout, so keep the built tree.
  rm -rf "$TC/agbcc-src" && mv "$src" "$TC/agbcc-src"
  mkdir -p "$TC/agbcc/bin" && ln -sf "$TC/agbcc-src/agbcc" "$TC/agbcc/bin/agbcc"
fi
echo ">> agbcc: $TC/agbcc-src"

# --- Flips ---------------------------------------------------------------------
if [ ! -x "$TC/bin/flips" ]; then
  src="$TC/downloads/flips"
  rm -rf "$src"
  git init -q "$src"
  git -C "$src" fetch -q --depth 1 https://github.com/Alcaro/Flips.git "$FLIPS_COMMIT"
  git -C "$src" checkout -q FETCH_HEAD
  make -C "$src" TARGET=cli
  cp "$src/flips" "$TC/bin/flips"
fi
"$TC/bin/flips" --version 2>/dev/null | head -1 || true

echo
echo "Toolchain ready. Build with: scripts/build-rom.sh && scripts/make-patch.sh"
