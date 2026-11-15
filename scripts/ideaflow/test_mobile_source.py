"""Exercise the release helper's actual commit and coverage checks."""
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('mobile_source', Path(__file__).with_name('verify-mobile-source.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class SourceReceiptTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='buzz-mobile-source-')
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name) / 'source'
        self.root.mkdir()
        subprocess.run(['git', 'init', '-q', str(self.root)], check=True)
        self.files = {'main.dart': 'void main() {}\n', 'pubspec.lock': 'locked\n'}
        for name, data in self.files.items():
            (self.root / name).write_text(data)
        subprocess.run(['git', '-C', str(self.root), 'add', '.'], check=True)
        subprocess.run(['git', '-C', str(self.root), '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-q', '-s', '-m', 'Fixture'], check=True)
        self.revision = subprocess.check_output(['git', '-C', str(self.root), 'rev-parse', 'HEAD'], text=True).strip()
        self.manifest = Path(self.temporary.name) / 'manifest.json'
        self.data = {name: hashlib.sha256((self.root / name).read_bytes()).hexdigest() for name in self.files}
        self.write_manifest()

    def write_manifest(self):
        self.manifest.write_text(json.dumps(self.data))

    def verify(self, revision=None):
        return module.verify_source(self.root, revision or self.revision, self.manifest)

    def test_exact_source_and_manifest_digest(self):
        result = self.verify()
        self.assertEqual(result['trackedFiles'], 2)
        self.assertEqual(result['sourceManifestSHA256'], hashlib.sha256(self.manifest.read_bytes()).hexdigest())

    def test_wrong_commit_is_rejected(self):
        with self.assertRaises(ValueError): self.verify('0' * 40)

    def test_missing_tracked_file_is_rejected(self):
        del self.data['main.dart']; self.write_manifest()
        with self.assertRaises(ValueError): self.verify()

    def test_dirty_source_even_with_matching_manifest_is_rejected(self):
        (self.root / 'main.dart').write_text('changed\n')
        self.data['main.dart'] = hashlib.sha256((self.root / 'main.dart').read_bytes()).hexdigest()
        self.write_manifest()
        with self.assertRaises(subprocess.CalledProcessError): self.verify()

    def test_untracked_source_is_rejected(self):
        (self.root / 'extra.dart').write_text('extra\n')
        with self.assertRaises(ValueError): self.verify()

    def test_wrong_file_digest_is_rejected(self):
        self.data['main.dart'] = '0' * 64; self.write_manifest()
        with self.assertRaises(ValueError): self.verify()


if __name__ == '__main__': unittest.main()
