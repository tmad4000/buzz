"""Exercise production artifact safety and actual release-command arguments on Linux."""
import ast
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import plistlib
import re
import subprocess
import sys
import tempfile
import types
import unittest

sys.dont_write_bytecode = True
HERE = Path(__file__).parent


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, HERE / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


artifacts = load('archive_artifacts', 'mobile-archive-artifacts.py')
source_check = load('source_check', 'verify-mobile-source.py')


class ReleaseFixture(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='buzz-archive-test-')
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name)
        self.root = self.base / 'checkout'
        self.root.mkdir()
        self.release = self.base / 'release'
        self.release.mkdir(mode=0o700)

    def archive(self, name='Buzz.xcarchive'):
        directory = self.root / artifacts.ARCHIVES / name
        directory.mkdir(parents=True, exist_ok=True)
        (directory / 'Info.plist').write_bytes(plistlib.dumps({'fixture': name}))
        return directory

class ArchiveArtifactsTests(ReleaseFixture):
    def test_exactly_one_fresh_archive_and_private_selection_receipt(self):
        artifacts.prepare_archive(self.root, self.release)
        actual = self.archive()
        self.assertEqual(artifacts.select_archive(self.root, self.release), actual)
        receipt = json.loads((self.release / 'archive-selected.json').read_text())
        self.assertEqual(receipt['archive'], str(actual))
        self.assertEqual((self.release / 'archive-selected.json').stat().st_mode & 0o777, 0o600)

    def test_stale_runner_is_retained_and_only_new_buzz_selected(self):
        old = self.archive('Runner.xcarchive')
        artifacts.prepare_archive(self.root, self.release)
        actual = self.archive()
        self.assertEqual(artifacts.select_archive(self.root, self.release), actual)
        self.assertTrue(old.exists())

    def test_overwritten_existing_archive_is_fresh(self):
        actual = self.archive()
        artifacts.prepare_archive(self.root, self.release)
        (actual / 'Info.plist').write_bytes(plistlib.dumps({'fixture': 'rebuilt'}))
        self.assertEqual(artifacts.select_archive(self.root, self.release), actual)

    def test_no_new_archive_is_rejected_even_if_old_timestamp_is_future(self):
        old = self.archive()
        future = artifacts.time.time_ns() + 10_000_000_000
        os.utime(old / 'Info.plist', ns=(future, future))
        artifacts.prepare_archive(self.root, self.release)
        with self.assertRaisesRegex(ValueError, 'exactly one fresh'):
            artifacts.select_archive(self.root, self.release)

    def test_ambiguous_fresh_archives_are_rejected(self):
        artifacts.prepare_archive(self.root, self.release)
        self.archive('Buzz.xcarchive')
        self.archive('Other.xcarchive')
        with self.assertRaisesRegex(ValueError, 'found 2'):
            artifacts.select_archive(self.root, self.release)

    def test_checkout_frontier_cannot_be_reused_for_another_checkout(self):
        artifacts.prepare_archive(self.root, self.release)
        other = self.base / 'other'
        other.mkdir()
        with self.assertRaisesRegex(ValueError, 'does not match'):
            artifacts.select_archive(other, self.release)

    def test_archive_symlink_and_build_ancestor_escape_are_rejected(self):
        outside = self.base / 'outside'
        outside.mkdir()
        archive_dir = self.root / artifacts.ARCHIVES
        archive_dir.mkdir(parents=True)
        (archive_dir / 'Escape.xcarchive').symlink_to(outside, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, 'Symlink'):
            artifacts.prepare_archive(self.root, self.release)
        (archive_dir / 'Escape.xcarchive').unlink()
        (self.root / 'mobile/build/ios').rename(self.root / 'mobile/build/old-ios')
        (self.root / 'mobile/build/ios').symlink_to(outside, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, 'Symlink'):
            artifacts.prepare_archive(self.root, self.release)

    def test_archive_info_symlink_is_rejected(self):
        directory = self.archive()
        info = directory / 'Info.plist'
        info.unlink()
        outside = self.base / 'outside.plist'
        outside.write_bytes(b'outside')
        info.symlink_to(outside)
        with self.assertRaisesRegex(ValueError, 'Symlink'):
            artifacts.prepare_archive(self.root, self.release)

    def test_evidence_must_be_private_and_never_overwrites(self):
        self.release.chmod(0o755)
        with self.assertRaisesRegex(ValueError, 'private'):
            artifacts.prepare_archive(self.root, self.release)
        self.release.chmod(0o700)
        artifacts.prepare_archive(self.root, self.release)
        with self.assertRaises(FileExistsError):
            artifacts.prepare_archive(self.root, self.release)


