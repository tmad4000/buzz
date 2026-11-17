"""Stable, owner-authored worklog posts with durable uncertain-send handling."""
import datetime as dt
import hashlib
import json
from pathlib import Path
import re
import time
from urllib.parse import urlsplit
import uuid

from worklog_client import ROOT, TEST_CHANNEL, channel, native_parent, source_link

STATES = {'open': '○', 'progress': '⏳', 'waiting': '❓', 'done': '✅'}
KINDS = {'thrust', 'task', 'query', 'daily', 'weekly'}


def digest(text):
    return hashlib.sha256(text.encode()).hexdigest()


def atomic(path, data):
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    temporary.chmod(0o600)
    temporary.replace(path)


def plain(text, limit):
    if not isinstance(text, str) or not text.strip() or len(text) > limit or any(ord(c) < 32 for c in text):
        raise ValueError('Expected a bounded single-line vetted label')
    return re.sub(r'([\\`*_{}\[\]<>])', r'\\\1', text)


def page_link(url, allowed_hosts):
    parsed = urlsplit(url)
    if parsed.scheme not in ('http', 'https') or parsed.hostname not in allowed_hosts or parsed.username or parsed.password or any(c in url for c in '\r\n<>()'):
        raise ValueError('Use an explicitly verified private worklog URL')
    return url


def body(spec, allowed_hosts):
    if spec['kind'] not in KINDS or spec['status'] not in STATES:
        raise ValueError('Unknown worklog kind or explicit status')
    owner = str(uuid.UUID(spec['owner']))
    if owner != spec['owner']:
        raise ValueError('Expected canonical owner agent ID')
    line = f"{STATES[spec['status']]} {plain(spec['title'], 140)} · {owner[:8]}"
    if spec.get('page_url'):
        line += f" · [Work log]({page_link(spec['page_url'], allowed_hosts)})"
    summary = spec.get('summary', '')
    if summary:
        if spec['kind'] not in {'daily', 'weekly'} or not isinstance(summary, str) or len(summary) > 4000 or '\x00' in summary:
            raise ValueError('Only digests accept a bounded vetted summary')
        line += '\n\n' + summary
    return line


def latest_content(event, history):
    edits = [e for e in history if e['kind'] == 40003 and e['pubkey'] == event['pubkey'] and
             [t[1] for t in e['tags'] if len(t) > 1 and t[0] == 'e'] == [event['id']]]
    return max(edits, key=lambda e: (e['created_at'], -int(e['id'], 16))) if edits else event


def validate_key(key, kind):
    if kind in {'task', 'query'}:
        if not key.startswith('canonicaltask:') or str(uuid.UUID(key[14:])) != key[14:]:
            raise ValueError('Tasks/queries require their actual canonical task UUID')
    elif kind == 'thrust':
        if not key.startswith('project:') or not key[8:]:
            raise ValueError('Major thrusts require project:REGISTRY_KEY')
    elif kind == 'daily':
        if not key.startswith('day:') or dt.date.fromisoformat(key[4:]).isoformat() != key[4:]:
            raise ValueError('Daily digest requires day:YYYY-MM-DD')
    elif kind == 'weekly':
        match = re.fullmatch(r'week:(\d{4})-W(\d{2})', key)
        if not match:
            raise ValueError('Weekly digest requires week:YYYY-Www')
        dt.date.fromisocalendar(int(match[1]), int(match[2]), 1)


