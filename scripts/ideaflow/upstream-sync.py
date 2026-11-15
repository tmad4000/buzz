#!/usr/bin/env python3
"""Report eligible upstream desktop releases. Never merges, builds or deploys."""
import datetime, json, subprocess
now = datetime.datetime.now(datetime.timezone.utc)
raw = subprocess.check_output(['gh', 'api', 'repos/block/buzz/releases', '--paginate']).decode()
releases = []
decoder = json.JSONDecoder()
while raw.strip():
    page, end = decoder.raw_decode(raw.lstrip())
    releases.extend(page)
    raw = raw.lstrip()[end:]
for release in releases:
    if release['draft'] or release['prerelease'] or not release['tag_name'].startswith('desktop-v'):
        continue
    published = datetime.datetime.fromisoformat(release['published_at'].replace('Z', '+00:00'))
    days = (now - published).total_seconds() / 86400
    if days >= 31:
        print(json.dumps({'tag': release['tag_name'], 'published_at': release['published_at'], 'age_days': round(days, 1), 'url': release['html_url']}))
        break
else:
    raise SystemExit('No desktop release at least 31 days old; explicit exception required.')
