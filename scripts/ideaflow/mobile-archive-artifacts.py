#!/usr/bin/env python3
"""Constrain release artifacts and reconcile one Xcode-generated duplicate lock."""
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import time

ARCHIVES = Path('mobile/build/ios/archive')
TRACKED_LOCK = Path('mobile/ios/Runner.xcworkspace/xcshareddata/swiftpm/Package.resolved')
GENERATED_LOCK = Path('mobile/ios/Runner.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved')
MAX_LOCK_BYTES = 1024 * 1024


def scoped_path(root, relative):
    """Reject symlinks and non-directory ancestors, including ignored build paths."""
    root = Path(root).resolve(strict=True)
    relative = Path(relative)
    if relative.is_absolute() or '..' in relative.parts:
        raise ValueError('Artifact path must be relative to its checkout')
    path = root
    for index, name in enumerate(relative.parts):
        path = path / name
        if path.is_symlink():
            raise ValueError('Symlink in artifact path: ' + str(relative))
        if path.exists() and index < len(relative.parts) - 1 and not path.is_dir():
            raise ValueError('Non-directory artifact ancestor')
    if not path.resolve().is_relative_to(root):
        raise ValueError('Artifact path escapes checkout')
    return path


def private_release(release):
    """Evidence must reside in an existing private, non-symlink directory."""
    release = Path(release)
    if not release.is_absolute():
        raise ValueError('Release evidence path must be absolute')
    scoped_path(Path(release.anchor), Path(*release.parts[1:]))
    mode = release.stat().st_mode
    if not stat.S_ISDIR(mode) or stat.S_IMODE(mode) & 0o077:
        raise ValueError('Release evidence directory must be private')
    return release


