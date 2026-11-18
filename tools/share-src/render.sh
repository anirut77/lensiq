#!/bin/sh
# tools/share-src/render.sh — render the share images share/og-<category>.png (1200x630) from the SVG sources here.
# Licence-clean: shapes and the brand mark are LENSIQ's own; text is set in Prompt (SIL OFL 1.1, vendor/fonts/prompt/OFL.txt),
# converted from the self-hosted woff2 files. No photos, no images of people. Needs rsvg-convert (librsvg, built with
# Pango + fontconfig) and Python 3 with fonttools, brotli and pillow (in a throw-away venv).
#   sh tools/share-src/render.sh <python-with-fonttools-brotli-pillow> <scratch-dir>
set -eu
PY="$1"; TMP="$2"; HERE=$(cd "$(dirname "$0")" && pwd); REPO=$(cd "$HERE/../.." && pwd)
mkdir -p "$TMP/fonts" "$REPO/share"
for f in "$REPO"/vendor/fonts/prompt/prompt-400-*.woff2 "$REPO"/vendor/fonts/prompt/prompt-600-*.woff2 "$REPO"/vendor/fonts/prompt/prompt-700-*.woff2; do
  "$PY" -c 'import sys,os; from fontTools.ttLib import TTFont; t=TTFont(sys.argv[1]); t.flavor=None; t.save(os.path.join(sys.argv[2], os.path.basename(sys.argv[1])[:-6]+".ttf"))' "$f" "$TMP/fonts"
done
printf '<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig><dir>%s</dir><cachedir>%s</cachedir></fontconfig>\n' "$TMP/fonts" "$TMP/fccache" > "$TMP/fonts.conf"
for c in home fortune; do
  # PANGOCAIRO_BACKEND=fc: use only the fonts above (on macOS the default CoreText backend would pick a system font)
  PANGOCAIRO_BACKEND=fc FONTCONFIG_FILE="$TMP/fonts.conf" rsvg-convert -w 1200 -h 630 "$HERE/og-$c.svg" -o "$TMP/og-$c.png"
  "$PY" -c 'import sys; from PIL import Image; Image.open(sys.argv[1]).convert("RGB").quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG).save(sys.argv[2], optimize=True)' "$TMP/og-$c.png" "$REPO/share/og-$c.png"
  echo "share/og-$c.png"
done
