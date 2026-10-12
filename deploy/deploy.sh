#!/usr/bin/env bash
# Publishes web/ to fountain and (first time) sets up the service and tunnel.
#   deploy/deploy.sh [ssh-host]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST="${1:-fountain}"

# Refuse to publish game data.
if find "$ROOT/web" \( -iname '*.gba' -o -iname '*.gba.gz' -o -iname 'red.png' \) | grep -q .; then
  echo "web/ contains game data; refusing to deploy."; exit 1
fi
[ -f "$ROOT/web/game/patches.json" ] || { echo "Run scripts/make-patch.sh first."; exit 1; }
for f in mgba_libretro.wasm mgba_libretro.js; do
  [ -f "$ROOT/web/vendor/$f" ] || { echo "web/vendor/$f missing; refusing to deploy."; exit 1; }
done

ssh "$HOST" 'mkdir -p ~/sites/dailyred ~/.config/systemd/user'
rsync -a --delete "$ROOT/web/" "$HOST:sites/dailyred/web/"
rsync -a "$ROOT/scripts/serve.mjs" "$ROOT/deploy/red.yml.in" "$HOST:sites/dailyred/"
rsync -a "$ROOT/deploy/dailyred.service" "$ROOT/deploy/red-tunnel.service" "$HOST:.config/systemd/user/"

# fountain's login shell is fish, so run the remote part explicitly in bash.
ssh "$HOST" bash -s <<'REMOTE'
set -euo pipefail
CF=~/.local/bin/cloudflared
$CF tunnel list 2>/dev/null | awk '{print $2}' | grep -qx dailyred || $CF tunnel create dailyred
ID="$($CF tunnel list 2>/dev/null | awk '$2=="dailyred"{print $1}')"
sed -e "s|@TUNNEL_ID@|$ID|g" -e "s|@HOME@|$HOME|g" ~/sites/dailyred/red.yml.in > ~/.cloudflared/red.yml
# Pass red.yml explicitly: the default ~/.cloudflared/config.yml names another tunnel and would win.
if OUT="$($CF --config ~/.cloudflared/red.yml tunnel route dns "$ID" red.tatd.at 2>&1)"; then
  echo "$OUT"
else
  echo "$OUT"
  echo "$OUT" | grep -qiE 'already (exists|configured)' || { echo "route dns failed"; exit 1; }
fi
systemctl --user daemon-reload
systemctl --user enable --now dailyred.service red-tunnel.service
systemctl --user restart dailyred.service
systemctl --user --no-pager status dailyred.service red-tunnel.service | grep -E 'Active|Loaded'
REMOTE
