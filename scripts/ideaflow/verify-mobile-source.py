#!/usr/bin/env python3
"""Verify a complete source manifest against a clean exact Git checkout."""
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys


def verify_source(root, revision, manifest_path):
    """Bind every tracked file's SHA256 and the manifest digest to the commit."""
    root = Path(root).resolve()
    manifest_path = Path(manifest_path).resolve()
    if not re.fullmatch(r'[0-9a-f]{40}', revision):
        raise ValueError('Expected exact source commit')
    def git(*args):
        return subprocess.check_output(['git', '-C', str(root), *args])
    if git('rev-parse', 'HEAD').decode().strip() != revision:
        raise ValueError('Checkout does not match release revision')
    tracked = set(git('ls-files', '-z').decode().split('\0')) - {''}
    manifest = json.loads(manifest_path.read_text())
    if not isinstance(manifest, dict) or not manifest or set(manifest) != tracked:
        raise ValueError('Manifest must cover the complete tracked tree')
    subprocess.run(['git', '-C', str(root), 'diff', '--quiet', '--exit-code', 'HEAD', '--'], check=True)
    if git('ls-files', '--others', '--exclude-standard'):
        raise ValueError('Untracked source must be removed before release')
    for name, expected in manifest.items():
        path = (root / name).resolve()
        if not path.is_relative_to(root) or not isinstance(expected, str) or not re.fullmatch(r'[0-9a-f]{64}', expected):
            raise ValueError('Invalid source manifest entry')
        if hashlib.sha256(path.read_bytes()).hexdigest() != expected:
            raise ValueError('Source differs from manifest: ' + name)
    return {'source': revision, 'trackedFiles': len(tracked),
            'sourceManifestSHA256': hashlib.sha256(manifest_path.read_bytes()).hexdigest()}


if __name__ == '__main__':
    if len(sys.argv) != 4:
        raise SystemExit('Usage: verify-mobile-source.py CHECKOUT COMMIT MANIFEST.json')
    print(json.dumps(verify_source(*sys.argv[1:]), indent=2))