def private_write(release, name, data):
    """Exclusively create and sync exact evidence bytes before any cleanup."""
    destination = private_release(release) / name
    fd = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'wb') as output:
        output.write(data)
        output.flush()
        os.fsync(output.fileno())
    if destination.read_bytes() != data:
        raise ValueError('Release evidence readback mismatch')
    directory = os.open(release, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(directory)
    finally:
        os.close(directory)


def fingerprint(info):
    """Bind archive freshness to its regular Info.plist, not just a directory mtime."""
    value = info.lstat()
    if not stat.S_ISREG(value.st_mode) or value.st_nlink != 1:
        raise ValueError('Archive Info.plist must be a regular private file')
    return [value.st_dev, value.st_ino, value.st_size, value.st_mtime_ns, value.st_ctime_ns]


def archive_entries(root):
    """Enumerate only direct archive children under this checkout's build tree."""
    directory = scoped_path(root, ARCHIVES)
    if not directory.exists():
        return {}
    if not directory.is_dir():
        raise ValueError('Archive root must be a directory')
    entries = {}
    for archive in sorted(directory.glob('*.xcarchive')):
        scoped_path(root, archive.relative_to(root))
        if not archive.is_dir():
            raise ValueError('Archive candidate must be a directory')
        info = scoped_path(root, (archive / 'Info.plist').relative_to(root))
        entries[archive.name] = fingerprint(info)
    return entries


def prepare_archive(root, release):
    """Record the pre-build frontier without deleting any previous archive."""
    root = Path(root).resolve(strict=True)
    release = private_release(release)
    before = archive_entries(root)
    receipt = {'v': 1, 'sourceRoot': str(root), 'archiveRoot': str(ARCHIVES),
               'startedNs': time.time_ns(), 'before': before}
    private_write(release, 'archive-start.json', json.dumps(receipt, indent=2).encode())
    return receipt


def select_archive(root, release):
    """Choose exactly one post-frontier archive; stale/ambiguous output is an error."""
    root = Path(root).resolve(strict=True)
    release = private_release(release)
    start_path = scoped_path(release, 'archive-start.json')
    start = json.loads(start_path.read_text())
    if (start.get('v') != 1 or start.get('sourceRoot') != str(root) or
            start.get('archiveRoot') != str(ARCHIVES) or
            not isinstance(start.get('startedNs'), int) or
            not isinstance(start.get('before'), dict)):
        raise ValueError('Archive frontier does not match this checkout')
    now = time.time_ns()
    fresh = []
    for name, after in archive_entries(root).items():
        if start['startedNs'] <= after[3] <= now and after != start['before'].get(name):
            fresh.append((name, after))
    if len(fresh) != 1:
        raise ValueError('Expected exactly one fresh xcarchive; found ' + str(len(fresh)))
    name, value = fresh[0]
    path = scoped_path(root, ARCHIVES / name)
    receipt = {'v': 1, 'archive': str(path), 'startedNs': start['startedNs'], 'infoFingerprint': value}
    private_write(release, 'archive-selected.json', json.dumps(receipt, indent=2).encode())
    return path


def git(root, *arguments):
    """Run repository-local metadata queries without writing Git state."""
    return subprocess.check_output(['git', '-C', str(root), *arguments])


def lock_document(raw):
    """Validate SwiftPM v3 structure; originHash is the only comparison exception."""
    if len(raw) > MAX_LOCK_BYTES:
        raise ValueError('SwiftPM lock exceeds evidence bound')
    def unique_object(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError('Duplicate JSON field in SwiftPM lock')
            result[key] = value
        return result
    value = json.loads(raw, object_pairs_hook=unique_object)
    if (not isinstance(value, dict) or set(value) != {'version', 'originHash', 'pins'} or
            type(value['version']) is not int or value['version'] != 3 or not isinstance(value['originHash'], str) or
            len(value['originHash']) != 64 or any(c not in '0123456789abcdef' for c in value['originHash']) or
            not isinstance(value['pins'], list) or not value['pins']):
        raise ValueError('Unexpected SwiftPM lock structure')
    identities = []
    for pin in value['pins']:
        if not isinstance(pin, dict) or not isinstance(pin.get('identity'), str):
            raise ValueError('Invalid SwiftPM pin')
        identities.append(pin['identity'])
    if len(identities) != len(set(identities)):
        raise ValueError('Duplicate SwiftPM pin identity')
    return value


def open_generated_parent(root):
    """Open every generated-lock ancestor without following symlinks."""
    directory = os.open(root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        for component in GENERATED_LOCK.parts[:-1]:
            child = os.open(component, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=directory)
            os.close(directory)
            directory = child
        return directory
    except BaseException:
        os.close(directory)
        raise


def reconcile_generated_lock(root, release):
    """Archive and remove only an untracked exact-pin duplicate of the committed lock."""
    root = Path(root).resolve(strict=True)
    release = private_release(release)
    tracked_path = scoped_path(root, TRACKED_LOCK)
    committed = git(root, 'show', 'HEAD:' + TRACKED_LOCK.as_posix())
    if git(root, 'ls-files', '-z', '--', TRACKED_LOCK.as_posix()) != os.fsencode(TRACKED_LOCK) + b'\0':
        raise ValueError('Canonical workspace lock must be tracked')
    if tracked_path.read_bytes() != committed:
        raise ValueError('Canonical workspace lock differs from commit')
    expected = lock_document(committed)
    generated = scoped_path(root, GENERATED_LOCK)
    if not generated.exists():
        return {'generatedLockPresent': False, 'removed': False}
    if git(root, 'ls-files', '-z', '--', GENERATED_LOCK.as_posix()):
        raise ValueError('Generated lock is tracked; refusing cleanup')
    if git(root, 'ls-files', '--others', '--exclude-standard', '-z', '--', GENERATED_LOCK.as_posix()) != os.fsencode(GENERATED_LOCK) + b'\0':
        raise ValueError('Generated lock must be the exact visible untracked path')
    directory = open_generated_parent(root)
    try:
        name = GENERATED_LOCK.name
        fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=directory)
        with os.fdopen(fd, 'rb') as source:
            original = os.fstat(source.fileno())
            if not stat.S_ISREG(original.st_mode) or original.st_nlink != 1:
                raise ValueError('Generated lock must be a regular unlinked file')
            raw = source.read(MAX_LOCK_BYTES + 1)
        actual = lock_document(raw)
        if {k: v for k, v in actual.items() if k != 'originHash'} != {k: v for k, v in expected.items() if k != 'originHash'}:
            raise ValueError('Generated SwiftPM pins differ from committed workspace lock')
        private_write(release, 'generated-project-Package.resolved', raw)
        current = os.stat(name, dir_fd=directory, follow_symlinks=False)
        if (current.st_dev, current.st_ino, current.st_size, current.st_mtime_ns, current.st_ctime_ns) != (original.st_dev, original.st_ino, original.st_size, original.st_mtime_ns, original.st_ctime_ns):
            raise ValueError('Generated lock changed during evidence capture')
        os.unlink(name, dir_fd=directory)
        os.fsync(directory)
    finally:
        os.close(directory)
    receipt = {'generatedLockPresent': True, 'removed': True, 'path': GENERATED_LOCK.as_posix(),
               'pinsMatchCommittedLock': True, 'generatedSHA256': hashlib.sha256(raw).hexdigest(),
               'trackedSHA256': hashlib.sha256(committed).hexdigest(),
               'originHashChanged': actual['originHash'] != expected['originHash']}
    private_write(release, 'generated-swiftpm-lock-reconciled.json', json.dumps(receipt, indent=2).encode())
    return receipt


if __name__ == '__main__':
    if len(sys.argv) != 4 or sys.argv[1] not in {'prepare', 'select', 'reconcile-lock'}:
        raise SystemExit('Usage: mobile-archive-artifacts.py prepare|select|reconcile-lock CHECKOUT RELEASE_DIR')
    command, root, release = sys.argv[1:]
    result = {'prepare': prepare_archive, 'select': select_archive, 'reconcile-lock': reconcile_generated_lock}[command](root, release)
    print(str(result) if command == 'select' else json.dumps(result, indent=2))
