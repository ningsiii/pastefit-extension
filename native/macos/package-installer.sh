#!/bin/zsh
# Standard Apple Installer owns payload installation; no postinstall code runs.
set -eu
cd "${0:A:h}/../.."
PKG_RELEASE="${PASTEFIT_PKG_RELEASE:-$PWD/release/task35}"
PKG_WORK="$PKG_RELEASE/pkg"
mkdir -p "$PKG_WORK/root/Applications" "$PKG_WORK/root/Library/Google/Chrome/NativeMessagingHosts" "$PKG_WORK/scripts"
PASTEFIT_UNIVERSAL=1 PASTEFIT_APP_DIR="$PKG_WORK/root/Applications/贴妥辅助程序.app" native/macos/build.sh
python3 - "$PKG_WORK" <<'PY'
import json, plistlib, sys
from pathlib import Path
work=Path(sys.argv[1])
info=plistlib.loads((work/'root/Applications/贴妥辅助程序.app/Contents/Info.plist').read_bytes())
manifest={'name':'com.pastefit.pages_bridge','description':'PasteFit local equation bridge','type':'stdio','path':'/Applications/贴妥辅助程序.app/Contents/MacOS/PasteFitBridge','allowed_origins':[f'chrome-extension://{id}/' for id in info['PasteFitAllowedExtensions']]}
(work/'root/Library/Google/Chrome/NativeMessagingHosts/com.pastefit.pages_bridge.json').write_text(json.dumps(manifest,indent=2)+'\n')
PY
cat > "$PKG_WORK/scripts/preinstall" <<'PRE'
#!/bin/sh
set -eu
app='/Applications/贴妥辅助程序.app'
host='/Library/Google/Chrome/NativeMessagingHosts/com.pastefit.pages_bridge.json'
# Refuse redirection/unknown existing applications or host configurations.
for parent in /Applications /Library/Google /Library/Google/Chrome /Library/Google/Chrome/NativeMessagingHosts; do
  if [ -L "$parent" ]; then exit 1; fi
done
if [ -e "$app" ] || [ -L "$app" ]; then
  [ ! -L "$app" ] && [ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$app/Contents/Info.plist")" = 'com.pastefit.PagesBridge' ] || exit 1
fi
if [ -e "$host" ] || [ -L "$host" ]; then
  [ ! -L "$host" ] && [ "$(/usr/bin/plutil -extract name raw -o - "$host")" = 'com.pastefit.pages_bridge' ] || exit 1
fi
exit 0
PRE
chmod 755 "$PKG_WORK/scripts/preinstall"
pkgbuild --analyze --root "$PKG_WORK/root" "$PKG_WORK/components.plist"
python3 - "$PKG_WORK/components.plist" <<'PY'
import plistlib,sys
from pathlib import Path
p=Path(sys.argv[1]); v=plistlib.loads(p.read_bytes())
for item in v:
 item['BundleIsRelocatable']=False
 item['BundleIsVersionChecked']=False
p.write_bytes(plistlib.dumps(v))
PY
pkgbuild --root "$PKG_WORK/root" --component-plist "$PKG_WORK/components.plist" --scripts "$PKG_WORK/scripts" --ownership recommended --install-location / --identifier com.pastefit.pagesbridge.installer --version 0.3.1 "$PKG_RELEASE/PasteFitBridge-mac-universal.pkg"
shasum -a 256 "$PKG_RELEASE/PasteFitBridge-mac-universal.pkg" > "$PKG_RELEASE/SHA256-PKG.txt"
