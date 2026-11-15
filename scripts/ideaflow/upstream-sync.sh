#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
python3 scripts/ideaflow/upstream-sync.py
# Fetch explicit upstream without trusting a pre-existing remote of that name.
git fetch https://github.com/block/buzz.git 'refs/tags/desktop-v*:refs/tags/desktop-v*'
printf 'Review the eligible release diff and lockfile changes on an isolated branch. No automatic merge or install.\n'
