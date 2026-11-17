"""Task-scoped Buzz CLI transport; bodies remain transient and errors stay generic."""
import datetime as dt
import json
import re
import subprocess
from urllib.parse import urlencode

RELAY = 'jprojects.communities.buzz.xyz'
JACOB = '3eb6491e9fecd5e2c0221f76b79685a1478b591bf90ea155f5352ebe12672e1f'
ROOT = '38ba46f41d56ff5c71cfbfb856d00b209e6216a218260d2a30c4f1b712bdd1cb'
DM = 'ad66b837-7232-4fa0-b41f-cbc49d415b0b'
OPS = '53e03008-6a6b-4ba2-a67c-7085ac0e9253'
WORKLOG = 'c74a895c-7145-41e3-a701-fe2daa74e477'
TEST_CHANNEL = 'd9eea0e1-4cc4-4a7f-bf04-b142ca98ce4d'
HEX = re.compile(r'[0-9a-f]{64}')


def timestamp(seconds):
    return dt.datetime.fromtimestamp(seconds, dt.timezone.utc).isoformat().replace('+00:00', 'Z')


def tag_values(event, name):
    return [t[1] for t in event['tags'] if len(t) >= 2 and t[0] == name]


def channel(event):
    values = tag_values(event, 'h')
    if len(values) != 1:
        raise ValueError('Expected one channel binding')
    return values[0]


def native_parent(event):
    replies = [t[1] for t in event['tags'] if len(t) >= 4 and t[0] == 'e' and t[3] == 'reply' and HEX.fullmatch(t[1])]
    if len(set(replies)) > 1:
        raise ValueError('Conflicting native reply tags')
    return replies[0] if replies else None


def source_link(channel_id, event_id, root_id=None):
    params = {'channel': channel_id, 'id': event_id}
    if root_id and root_id != event_id:
        params['thread'] = root_id
    return 'buzz-ideaflow://message?' + urlencode(params)


class Buzz:
    def __init__(self, executable, verifier):
        self.executable = str(executable)
        self.verifier = str(verifier)

    def call(self, *args):
        try:
            result = subprocess.run([self.executable, *args], capture_output=True, text=True, timeout=60)
        except (OSError, subprocess.TimeoutExpired) as error:
            raise RuntimeError('Buzz transport unavailable; inspect operation journal before retry') from error
        if result.returncode:
            raise RuntimeError('Buzz CLI failed; source text and credentials omitted')
        return json.loads(result.stdout)

    def verified(self, events):
        if not events:
            return events
        result = subprocess.run(['/usr/local/bin/node', self.verifier], input=json.dumps(events), capture_output=True, text=True, timeout=60)
        if result.returncode or json.loads(result.stdout) != [e['id'] for e in events]:
            raise ValueError('Source event signature verification failed')
        return events

    def event(self, event_id, expected_channel):
        if not HEX.fullmatch(event_id):
            raise ValueError('Expected full event ID')
        rows = self.verified(self.call('social', 'event', '--event', event_id))
        if len(rows) != 1 or rows[0]['id'] != event_id or channel(rows[0]) != expected_channel:
            raise ValueError('Event missing or outside expected channel')
        return rows[0]

    def auxiliary(self, messages, until):
        from pathlib import Path
        reader = str(Path(self.verifier).with_name('worklog_read.mjs'))
        result = subprocess.run(['/usr/local/bin/node', reader], input=json.dumps({'messages': messages, 'until': until}), capture_output=True, text=True, timeout=600)
        if result.returncode:
            raise ValueError('Scoped auxiliary history unavailable; previous export retained')
        return self.verified(json.loads(result.stdout))

    def history(self, channel_id, since=0, until=None, kinds='9'):
        until = until or int(dt.datetime.now(dt.timezone.utc).timestamp()) + 1
        events = {}
        before = until
        for _ in range(1000):
            page = self.verified(self.call('messages', 'get', '--channel', channel_id, '--since', str(since), '--before', str(before), '--limit', '200', '--kinds', kinds))
            for event in page:
                if channel(event) != channel_id or not since <= event['created_at'] <= until:
                    raise ValueError('History escaped scope')
                events[event['id']] = event
            if len(page) < 200:
                return sorted(events.values(), key=lambda e: (e['created_at'], e['id']))
            oldest = min(e['created_at'] for e in page)
            if oldest + 1 >= before:
                raise ValueError('Saturated same-second boundary; coverage incomplete')
            before = oldest + 1
        raise ValueError('History bound reached; coverage incomplete')

    def members(self, channel_id, expected=None):
        expected = expected or {ROOT, JACOB}
        rows = self.call('channels', 'members', '--channel', channel_id)
        if len(rows) != len(expected) or {r['pubkey'] for r in rows} != expected:
            raise ValueError('Channel membership differs from the exact task scope')
        return rows
