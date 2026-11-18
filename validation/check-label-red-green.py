"""Compare historical/stamp1 writer proposals with the production display-only path.
Runs only focused Node tests, each in a bounded isolated process group.
"""
from pathlib import Path
import os, signal, subprocess, tempfile
root = Path(__file__).resolve().parents[1]
desktop = root / 'desktop'
source = desktop / 'src/features/sidebar/lib'
test_source = (source / 'directAgentLabelConvergence.test.mjs').read_text()
old_source = subprocess.check_output(['git', 'show', '83d1462c1b1725090d01f068cf1014a165c4a98e:desktop/src/features/sidebar/lib/jacobChannelSectionDefaults.ts'], cwd=root, text=True)
def absolute_imports(text):
    for name in ['jacobChannelSectionDefaults', 'channelSectionsSync', 'sidebarLaneStore', 'sidebarLwwMap']:
        text = text.replace('"./' + name + '.ts"', '"' + str(source / (name + '.ts')) + '"')
        text = text.replace('"./' + name + '"', '"' + str(source / (name + '.ts')) + '"')
    return text
with tempfile.TemporaryDirectory(prefix='buzz-label-repro-') as temporary:
    folder = Path(temporary)
    for label, writer in [('historical', old_source), ('stamp1', old_source.replace('[0, "0000000000000001", "Direct agents"]', '[1, LEGACY_DEV, "Direct agents"]')), ('display', None)]:
        case = absolute_imports(test_source)
        if writer is not None:
            fixture = folder / (label + '.ts')
            fixture.write_text(absolute_imports(writer))
            case = 'import {upgradeDirectAgentsDefault} from "' + str(fixture) + '";\n' + case
            # Substitute only bootstrap's production writer; decoder, store, merge,
            # persistence/reload and all assertions stay identical.
            before = 'store.transact((tree) => mergeTrees(defaults, tree))'
            assert before in case, 'bootstrap substitution must match exactly'
            case = case.replace(before, 'store.transact((tree) => upgradeDirectAgentsDefault(mergeTrees(defaults, tree), defaults))')
        path = folder / (label + '.test.mjs')
        path.write_text(case)
        cmd = ['node', '--import', './test-loader.mjs', '--experimental-strip-types', '--test', str(path)]
        process = subprocess.Popen(cmd, cwd=desktop, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, start_new_session=True)
        try:
            output, _ = process.communicate(timeout=30)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            output, _ = process.communicate()
            raise RuntimeError(label + ' timed out')
        finally:
            try: os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError: pass
        log_folder = Path(tempfile.gettempdir()) / 'buzz-label-regression-20261118'
        log_folder.mkdir(exist_ok=True)
        log = log_folder / ('label-' + label + '.log')
        log.write_text(output)
        expected = process.returncode == 0 if writer is None else process.returncode != 0
        print(label, 'exit', process.returncode, 'expected', expected, 'log', log, flush=True)
        if writer is not None:
            assert 'legacy stamp1, arrivalafter' in output, 'red must include delayed legacy cache1 failure, not harness failure'
        assert expected, output