class Posts:
    def __init__(self, api, directory, config, clock=time.time, sleep=time.sleep):
        self.api, self.directory, self.config = api, Path(directory), config
        self.clock, self.sleep = clock, sleep
        self.file = self.directory / 'posts.json'
        self.state = json.loads(self.file.read_text()) if self.file.exists() else {'v': 1, 'posts': {}}
        if self.state.get('v') != 1:
            raise ValueError('Unknown local post ledger')

    def save(self):
        atomic(self.file, self.state)

    def after_second(self, previous):
        delay = previous + 1 - self.clock()
        if delay > 2:
            raise ValueError('Relay revision is in the future; inspect clock before writing')
        if delay > 0:
            self.sleep(delay + 0.01)
        if int(self.clock()) <= previous:
            raise ValueError('Clock did not advance beyond current event')

    def check_channel(self):
        expected = {ROOT} if self.config['channel_id'] == TEST_CHANNEL else None
        self.api.members(self.config['channel_id'], expected)
        private = self.api.call('channels', 'list', '--visibility', 'private')
        if not any(c['channel_id'] == self.config['channel_id'] for c in private):
            raise ValueError('Work log destination is not verified private')

    def spec(self, key):
        if not isinstance(key, str) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9:._/-]{0,199}', key):
            raise ValueError('Use a stable canonical worklog key')
        return self.state['posts'].get(key)

    def verify_post(self, entry):
        event = self.api.event(entry['event_id'], self.config['channel_id'])
        if channel(event) != self.config['channel_id'] or event['kind'] != 9 or event['pubkey'] != ROOT or native_parent(event) != entry['parent_id']:
            raise ValueError('Stored post identity or ancestry does not match relay')
        return event

    def post(self, key, spec, parent_key=None):
        old = self.spec(key)
        if old:
            if old['state'] != 'verified':
                raise ValueError('Uncertain prior send: reconcile before retry')
            if old['spec'] != spec or old.get('parent_key') != parent_key:
                raise ValueError('Key already exists: use update, never duplicate post')
            self.verify_post(old)
            return self.receipt(key, old)
        text = body(spec, self.config.get('allowed_page_hosts', []))
        validate_key(key, spec['kind'])
        parent_id = None
        if spec['kind'] in {'task', 'query'}:
            parent = self.spec(parent_key)
            if not parent or parent['state'] != 'verified' or parent['spec']['kind'] != 'thrust':
                raise ValueError('Tasks/queries require a verified major-thrust parent key')
            parent_id = self.verify_post(parent)['id']
        elif parent_key is not None:
            raise ValueError('Major thrusts and digest posts are top-level')
        self.check_channel()
        # Different local keys must not construct identical Nostr events in the
        # same second. Keys are deliberately not inferred from message text.
        for other in self.state['posts'].values():
            if other.get('original_body_hash', other.get('body_hash')) == digest(text) and other.get('parent_id') == parent_id:
                if other.get('state') != 'verified':
                    raise ValueError('Matching earlier post intent is unresolved; reconcile it before another key')
                self.after_second(self.verify_post(other)['created_at'])
        entry = {'state': 'sending', 'spec': spec, 'parent_key': parent_key, 'parent_id': parent_id,
                 'intent_at': int(dt.datetime.now(dt.timezone.utc).timestamp()), 'body_hash': digest(text), 'original_body_hash': digest(text)}
        self.state['posts'][key] = entry
        self.save()
        args = ['messages', 'send', '--channel', self.config['channel_id'], '--content', text]
        if parent_id:
            args += ['--reply-to', parent_id]
        result = self.api.call(*args)
        if result.get('accepted') is not True:
            raise ValueError('Send not verified: reconcile before retry')
        entry['event_id'] = result['event_id']
        self.save()
        if any(v.get('event_id') == entry['event_id'] for k, v in self.state['posts'].items() if k != key):
            entry['collision_event_id'] = entry.pop('event_id')
            entry['state'] = 'conflict'
            self.save()
            raise ValueError('Accepted event ID belongs to another key; no second binding created')
        event = self.verify_post(entry)
        if digest(event['content']) != entry['body_hash']:
            raise ValueError('Published content readback differs')
        entry['state'] = 'verified'
        self.save()
        return self.receipt(key, entry)

    def update(self, key, spec):
        entry = self.spec(key)
        if not entry or entry['state'] != 'verified':
            raise ValueError('A verified original post is required')
        if spec['kind'] != entry['spec']['kind'] or spec['owner'] != entry['spec']['owner']:
            raise ValueError('Post kind/owner cannot change through a status update')
        text = body(spec, self.config.get('allowed_page_hosts', []))
        self.check_channel()
        event = self.verify_post(entry)
        history = self.api.history(self.config['channel_id'], event['created_at'], kinds='40003')
        current = latest_content(event, history)
        if digest(current['content']) != entry['body_hash']:
            raise ValueError('Post changed outside this ledger: inspect before updating')
        if text == current['content']:
            return self.receipt(key, entry)
        # Desktop selects the first ID at equal timestamps. Publish a strictly
        # newer second so a rapid edit cannot lose to its previous revision.
        self.after_second(current['created_at'])
        entry.pop('revision_id_pending', None)
        entry.update(state='editing', pending_spec=spec, pending_hash=digest(text),
                     intent_at=int(dt.datetime.now(dt.timezone.utc).timestamp()))
        self.save()
        result = self.api.call('messages', 'edit', '--event', event['id'], '--content', text)
        if result.get('accepted') is not True:
            raise ValueError('Edit not verified: reconcile before retry')
        entry['revision_id_pending'] = result['event_id']
        self.save()
        revision = self.api.event(result['event_id'], self.config['channel_id'])
        if revision['kind'] != 40003 or revision['pubkey'] != ROOT or channel(revision) != self.config['channel_id'] or ['e', event['id']] not in revision['tags'] or revision['content'] != text:
            raise ValueError('Edit readback differs: reconcile before retry')
        selected = latest_content(event, self.api.history(self.config['channel_id'], event['created_at'], kinds='40003'))
        if selected['id'] != revision['id']:
            raise ValueError('Edit is stored but not the current revision: inspect before retry')
        entry.update(state='verified', spec=entry.pop('pending_spec'), body_hash=entry.pop('pending_hash'), revision_id=revision['id'])
        entry.pop('revision_id_pending', None)
        self.save()
        return self.receipt(key, entry)

    def reconcile(self, key, explicit_event=None):
        entry = self.spec(key)
        if not entry:
            raise ValueError('No pending operation')
        self.check_channel()
        if entry['state'] == 'verified':
            self.verify_post(entry)
            return self.receipt(key, entry)
        if entry['state'] not in {'sending', 'editing'}:
            raise ValueError('Operation conflict needs explicit repair; automatic recovery is refused')
        known = entry.get('event_id') if entry['state'] == 'sending' else entry.get('revision_id_pending')
        if known and explicit_event and known != explicit_event:
            raise ValueError('Explicit recovery ID differs from saved acceptance')
        selected_id = known or explicit_event
        if selected_id is None:
            raise ValueError('No exact acceptance ID: inspect relay and supply --event; automatic hash adoption is forbidden')
        if any(v.get('event_id') == selected_id for k, v in self.state['posts'].items() if k != key):
            raise ValueError('Recovery event is already bound to another canonical key')
        history = [self.api.event(selected_id, self.config['channel_id'])]
        target = entry.get('pending_hash', entry['body_hash'])
        matches = [e for e in history if e['created_at'] >= entry['intent_at'] and e['pubkey'] == ROOT and digest(e['content']) == target and
                   ((entry['state'] == 'sending' and e['kind'] == 9 and native_parent(e) == entry['parent_id']) or
                    (entry['state'] == 'editing' and e['kind'] == 40003 and ['e', entry['event_id']] in e['tags']))]
        if len(matches) != 1:
            raise ValueError('Pending operation has zero or ambiguous matches; do not resend')
        event = matches[0]
        if entry['state'] == 'sending':
            entry['event_id'] = event['id']
        else:
            original = self.verify_post(entry)
            selected = latest_content(original, self.api.history(self.config['channel_id'], original['created_at'], kinds='40003'))
            if selected['id'] != event['id']:
                raise ValueError('Recovered edit is not the current revision')
            entry.update(spec=entry.pop('pending_spec'), body_hash=entry.pop('pending_hash'), revision_id=event['id'])
        entry['state'] = 'verified'
        entry.pop('revision_id_pending', None)
        self.save()
        return self.receipt(key, entry)

    def receipt(self, key, entry):
        return dict(key=key, channel_id=self.config['channel_id'], event_id=entry['event_id'],
                    revision_id=entry.get('revision_id'), state=entry['state'],
                    parent_id=entry['parent_id'], status=entry['spec']['status'],
                    source_url=source_link(self.config['channel_id'], entry['event_id'], entry['parent_id']))
