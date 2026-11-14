#!/bin/zsh
set -eu
cd "${0:A:h}/.."
native/macos/package-installer.sh
PASTEFIT_MAC_TEST_INSTALLER="$PWD/release/task35/PasteFitBridge-mac-universal.pkg" node scripts/build.mjs
ditto -c -k --sequesterRsrc --keepParent dist release/task35/PasteFit-Mac-Test.zip
printf '%s\n' 'Local test build only; do not submit this binary-bundled ZIP to the Chrome Web Store.'
