#!/usr/bin/env python3
"""Validate the two iOS target profiles against the existing IdeaFlow certificate."""
import datetime
import fnmatch
import hashlib
import json
from pathlib import Path
import plistlib
import re
import subprocess
import sys

TEAM = 'JESMXK96LG'
CERTIFICATE = '300FAAFC4D696C4B886638DECE3E1319C3D0082E'
BUNDLE = 'app.ideaflow.buzz.mobile'
GROUP = 'group.' + BUNDLE


def inspect(path, bundle):
    """Return public profile metadata only after exact team, target and cert checks."""
    raw = subprocess.check_output(['security', 'cms', '-D', '-i', str(path)], stderr=subprocess.DEVNULL)
    profile = plistlib.loads(raw)
    ent = profile['Entitlements']
    expiration = profile['ExpirationDate']
    if expiration.tzinfo is None:
        expiration = expiration.replace(tzinfo=datetime.timezone.utc)
    if not (
        re.fullmatch(r'[A-Fa-f0-9]{8}(?:-[A-Fa-f0-9]{4}){3}-[A-Fa-f0-9]{12}', profile.get('UUID', ''))
        and expiration > datetime.datetime.now(datetime.timezone.utc)
        and profile.get('TeamIdentifier') == [TEAM]
        and not profile.get('ProvisionedDevices')
        and not profile.get('ProvisionsAllDevices')
        and not profile.get('IsXcodeManaged', False)
        and ent.get('application-identifier') == TEAM + '.' + bundle
        and ent.get('com.apple.developer.team-identifier') == TEAM
        and ent.get('get-task-allow') is False
        and [hashlib.sha1(cert).hexdigest().upper() for cert in profile['DeveloperCertificates']] == [CERTIFICATE]
        and ent.get('com.apple.security.application-groups') == [GROUP]
        and any(fnmatch.fnmatchcase(TEAM + '.' + BUNDLE, pattern) for pattern in ent.get('keychain-access-groups', []))
    ):
        raise ValueError('Expected an exact unexpired manual App Store profile using the existing IdeaFlow certificate and isolated app group')
    if bundle == BUNDLE:
        for name, expected in {
            'aps-environment': 'production',
            'com.apple.developer.devicecheck.appattest-environment': 'production',
            'com.apple.developer.declared-age-range': True,
            'com.apple.developer.usernotifications.communication': True,
        }.items():
            allowed = ent.get(name)
            if allowed != expected and not (isinstance(allowed, list) and expected in allowed):
                raise ValueError('Main App Store profile does not authorize ' + name)
    return {'uuid': profile['UUID'], 'name': profile['Name'], 'bundleId': bundle,
            'certificateSHA1': CERTIFICATE, 'expires': expiration.isoformat()}


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit('Usage: verify-mobile-profiles.py MAIN.mobileprovision EXTENSION.mobileprovision')
    print(json.dumps({'main': inspect(Path(sys.argv[1]), BUNDLE),
                      'notification': inspect(Path(sys.argv[2]), BUNDLE + '.NotificationService')}, indent=2))
