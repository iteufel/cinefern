#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
player="${1:-avkit}"
case "$player" in
  avkit) container=(-project native/Cinefern.xcodeproj) ;;
  vlc) container=(-workspace native/CinefernVLC.xcworkspace) ;;
  *) echo 'Usage: npm run apple:build -- [avkit|vlc]' >&2; exit 2 ;;
esac
build_root="${CINEFERN_BUILD_ROOT:-$PWD/native/.build/xcode-$player}"
mkdir -p "$build_root"
for entry in 'iOS|iOS' 'macOS|macOS' 'tvOS|tvOS'; do
  scheme="Cinefern-${entry%%|*}"
  platform="${entry##*|}"
  xcodebuild "${container[@]}" -scheme "$scheme" -configuration Debug \
    -destination "generic/platform=$platform" -derivedDataPath "$build_root/$platform" \
    CODE_SIGNING_ALLOWED=NO build > "$build_root/$platform.log" 2>&1 || {
      tail -n 70 "$build_root/$platform.log" >&2
      exit 1
    }
  echo "$scheme ($player): BUILD SUCCEEDED"
done