class GeneratedLockTests(ReleaseFixture):
    def setUp(self):
        super().setUp()
        subprocess.run(['git', 'init', '-q', str(self.root)], check=True)
        self.canonical = self.root / artifacts.TRACKED_LOCK
        self.canonical.parent.mkdir(parents=True)
        # Use the actual tracked lock as the committed fixture authority.
        self.canonical.write_bytes((HERE.parent.parent / artifacts.TRACKED_LOCK).read_bytes())
        self.document = json.loads(self.canonical.read_text())
        self.generated = self.root / artifacts.GENERATED_LOCK
        self.generated.parent.mkdir(parents=True)
        self.commit()

    def commit(self):
        subprocess.run(['git', '-C', str(self.root), 'add', '.'], check=True)
        subprocess.run(['git', '-C', str(self.root), '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-q', '-s', '-m', 'Fixture'], check=True)

    def generate(self, change=None):
        value = json.loads(json.dumps(self.document))
        value['originHash'] = 'a' * 64
        if change:
            change(value)
        self.generated.write_text(json.dumps(value, indent=2))
        return self.generated.read_bytes()

    def test_matching_pins_are_archived_exactly_then_only_untracked_lock_removed(self):
        before = self.canonical.read_bytes()
        raw = self.generate()
        unrelated = self.generated.parent / 'keep-me.txt'
        unrelated.write_text('preserve')
        receipt = artifacts.reconcile_generated_lock(self.root, self.release)
        self.assertTrue(receipt['removed'])
        self.assertTrue(receipt['originHashChanged'])
        self.assertFalse(self.generated.exists())
        self.assertTrue(self.generated.parent.exists())
        self.assertEqual(unrelated.read_text(), 'preserve')
        self.assertEqual(self.canonical.read_bytes(), before)
        evidence = self.release / 'generated-project-Package.resolved'
        self.assertEqual(evidence.read_bytes(), raw)
        self.assertEqual(evidence.stat().st_mode & 0o777, 0o600)
        self.assertEqual(receipt['generatedSHA256'], hashlib.sha256(raw).hexdigest())

    def test_different_pin_revision_version_location_and_extra_pins_are_rejected(self):
        changes = [lambda d: d['pins'][0]['state'].update(revision='0' * 40),
                   lambda d: d['pins'][0]['state'].update(version='99.0.0'),
                   lambda d: d['pins'][0].update(location='https://different.invalid/repo'),
                   lambda d: d['pins'].append(dict(d['pins'][0], identity='extra'))]
        for change in changes:
            with self.subTest(change=change):
                raw = self.generate(change)
                with self.assertRaisesRegex(ValueError, 'pins differ'):
                    artifacts.reconcile_generated_lock(self.root, self.release)
                self.assertEqual(self.generated.read_bytes(), raw)
                self.assertFalse((self.release / 'generated-project-Package.resolved').exists())

    def test_dirty_canonical_and_tracked_generated_lock_are_rejected(self):
        self.generate()
        before = self.canonical.read_bytes()
        self.canonical.write_bytes(before + b'\n')
        with self.assertRaisesRegex(ValueError, 'differs from commit'):
            artifacts.reconcile_generated_lock(self.root, self.release)
        self.canonical.write_bytes(before)
        self.commit()
        with self.assertRaisesRegex(ValueError, 'is tracked'):
            artifacts.reconcile_generated_lock(self.root, self.release)
        self.assertTrue(self.generated.exists())

    def test_generated_symlink_hardlink_and_symlink_ancestor_are_rejected(self):
        self.generated.symlink_to(self.canonical)
        with self.assertRaisesRegex(ValueError, 'Symlink'):
            artifacts.reconcile_generated_lock(self.root, self.release)
        self.generated.unlink()
        os.link(self.canonical, self.generated)
        with self.assertRaisesRegex(ValueError, 'regular'):
            artifacts.reconcile_generated_lock(self.root, self.release)
        self.generated.unlink()
        self.generated.parent.rename(self.generated.parent.with_name('old-swiftpm'))
        self.generated.parent.symlink_to(self.canonical.parent, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, 'Symlink'):
            artifacts.reconcile_generated_lock(self.root, self.release)
        self.assertTrue(self.canonical.exists())

    def test_existing_evidence_prevents_removal(self):
        raw = self.generate()
        artifacts.private_write(self.release, 'generated-project-Package.resolved', b'prior evidence')
        with self.assertRaises(FileExistsError):
            artifacts.reconcile_generated_lock(self.root, self.release)
        self.assertEqual(self.generated.read_bytes(), raw)

    def test_no_generated_lock_is_a_noop_and_strict_source_checker_stays_strict(self):
        self.assertEqual(artifacts.reconcile_generated_lock(self.root, self.release), {'generatedLockPresent': False, 'removed': False})
        revision = subprocess.check_output(['git', '-C', str(self.root), 'rev-parse', 'HEAD'], text=True).strip()
        manifest = self.base / 'manifest.json'
        manifest.write_text(json.dumps({artifacts.TRACKED_LOCK.as_posix(): hashlib.sha256(self.canonical.read_bytes()).hexdigest()}))
        before = source_check.verify_source(self.root, revision, manifest)
        self.generate()
        with self.assertRaisesRegex(ValueError, 'Untracked source'):
            source_check.verify_source(self.root, revision, manifest)
        artifacts.reconcile_generated_lock(self.root, self.release)
        self.assertEqual(source_check.verify_source(self.root, revision, manifest), before)
        unrelated = self.root / 'unrelated-source.dart'
        unrelated.write_text('must still fail strict verification')
        with self.assertRaisesRegex(ValueError, 'Untracked source'):
            source_check.verify_source(self.root, revision, manifest)

    def test_duplicate_json_fields_and_unexpected_metadata_are_rejected(self):
        self.generate()
        raw = self.generated.read_text().replace('"version": 3', '"version": 3, "version": 3')
        self.generated.write_text(raw)
        with self.assertRaisesRegex(ValueError, 'Duplicate JSON'):
            artifacts.reconcile_generated_lock(self.root, self.release)
        self.generate(lambda d: d.update(extra='unexpected'))
        with self.assertRaisesRegex(ValueError, 'structure'):
            artifacts.reconcile_generated_lock(self.root, self.release)


