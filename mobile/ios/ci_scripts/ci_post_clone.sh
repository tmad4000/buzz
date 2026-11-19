#!/bin/bash
set -euo pipefail

repo="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$repo"
revision="$(git rev-parse HEAD)"
version="${BUZZ_CLOUD_MARKETING_VERSION:-0.1.0}"
build_number="${CI_BUILD_NUMBER:-${BUZZ_ONBOARDING_BUILD_NUMBER:-}}"
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ && "$build_number" =~ ^[1-9][0-9]*$ ]]
[[ "${CI_COMMIT:-$revision}" == "$revision" ]]

export FLUTTER_SUPPRESS_ANALYTICS=true DART_SUPPRESS_ANALYTICS=true
flutter="$repo/bin/flutter"
"$flutter" --no-version-check --version --machine | python3 -c '
import json, sys
info = json.load(sys.stdin)
assert info["frameworkVersion"] == "3.41.7", info["frameworkVersion"]
assert info["frameworkRevision"] == "cc0734ac716fbb8b90f3f9db8020958b1553afa7"
'
expected_pods="$(sed -n 's/^COCOAPODS: //p' mobile/ios/Podfile.lock)"
actual_pods="$(pod --version)"
if [[ "$actual_pods" != "$expected_pods" ]]; then
  printf 'CocoaPods %s required by Podfile.lock, found %s\n' "$expected_pods" "$actual_pods" >&2
  exit 1
fi

# Use the existing fork identifiers with Xcode Cloud managed signing.
override=mobile/ios/Flutter/AppOverrides.xcconfig
if [[ -e "$override" ]]; then
  echo 'Existing AppOverrides found. Use a clean cloud or onboarding checkout.' >&2
  exit 1
fi
awk '!/^(BUZZ_CODE_SIGN_STYLE|CODE_SIGN_STYLE|CODE_SIGN_IDENTITY)([ =]|\[)/' \
  scripts/ideaflow/mobile-testflight.xcconfig > "$override"

cd mobile
"$flutter" --no-version-check pub get --enforce-lockfile
"$flutter" --no-version-check build ios --config-only --release --no-pub --no-codesign \
  --build-name="$version" --build-number="$build_number" \
  --dart-define=BUZZ_RELAY_URL=https://jprojects.communities.buzz.xyz \
  --dart-define=BUZZ_URL_SCHEME=buzz-ideaflow
(cd ios && pod install --deployment)
git diff --exit-code HEAD -- pubspec.lock ios/Podfile.lock
printf 'Buzz source %s, iOS %s (%s)\n' "$revision" "$version" "$build_number"
