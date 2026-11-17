"""Exercise post/edit/recovery through the actual publisher, not a mirror."""
import copy
import tempfile
import time
import unittest
from pathlib import Path

from worklog_client import ROOT, WORKLOG
from worklog_posts import Posts, body, latest_content

OWNER = 'd3caa262-cdcd-454d-9d42-0cd05ac69156'


class Fake:
    def __init__(self):
        self.events, self.writes = {}, 0
        self.uncertain = False
        self.private = True

    def members(self, channel_id, expected=None):
        return None

    def event(self, eid, expected_channel):
        value = self.events[eid]
        assert ['h', expected_channel] in value['tags']
        return copy.deepcopy(value)

    def history(self, channel_id, since=0, until=None, kinds='9,40003'):
        return [copy.deepcopy(e) for e in self.events.values() if e['kind'] in {int(k) for k in kinds.split(',')}]

    def call(self, *args):
        if args[:2] == ('channels', 'list'):
            return [{'channel_id': WORKLOG}] if self.private else []
        self.writes += 1
        eid = f'{self.writes:064x}'
        event = dict(id=eid, pubkey=ROOT, kind=9 if args[1] == 'send' else 40003,
                     tags=[['h', WORKLOG]], content=args[args.index('--content') + 1], created_at=int(time.time()))
        if '--reply-to' in args:
            event['tags'].append(['e', args[args.index('--reply-to') + 1], '', 'reply'])
        if args[1] == 'edit':
            event['tags'].append(['e', args[args.index('--event') + 1]])
        self.events[eid] = event
        if self.uncertain:
            self.uncertain = False
            raise RuntimeError('Transport uncertain')
        return dict(accepted=True, event_id=eid)


class PostTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.api = Fake()
        self.config = dict(channel_id=WORKLOG, allowed_page_hosts=['jacob-dev-1.tailb2a35c.ts.net'])
        self.posts = Posts(self.api, self.temp.name, self.config)
        self.thrust = dict(kind='thrust', owner=OWNER, title='Buzz improvements', status='progress')
        self.task = dict(kind='task', owner=OWNER, title='Persist expanded replies', status='progress')

    def test_task_is_a_thread_reply_and_edit_retains_original_id(self):
        root = self.posts.post('project:buzz', self.thrust)
        task = self.posts.post('canonicaltask:11111111-1111-4111-8111-111111111111', self.task, 'project:buzz')
        self.assertEqual(task['parent_id'], root['event_id'])
        updated = self.posts.update('canonicaltask:11111111-1111-4111-8111-111111111111', dict(self.task, status='done'))
        self.assertEqual(updated['event_id'], task['event_id'])
        self.assertNotEqual(updated['revision_id'], task['event_id'])
        self.assertEqual(self.api.writes, 3)
        self.posts.update('canonicaltask:11111111-1111-4111-8111-111111111111', dict(self.task, status='done'))
        self.assertEqual(self.api.writes, 3)

    def test_duplicate_key_is_idempotent_and_changed_spec_requires_update(self):
        first = self.posts.post('project:buzz', self.thrust)
        again = self.posts.post('project:buzz', self.thrust)
        self.assertEqual(first, again)
        with self.assertRaises(ValueError):
            self.posts.post('project:buzz', dict(self.thrust, status='done'))
        self.assertEqual(self.api.writes, 1)

    def test_uncertain_new_key_cannot_adopt_another_identical_post(self):
        original = self.posts.post('project:a', self.thrust)
        original_call = self.api.call
        def fail_before_send(*args):
            if args[:2] == ('messages', 'send'):
                raise RuntimeError('No acceptance receipt')
            return original_call(*args)
        self.api.call = fail_before_send
        with self.assertRaises(RuntimeError): self.posts.post('project:b', self.thrust)
        with self.assertRaises(ValueError): self.posts.reconcile('project:b')
        with self.assertRaises(ValueError): self.posts.reconcile('project:b', original['event_id'])
        self.assertEqual(self.api.writes, 1)

    def test_successful_old_acceptance_cannot_bind_another_key(self):
        first = self.posts.post('project:a', self.thrust)
        original_call = self.api.call
        def reused(*args):
            if args[:2] == ('messages', 'send'):
                return dict(accepted=True, event_id=first['event_id'])
            return original_call(*args)
        self.api.call = reused
        with self.assertRaises(ValueError): self.posts.post('project:b', self.thrust)
        self.assertEqual(self.posts.state['posts']['project:a']['state'], 'verified')
        self.assertEqual(self.posts.state['posts']['project:b']['state'], 'conflict')
        self.assertNotIn('event_id', self.posts.state['posts']['project:b'])

    def test_unresolved_send_blocks_another_identical_key_before_any_write(self):
        self.api.uncertain = True
        with self.assertRaises(RuntimeError): self.posts.post('project:a', self.thrust)
        with self.assertRaises(ValueError): self.posts.post('project:b', self.thrust)
        self.assertNotIn('project:b', self.posts.state['posts'])
        self.assertEqual(self.api.writes, 1)

    def test_recovered_edit_clears_old_pending_id_before_next_uncertain_edit(self):
        self.posts.post('project:a', self.thrust)
        original_event = self.api.event
        def failed_readback(eid, scope):
            if self.api.events[eid]['kind'] == 40003: raise RuntimeError('Readback lost')
            return original_event(eid, scope)
        self.api.event = failed_readback
        with self.assertRaises(RuntimeError): self.posts.update('project:a', dict(self.thrust, status='waiting'))
        self.api.event = original_event
        self.posts.reconcile('project:a')
        self.assertNotIn('revision_id_pending', self.posts.state['posts']['project:a'])
        self.api.uncertain = True
        with self.assertRaises(RuntimeError): self.posts.update('project:a', dict(self.thrust, status='done'))
        self.posts.reconcile('project:a', f'{self.api.writes:064x}')
        self.assertEqual(self.posts.state['posts']['project:a']['spec']['status'], 'done')

    def test_uncertain_post_requires_readback_reconciliation_and_never_resends(self):
        self.api.uncertain = True
        with self.assertRaises(RuntimeError): self.posts.post('project:buzz', self.thrust)
        restarted = Posts(self.api, self.temp.name, self.config)
        with self.assertRaises(ValueError): restarted.post('project:buzz', self.thrust)
        with self.assertRaises(ValueError): restarted.reconcile('project:buzz')
        receipt = restarted.reconcile('project:buzz', '1'.zfill(64))
        self.assertEqual(receipt['state'], 'verified')
        self.assertEqual(self.api.writes, 1)

    def test_identical_second_key_cannot_adopt_an_existing_post(self):
        first = self.posts.post('project:a', self.thrust)
        original = self.api.call
        def fail_before_relay(*args):
            raise RuntimeError('No acceptance received')
        self.api.call = fail_before_relay
        with self.assertRaises(RuntimeError): self.posts.post('project:b', self.thrust)
        self.api.call = original
        with self.assertRaises(ValueError): self.posts.reconcile('project:b')
        with self.assertRaises(ValueError): self.posts.reconcile('project:b', first['event_id'])
        self.assertEqual(self.api.writes, 1)

    def test_desktop_equal_second_edit_order_and_clock_gate(self):
        original = dict(id='a'*64, pubkey=ROOT, created_at=100)
        edits = [dict(id=x*64, pubkey=ROOT, kind=40003, created_at=101, tags=[['e', original['id']]]) for x in ('f', '1')]
        self.assertEqual(latest_content(original, edits)['id'], '1'*64)
        first = self.posts.post('project:buzz', self.thrust)
        at = self.api.events[first['event_id']]['created_at']
        clock = [at + 0.2]
        sleeps = []
        def advance(delay):
            sleeps.append(delay); clock[0] += delay
        self.posts.clock, self.posts.sleep = lambda: clock[0], advance
        self.posts.update('project:buzz', dict(self.thrust, status='done'))
        self.assertEqual(len(sleeps), 1)
        self.assertGreater(clock[0], at + 1)

    def test_uncertain_edit_reconciles_only_the_same_original(self):
        self.posts.post('project:buzz', self.thrust)
        self.api.uncertain = True
        with self.assertRaises(RuntimeError): self.posts.update('project:buzz', dict(self.thrust, status='waiting'))
        receipt = Posts(self.api, self.temp.name, self.config).reconcile('project:buzz', '2'.zfill(64))
        self.assertEqual(receipt['status'], 'waiting')
        self.assertEqual(self.api.writes, 2)

    def test_wrong_author_or_external_edit_is_not_overwritten(self):
        r = self.posts.post('project:buzz', self.thrust)
        self.api.events[r['event_id']]['pubkey'] = 'a' * 64
        with self.assertRaises(ValueError): self.posts.update('project:buzz', dict(self.thrust, status='done'))
        self.assertEqual(self.api.writes, 1)

    def test_task_cannot_be_top_level_or_escape_private_scope(self):
        with self.assertRaises(ValueError): self.posts.post('canonicaltask:11111111-1111-4111-8111-111111111111', self.task)
        self.api.private = False
        with self.assertRaises(ValueError): self.posts.post('project:buzz', self.thrust)
        self.assertEqual(self.api.writes, 0)

    def test_vetted_labels_are_escaped_and_links_require_verified_hosts(self):
        text = body(dict(self.thrust, title='[click](javascript:bad)'), [])
        self.assertIn(r'\[click\]', text)
        for url in ['https://public.example/work', 'http://user:password@jacob-dev-1.tailb2a35c.ts.net/work', 'https://jacob-dev-1.tailb2a35c.ts.net/x)bad']:
            with self.subTest(url=url), self.assertRaises(ValueError):
                body(dict(self.thrust, page_url=url), self.config['allowed_page_hosts'])

    def test_task_summary_is_refused_and_digest_is_bounded(self):
        with self.assertRaises(ValueError): body(dict(self.task, summary='not a task one-liner'), [])
        with self.assertRaises(ValueError): body(dict(self.thrust, status='idle'), [])
        rendered = body(dict(self.thrust, kind='daily', summary='Shipped saved expansion.\nMobile awaits Jacob.'), [])
        self.assertIn('\n\nShipped', rendered)


if __name__ == '__main__': unittest.main()
