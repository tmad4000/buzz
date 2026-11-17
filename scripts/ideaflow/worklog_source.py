"""Redacted, retained Buzz observations. Never archive source message bodies."""
import json
from pathlib import Path
import sqlite3
import uuid
from worklog_client import DM, OPS, ROOT, JACOB, HEX, RELAY, channel, native_parent, timestamp
from worklog_posts import atomic

STATUS = {'👀': 'seen', '⏳': 'progress', '❓': 'waiting', '✅': 'done'}


def provenance(path):
    """Read only exact provenance columns from the listener, never its prompts."""
    connection = sqlite3.connect(Path(path).resolve().as_uri() + '?mode=ro', uri=True)
    try:
        connection.execute('PRAGMA query_only=ON')
        # Mutable legacy snapshots cannot prove who created a reaction.
        tables = {r[0] for r in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        states = {r[0]: r[1] for r in connection.execute('SELECT reaction_event_id,state FROM root_reaction_events')} if 'root_reaction_events' in tables else {}
        replies = {r[0] for r in connection.execute("SELECT event_id FROM replies WHERE source='root' AND status='verified' AND event_id IS NOT NULL")}
        return states, replies
    finally:
        connection.close()


def explicit_classes(path):
    data = json.loads(Path(path).read_text())
    if data.get('v') != 1 or not isinstance(data.get('entries'), dict):
        raise ValueError('Expected reviewed classification v1')
    for event_id, row in data['entries'].items():
        if not HEX.fullmatch(event_id) or row.get('kind') not in {'ask', 'query'}:
            raise ValueError('Only explicit reviewed initiations/queries can be classified')
        if not isinstance(row.get('reviewed_by'), str) or not row['reviewed_by']:
            raise ValueError('Classification needs a recorded reviewer')
        if 'title' in row and (not isinstance(row['title'], str) or not row['title'].strip() or len(row['title']) > 140 or '\n' in row['title']):
            raise ValueError('Use a short vetted headline, never a raw message body')
        if not isinstance(row.get('tasks', []), list):
            raise ValueError('Expected explicit task annotations')
        for task in row.get('tasks', []):
            if not isinstance(task, dict) or set(task) - {'id', 'kind', 'initiated', 'provenance', 'owner'}:
                raise ValueError('Unknown task annotation fields')
            if task.get('kind') not in {'task', 'query'} or type(task.get('initiated')) is not bool or task.get('provenance') not in {'manual', 'namespace'}:
                raise ValueError('Task intent must be explicitly classified')
            identity = task.get('id', '')
            if not identity.startswith('canonicaltask:') or str(uuid.UUID(identity[14:])) != identity[14:]:
                raise ValueError('Expected full canonical task UUID')
            if task.get('owner') and str(uuid.UUID(task['owner'])) != task['owner']:
                raise ValueError('Expected canonical owner agent UUID')
    return data['entries']


def rows_for(events, classes, states, root_replies):
    messages = {e['id']: e for e in events if e['kind'] == 9}
    rows = []
    def ancestry(event):
        current, seen = event, set()
        while native_parent(current):
            if current['id'] in seen:
                raise ValueError('Cyclic native thread')
            seen.add(current['id'])
            parent = messages.get(native_parent(current))
            if parent is None or channel(parent) != channel(event):
                return None
            current = parent
        return current['id']
    def ask_for(event):
        current, seen = event, set()
        while current['id'] not in seen:
            if current['id'] in classes:
                return current['id']
            seen.add(current['id'])
            parent = native_parent(current)
            if not parent or parent not in messages:
                return None
            current = messages[parent]
        return None
    def row(event, kind, ask, parent, actor):
        item = dict(v=1, kind=kind, event_id=event['id'], ask_id=ask,
                    thread_id=ancestry(messages[ask]), parent_id=parent,
                    channel_id=channel(messages[ask]), author=event['pubkey'], provenance=actor,
                    at=timestamp(event['created_at']), origin_key=f'buzz:{RELAY}:{channel(messages[ask])}:{ask}',
                    native_thread_id=ancestry(messages[ask]), native_parent_id=parent,
                    curated_thread_id=None, curated_parent_id=None)
        item['tasks'] = [dict(task, initiated=task['initiated'] if event['id'] == ask else False)
                         for task in classes[ask].get('tasks', [])]
        return item
    for event in events:
        if event['kind'] == 9:
            if event['pubkey'] == JACOB and event['id'] in classes and ancestry(event):
                classification = classes[event['id']]
                item = row(event, classification['kind'], event['id'], native_parent(event), 'jacob')
                if classification.get('title'):
                    item['title'] = classification['title']
                rows.append(item)
            elif event['pubkey'] == ROOT and event['id'] in root_replies:
                ask = ask_for(event)
                if ask and ancestry(messages[ask]):
                    rows.append(row(event, 'reply', ask, native_parent(event), 'root'))
        elif event['kind'] == 7 and event['pubkey'] == ROOT and event['content'] in STATUS:
            targets = [t[1] for t in event['tags'] if len(t) > 1 and t[0] == 'e']
            if len(targets) != 1 or targets[0] not in messages:
                continue
            target = messages[targets[0]]
            ask, state = ask_for(target), STATUS[event['content']]
            proof = states.get(event['id'])
            if ask and ancestry(messages[ask]) and proof == state:
                item = row(event, 'status', ask, targets[0], 'root')
                item['status'] = state
                rows.append(item)
        elif event['kind'] == 40003:
            targets = [t[1] for t in event['tags'] if len(t) > 1 and t[0] == 'e']
            target = messages.get(targets[0]) if len(targets) == 1 else None
            if target and event['pubkey'] == target['pubkey']:
                ask = ask_for(target)
                actor = 'jacob' if event['pubkey'] == JACOB else 'root' if target['id'] in root_replies else None
                if ask and actor and ancestry(messages[ask]):
                    item = row(event, 'revision', ask, target['id'], actor)
                    item['target_event_id'] = target['id']
                    rows.append(item)
    return rows


def export(api, directory, classes_path, provenance_path, until):
    """Complete snapshot first, then atomically retain observed redacted rows."""
    directory = Path(directory)
    classes = explicit_classes(classes_path)
    states, replies = provenance(provenance_path)
    events = []
    for target in (DM, OPS):
        api.members(target)
        events.extend(api.history(target, until=until))
    events.extend(api.auxiliary(events, until))
    messages = {e['id']: e for e in events if e['kind'] == 9}
    if any(eid not in messages or messages[eid]['pubkey'] != JACOB for eid in classes):
        raise ValueError('Classification source must be an accessible Jacob message in the allowlist')
    rows = rows_for(events, classes, states, replies)
    destination = directory / 'events.jsonl'
    retained = {}
    if destination.exists():
        for line in destination.read_text().splitlines():
            old = json.loads(line)
            if old.get('kind') == 'coverage':
                continue
            retained[old['event_id']] = old
    for item in rows:
        if item['event_id'] in retained and retained[item['event_id']] != item:
            raise ValueError('Previously exported metadata changed; inspect classification instead of rewriting')
        retained[item['event_id']] = item
    receipt = dict(v=1, kind='coverage', state='complete', complete=True, metadataOnly=True,
                   bodyArchived=False, observed_at=timestamp(until), since=timestamp(0), until=timestamp(until),
                   channels=[DM, OPS], exported=len(retained), explicit_classifications=len(classes),
                   unclassified_jacob_messages=sum(e['pubkey'] == JACOB and e['id'] not in classes for e in messages.values()),
                   status_provenance='Exact fresh-root-reaction journal only; legacy mutable status snapshots are omitted.',
                   limitation='Reviewed message-level requests/queries only; tasks[] alone declares task starts. Missing historical statuses are never fabricated.')
    data = ''.join(json.dumps(r, ensure_ascii=False, sort_keys=True) + '\n' for r in [receipt, *sorted(retained.values(), key=lambda r: (r['at'], r['event_id']))])
    temporary = destination.with_suffix('.tmp')
    temporary.write_text(data)
    temporary.chmod(0o600)
    temporary.replace(destination)
    atomic(directory / 'coverage.json', receipt)
    return receipt
