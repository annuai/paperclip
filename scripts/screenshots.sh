#!/usr/bin/env bash
# Regenerates the README screenshots in docs/screenshots/ from the dev sandbox.
# Needs Google Chrome, ffmpeg, and the Vite dev server running: `npx vite --port 1420`.
set -euo pipefail
cd "$(dirname "$0")/.."

CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
URL="${URL:-http://localhost:1420/?sandbox&compare}"
BG="${BG:-5B6E86}"   # mid-tone, desktop-like: keeps light Zs and dark brows both visible
OUT=docs/screenshots
mkdir -p "$OUT"

for scene in quote water sleep jump dizzy; do
  "$CHROME" --headless=new --hide-scrollbars --force-device-scale-factor=2 \
    --window-size=680,390 --virtual-time-budget=3500 \
    --screenshot="$PWD/$OUT/$scene.png" "$URL&shot=$scene&bg=$BG" >/dev/null 2>&1
  case $scene in
    sleep|jump|dizzy) # no balloon: crop the empty sky above the character (jump needs headroom)
      if [ "$scene" = jump ]; then crop=1360:640:0:140; else crop=1360:520:0:260; fi
      ffmpeg -loglevel error -y -i "$OUT/$scene.png" -vf "crop=$crop" "$OUT/$scene.tmp.png" \
        && mv "$OUT/$scene.tmp.png" "$OUT/$scene.png" ;;
  esac
  echo "wrote $OUT/$scene.png"
done
