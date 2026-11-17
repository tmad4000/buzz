"""Source boundaries: explicit intent, real provenance, retained metadata only."""
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from worklog_client import DM, OPS, JACOB, ROOT
from worklog_source import export, provenance, rows_for


def event(n, author=JACOB, kind=9, parent=None, content='BODY_CANARY', at=100):
    tags = [['h', DM]]
    if parent:
        tags.append(['e', parent, '', 'reply'] if kind == 9 else ['e', parent])
    return dict(id=f'{n:064x}', pubkey=author, kind=kind, created_at=at, tags=tags, content=content)


class SourceTests(unittest.TestCase):
    def setUp(self):
        self.ask = event(1)
        self.reply = event(2, ROOT, parent=self.ask['id'])
        self.classes = {self.ask['id']: {'kind': 'ask', 'reviewed_by': 'root', 'title': 'Vetted request'}}

    def test_only_explicit_requests_and_verified_root_replies_are_exported(self):
        unknown = event(3)
        auto = event(4, ROOT, parent=self.ask['id'])
        rows = rows_for([self.ask, self.reply, unknown, auto], self.classes, {}, {self.reply['id']})
        self.assertEqual([r['kind'] for r in rows], ['ask', 'reply'])
        self.assertEqual(rows[1]['parent_id'], self.ask['id'])
        self.assertEqual(rows[1]['thread_id'], self.ask['id'])
        self.assertNotIn('CANARY', json.dumps(rows))

    def test_root_only_marker_is_top_level_and_queries_are_not_asks(self):
        self.ask['tags'].append(['e', 'f' * 64, '', 'root'])
        self.classes[self.ask['id']]['kind'] = 'query'
        row = rows_for([self.ask], self.classes, {}, set())[0]
        self.assertEqual((row['kind'], row['parent_id'], row['thread_id']), ('query', None, self.ask['id']))

    def test_reaction_requires_matching_root_provenance_and_real_time(self):
        reaction = event(3, ROOT, 7, self.ask['id'], '✅', 110)
        for proof in [('done', 111, 'listener'), ('progress', 111, 'root'), ('done', 500, 'root')]:
            rows = rows_for([self.ask, reaction], self.classes, {self.ask['id']: proof}, set())
            self.assertEqual(len(rows), 1)
        rows = rows_for([self.ask, reaction], self.classes, {reaction['id']: 'done'}, set())
        self.assertEqual(rows[-1]['status'], 'done')
        self.assertEqual(rows[-1]['event_id'], reaction['id'])

    def test_edits_export_revision_identity_without_content(self):
        edit = event(3, JACOB, 40003, self.ask['id'], at=120)
        rows = rows_for([self.ask, edit], self.classes, {}, set())
        self.assertEqual(rows[-1]['kind'], 'revision')
        self.assertEqual(rows[-1]['target_event_id'], self.ask['id'])
        self.assertEqual(rows[-1]['at'], '1970-01-01T00:02:00Z')
        self.assertNotIn('CANARY', json.dumps(rows))
        edit['pubkey'] = ROOT
        self.assertEqual(len(rows_for([self.ask, edit], self.classes, {}, set())), 1)

    def test_missing_ancestry_is_not_fabricated_and_cycles_fail(self):
        self.ask['tags'].append(['e', 'f' * 64, '', 'reply'])
        self.assertEqual(rows_for([self.ask], self.classes, {}, set()), [])
        self.ask['tags'][-1][1] = self.reply['id']
        with self.assertRaises(ValueError): rows_for([self.ask, self.reply], self.classes, {}, set())

    def test_read_only_provenance_does_not_open_raw_prompt_columns(self):
        with tempfile.TemporaryDirectory() as temporary:
            file = Path(temporary) / 'source.sqlite3'
            connection = sqlite3.connect(file)
            connection.executescript('CREATE TABLE thread_status(root,state,changed,source); CREATE TABLE replies(event_id,source,status,body);')
            connection.execute('INSERT INTO thread_status VALUES(?,?,?,?)', (self.ask['id'], 'progress', 105, 'root'))
            connection.execute('INSERT INTO replies VALUES(?,?,?,?)', (self.reply['id'], 'root', 'verified', 'RAW_CANARY'))
            connection.commit(); connection.close()
            before = file.read_bytes()
            states, replies = provenance(file)
            self.assertEqual(states, {})
            self.assertEqual(replies, {self.reply['id']})
            self.assertEqual(before, file.read_bytes())
            self.assertNotIn('CANARY', repr((states, replies)))

    def test_atomic_export_retains_previous_rows_and_failure_keeps_last_good(self):
        class API:
            rows = []
            fail = False
            def members(inner, channel): pass
            def auxiliary(inner, messages, until): return []
            def history(inner, channel, **kw):
                if inner.fail: raise RuntimeError('transport')
                return inner.rows if channel == DM else []
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            classes = directory / 'classes.json'
            classes.write_text(json.dumps({'v': 1, 'entries': self.classes}))
            api = API(); api.rows = [self.ask, self.reply]
            with patch('worklog_source.provenance', return_value=({}, {self.reply['id']})):
                export(api, directory, classes, 'unused', 200)
                before = (directory / 'events.jsonl').read_bytes()
                api.rows = [self.ask]
                export(api, directory, classes, 'unused', 201)
                self.assertEqual(before.splitlines()[1:], (directory / 'events.jsonl').read_bytes().splitlines()[1:])
                before = (directory / 'events.jsonl').read_bytes()
                api.fail = True
                with self.assertRaises(RuntimeError): export(api, directory, classes, 'unused', 202)
                self.assertEqual(before, (directory / 'events.jsonl').read_bytes())
                self.assertNotIn(b'CANARY', before)


if __name__ == '__main__': unittest.main()
