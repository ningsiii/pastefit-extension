#!/bin/zsh
# Reuse the exact current Chrome icon; never the historical logo master.
set -eu
cd "${0:A:h}/../.."
ICON_OUTPUT="${1:?Usage: build-icon.sh OUTPUT.icns}"
ICON_WORK="$(mktemp -d /tmp/pastefit-icon.XXXXXX)"
trap 'rm -rf "$ICON_WORK"' EXIT
mkdir -p "$ICON_WORK/PasteFit.iconset" "${ICON_OUTPUT:h}"
for ICON_SIZE in 16 32 64 128 256 512; do
  sips -z "$ICON_SIZE" "$ICON_SIZE" public/icons/icon128.png --out "$ICON_WORK/PasteFit.iconset/icon_${ICON_SIZE}x${ICON_SIZE}.png" >/dev/null
  ICON_RETINA=$((ICON_SIZE * 2))
  sips -z "$ICON_RETINA" "$ICON_RETINA" public/icons/icon128.png --out "$ICON_WORK/PasteFit.iconset/icon_${ICON_SIZE}x${ICON_SIZE}@2x.png" >/dev/null
done
# 64px is used as 32px@2x; omit a nonstandard standalone 64px pair.
rm "$ICON_WORK/PasteFit.iconset/icon_64x64.png" "$ICON_WORK/PasteFit.iconset/icon_64x64@2x.png"
iconutil --convert icns "$ICON_WORK/PasteFit.iconset" --output "$ICON_OUTPUT"