class ActualRecipeCommandTests(unittest.TestCase):
    def test_actual_export_command_scopes_system_path_and_quotes_selected_archive(self):
        script = (HERE / 'mobile-archive.sh').read_text()
        command = re.search(r'^.*xcodebuild -exportArchive.*\\\n.*-exportPath.*$', script, re.MULTILINE).group()
        harness = 'xcodebuild() { printf "%s\\n" "$PATH"; printf "%s\\n" "$@"; }; archive_path="$1"; BUZZ_RELEASE_DIR="$2";\n' + command
        result = subprocess.run(['/bin/bash', '-c', harness, 'fixture', '/checkout with spaces/Buzz.xcarchive', '/private release'],
                                env={'PATH': '/fixture/hermit/bin:/usr/bin:/bin'}, check=True, text=True, capture_output=True)
        self.assertEqual(result.stdout.splitlines(), ['/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin',
            '-exportArchive', '-archivePath', '/checkout with spaces/Buzz.xcarchive', '-exportPath', '/private release/export',
            '-exportOptionsPlist', '/private release/ExportOptions.plist'])

    def test_actual_entitlements_call_requests_xml_and_uses_the_real_plist_parser(self):
        script = (HERE / 'mobile-archive.sh').read_text()
        validators = re.findall(r"python3 - <<'PY'\n(.*?)\nPY", script, re.DOTALL)
        tree = ast.parse(validators[-1])
        statement = next(node for node in ast.walk(tree) if isinstance(node, ast.Assign) and any(isinstance(target, ast.Name) and target.id == 'ent' for target in node.targets))
        expected = {'application-identifier': 'JESMXK96LG.app.ideaflow.buzz.mobile', 'get-task-allow': False}
        def codesign(arguments, **_):
            self.assertEqual(arguments[:3], ['codesign', '-d', '--entitlements'])
            return plistlib.dumps(expected) if arguments[3] == ':-' else b'[Dict]\n[Key] application-identifier'
        namespace = {'target': Path('fixture.app'), 'plistlib': plistlib,
                     'subprocess': types.SimpleNamespace(check_output=codesign, DEVNULL=subprocess.DEVNULL)}
        exec(compile(ast.fix_missing_locations(ast.Module(body=[statement], type_ignores=[])), 'actual-release-entitlement-call', 'exec'), namespace)
        self.assertEqual(namespace['ent'], expected)

    def test_actual_certificate_extraction_binds_optional_argument_to_its_option(self):
        script = (HERE / 'mobile-archive.sh').read_text()
        tree = ast.parse(re.findall(r"python3 - <<'PY'\n(.*?)\nPY", script, re.DOTALL)[-1])
        statement = next(node for node in ast.walk(tree) if isinstance(node, ast.Expr) and
            isinstance(node.value, ast.Call) and isinstance(node.value.func, ast.Attribute) and
            node.value.func.attr == 'run' and isinstance(node.value.args[0], ast.List) and
            any(isinstance(item, ast.BinOp) and isinstance(item.left, ast.Constant) and
                str(item.left.value).startswith('--extract-certificates') or
                isinstance(item, ast.Constant) and str(item.value).startswith('--extract-certificates')
                for item in node.value.args[0].elts))
        prefix = '/private evidence/certificate-0-'
        observed = []
        def codesign(arguments, **_):
            # The optional prefix must be attached; a separate argv is parsed
            # as another file by the actual codesign CLI (parent Mac evidence).
            if arguments != ['codesign', '-d', '--extract-certificates=' + prefix, 'fixture.app']:
                raise subprocess.CalledProcessError(1, arguments)
            observed.append(arguments)
        namespace = {'target': Path('fixture.app'), 'prefix': prefix,
                     'subprocess': types.SimpleNamespace(run=codesign, DEVNULL=subprocess.DEVNULL)}
        exec(compile(ast.fix_missing_locations(ast.Module(body=[statement], type_ignores=[])), 'actual-release-certificate-call', 'exec'), namespace)
        self.assertEqual(len(observed), 1)


if __name__ == '__main__':
    unittest.main()
