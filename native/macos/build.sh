#!/bin/zsh
set -eu
cd "${0:A:h}/../.."
APP_DIR="${PASTEFIT_APP_DIR:-$PWD/release/task33/PasteFitBridge.app}"
mkdir -p "$APP_DIR/Contents/MacOS" "$APP_DIR/Contents/Resources"
native/macos/build-icon.sh "$APP_DIR/Contents/Resources/PasteFit.icns"
SOURCES=(native/macos/Setup.swift native/macos/NativePackage.swift native/macos/EquationVerification.swift native/macos/ClipboardRepresentations.swift native/macos/PagesBridge.swift native/macos/main.swift)
if [[ "${PASTEFIT_UNIVERSAL:-0}" == 1 ]]; then
  for TASK_ARCH in arm64 x86_64; do
    xcrun swiftc -target "$TASK_ARCH-apple-macos13.0" -module-cache-path /tmp/pastefit-task35-swift-cache "${SOURCES[@]}" -o "$APP_DIR/Contents/MacOS/PasteFitBridge-$TASK_ARCH"
  done
  xcrun lipo -create "$APP_DIR/Contents/MacOS/PasteFitBridge-arm64" "$APP_DIR/Contents/MacOS/PasteFitBridge-x86_64" -output "$APP_DIR/Contents/MacOS/PasteFitBridge"
  rm "$APP_DIR/Contents/MacOS/PasteFitBridge-arm64" "$APP_DIR/Contents/MacOS/PasteFitBridge-x86_64"
else
  xcrun swiftc -module-cache-path /tmp/pastefit-task35-swift-cache "${SOURCES[@]}" -o "$APP_DIR/Contents/MacOS/PasteFitBridge"
fi
cat > "$APP_DIR/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>com.pastefit.PagesBridge</string>
<key>CFBundleName</key><string>贴妥辅助程序</string>
<key>CFBundleDisplayName</key><string>贴妥辅助程序</string>
<key>CFBundleExecutable</key><string>PasteFitBridge</string>
<key>CFBundleIconFile</key><string>PasteFit.icns</string>
<key>CFBundleVersion</key><string>4</string><key>CFBundleShortVersionString</key><string>0.3.1</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>PasteFitAllowedExtensions</key><array><string>kghnclkimijdblhcpbbmpofjdclpghpn</string></array>
<key>LSUIElement</key><true/><key>NSHighResolutionCapable</key><true/>
<key>NSAppleEventsUsageDescription</key><string>仅在用户点击贴妥复制时，控制内部临时 Pages 文稿来生成可编辑公式剪贴板；不修改用户目标文稿。</string>
</dict></plist>
PLIST
python3 - "$APP_DIR/Contents/Info.plist" <<'PYCONFIG'
import json, os, plistlib, re, sys
from pathlib import Path
path=Path(sys.argv[1])
value=plistlib.loads(path.read_bytes())
ids=['kghnclkimijdblhcpbbmpofjdclpghpn', json.loads(Path('native/macos/test-extension.json').read_text())['id']]
if os.environ.get('PASTEFIT_EXTENSION_IDS'):
    ids=os.environ['PASTEFIT_EXTENSION_IDS'].split(',')
if not 1 <= len(ids) <= 8 or not all(re.fullmatch('[a-p]{32}', item) for item in ids):
    raise SystemExit('Invalid explicit extension IDs')
value['PasteFitAllowedExtensions']=list(dict.fromkeys(ids))
if os.environ.get('PASTEFIT_UNIVERSAL') == '1': value['LSMinimumSystemVersion']='13.0'
path.write_bytes(plistlib.dumps(value))
PYCONFIG
codesign --force --sign - "$APP_DIR"
printf '%s\n' "$APP_DIR"
