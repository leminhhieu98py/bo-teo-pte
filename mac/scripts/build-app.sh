#!/bin/bash
# Builds "mac/dist/Bo cố lên.app" from this repo.
# Usage: mac/scripts/build-app.sh [version] [signing identity]
#   version  defaults to mac/VERSION
#   identity defaults to $BOCOLEN_SIGN_IDENTITY, else "-" (ad-hoc: fine for testing, but the
#            app cannot update itself and macOS asks for permissions again after each build)
set -euo pipefail
MAC="$(cd "$(dirname "$0")/.." && pwd)"
ROOT="$(cd "$MAC/.." && pwd)"
VERSION="${1:-$(cat "$MAC/VERSION")}"
IDENTITY="${2:-${BOCOLEN_SIGN_IDENTITY:--}}"
APP="$MAC/dist/Bo cố lên.app"

echo "Building Bo co len $VERSION (signing: $IDENTITY)"
(cd "$MAC" && swift build -c release --arch arm64)

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/web"
cp "$MAC/.build/release/BoCoLen" "$APP/Contents/MacOS/BoCoLen"
cp "$MAC/AppIcon.icns" "$APP/Contents/Resources/AppIcon.icns"
# The same web pages as the Chrome extension, plus the Mac-only helpers in native/.
for dir in lib ui review history achievements options popup icons native; do
  rsync -a --exclude '.DS_Store' "$ROOT/$dir" "$APP/Contents/Resources/web/"
done

cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key><string>io.github.leminhhieu98py.bocolen</string>
  <key>CFBundleName</key><string>Bo cố lên</string>
  <key>CFBundleDisplayName</key><string>Bo cố lên</string>
  <key>CFBundleExecutable</key><string>BoCoLen</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>$VERSION</string>
  <key>CFBundleVersion</key><string>$VERSION</string>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSMicrophoneUsageDescription</key><string>Bo cố lên listens when you say a word, so Mochi can check your pronunciation.</string>
</dict>
</plist>
PLIST

codesign --force --sign "$IDENTITY" --identifier io.github.leminhhieu98py.bocolen --timestamp=none "$APP"
codesign --verify --strict "$APP"
echo "Built: $APP"
