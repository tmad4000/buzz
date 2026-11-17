#!/usr/bin/env bash
# Native release entry point: capture provenance before Flutter packages assets.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
build_name=""
previous=""
for argument in "$@"; do
  if [[ "$previous" == "--build-name" ]]; then build_name="$argument"; fi
  case "$argument" in --build-name=*) build_name="${argument#--build-name=}" ;; esac
  previous="$argument"
done
node scripts/stamp-mobile.mjs "$build_name"
cd mobile
exec flutter build "$@"
