#!/usr/bin/env python3
"""SIGKILL/reopen the production outbox in a task-owned Flutter test VM.

This verifies Linux Flutter test-runtime recovery, not an Android/iOS app build.
Run after other heavy checks; uses the existing Flutter SDK and no relay service.
"""
import argparse
import json
import os
from pathlib import Path
import signal
import subprocess
import tempfile
import time

parser = argparse.ArgumentParser()
parser.add_argument('--flutter', required=True)
parser.add_argument('--evidence', required=True)
args = parser.parse_args()
mobile = Path(__file__).resolve().parents[1]
evidence = Path(args.evidence)
evidence.mkdir(parents=True, exist_ok=True)
root = Path(tempfile.mkdtemp(prefix='mobile-outbox-restart-', dir=evidence))
command = [args.flutter, 'test', '--no-pub', '--concurrency=1',
           'test/features/channels/outbox/restart.fixture.dart']
env = {**os.environ, 'BUZZ_OUTBOX_RESTART_ROOT': str(root), 'BUZZ_OUTBOX_RESTART_PHASE': 'capture'}
with (root / 'capture.log').open('w') as output:
    child = subprocess.Popen(command, cwd=mobile, env=env, stdout=output,
                             stderr=subprocess.STDOUT, start_new_session=True)
    try:
        deadline = time.monotonic() + 90
        while not (root / 'ready.json').exists():
            if child.poll() is not None:
                raise RuntimeError(f'Capture exited early: {root / "capture.log"}')
            if time.monotonic() > deadline:
                raise TimeoutError('Capture did not reach pending upload')
            time.sleep(.1)
        ready = json.loads((root / 'ready.json').read_text())
        # The VM reports its own PID; verify its process group before killing
        # the task-owned group, never discover or terminate unrelated Flutter VMs.
        if os.getpgid(ready['pid']) != child.pid:
            raise RuntimeError('Flutter VM ownership mismatch')
        os.killpg(child.pid, signal.SIGKILL)
        child.wait(timeout=10)
    finally:
        if child.poll() is None:
            os.killpg(child.pid, signal.SIGTERM)
            child.wait(timeout=10)
env['BUZZ_OUTBOX_RESTART_PHASE'] = 'recover'
with (root / 'recover.log').open('w') as output:
    subprocess.run(command, cwd=mobile, env=env, stdout=output,
                   stderr=subprocess.STDOUT, check=True, timeout=90)
result = json.loads((root / 'recovered.json').read_text())
assert result['originalBytes'] == [9, 8, 7, 6]
assert result['capturedThread'] is True
print(json.dumps({'passed': True, 'evidence': str(root), **result}))
