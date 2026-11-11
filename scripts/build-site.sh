#!/bin/sh
# Builds the retired PWA's replacement: a static "Ahoy moved to the app" page
# for the old PWA's Vercel project (vercel.json at the repo root runs this).
# /privacy and /support are copies of the links/ site's pages so the old
# domain keeps serving them without a hard-coded redirect target; style.css
# and site-config.js (store links, links domain) come from links/ too, so
# there is one place to edit.
set -eu
cd "$(dirname "$0")/.."
rm -rf dist
mkdir -p dist
cp -R site/. dist/
for f in privacy.html support.html style.css site-config.js; do
  cp "links/$f" "dist/$f"
done
echo "built dist/: $(find dist -type f | wc -l | tr -d ' ') files"
