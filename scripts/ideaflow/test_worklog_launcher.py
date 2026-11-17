"""The installed symlink must resolve sibling helpers in its pinned release."""
import contextlib
import io
import json
from pathlib import Path
import runpy
import sys
import tempfile
import unittest
from unittest.mock import patch
from worklog_client import WORKLOG


class LauncherTests(unittest.TestCase):
    def test_symlink_finds_release_verifier_without_network_or_credentials(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            entry = Path(__file__).with_name('buzz-paseo').resolve()
            link = directory / 'buzz-paseo'
            link.symlink_to(entry)
            state = directory / 'state'
            state.mkdir()
            (state / 'config.json').write_text(json.dumps({'channel_id': WORKLOG, 'buzz_cli': '/synthetic/no-execution'}))
            captured = []
            def transport(executable, verifier):
                captured.append((executable, Path(verifier)))
                return object()
            with patch('worklog_client.Buzz', side_effect=transport), patch.object(sys, 'argv', [str(link), '--state-dir', str(state), 'worklog', 'list']), contextlib.redirect_stdout(io.StringIO()):
                runpy.run_path(str(link), run_name='__main__')
            self.assertEqual(captured, [('/synthetic/no-execution', entry.with_name('worklog_verify.mjs'))])
            self.assertTrue(captured[0][1].is_file())


if __name__ == '__main__': unittest.main()
