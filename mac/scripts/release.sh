#!/bin/bash
# Builds a signed release zip and publishes it on GitHub Releases (the app updates itself from there).
# Usage: BOCOLEN_SIGN_IDENTITY="Otis Self Signed" mac/scripts/release.sh 1.0.1 "What changed"
# Always sign with the SAME identity: the app only installs updates signed like itself, and macOS
# keeps the Accessibility / Screen Recording / Microphone permissions only for the same signer.
set -euo pipefail
MAC="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="${1:?usage: release.sh <version> [notes]}"
NOTES="${2:-Bo co len $VERSION}"
IDENTITY="${BOCOLEN_SIGN_IDENTITY:?Set BOCOLEN_SIGN_IDENTITY to your code signing identity}"
REPO="leminhhieu98py/bo-teo-pte"
ZIP="$MAC/dist/BoCoLen-$VERSION.zip"

echo "$VERSION" > "$MAC/VERSION"
"$MAC/scripts/build-app.sh" "$VERSION" "$IDENTITY"
rm -f "$ZIP"
(cd "$MAC/dist" && ditto -c -k --sequesterRsrc --keepParent "Bo cố lên.app" "$ZIP")
echo "Release zip: $ZIP"

LOGIN="$(gh api user -q .login 2>/dev/null || true)"
if [ "$LOGIN" != "leminhhieu98py" ]; then
  echo "gh is logged in as '${LOGIN:-nobody}', not leminhhieu98py. Publish it yourself:"
  echo "  gh auth login   (choose github.com, account leminhhieu98py)"
  echo "  gh release create v$VERSION \"$ZIP\" --repo $REPO --title \"Bo co len $VERSION\" --notes \"$NOTES\""
  exit 0
fi
gh release create "v$VERSION" "$ZIP" --repo "$REPO" --title "Bo co len $VERSION" --notes "$NOTES"
