"""Profile isolation checks with a synthetic public-certificate fixture; no Mac action."""
import copy
import datetime
import hashlib
import importlib.util
from pathlib import Path
import plistlib
import sys
import unittest
from unittest.mock import patch
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('mobile_profiles', Path(__file__).with_name('verify-mobile-profiles.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ProfileIsolationTests(unittest.TestCase):
    def setUp(self):
        self.cert = b'public test certificate fixture'
        self.fingerprint = hashlib.sha1(self.cert).hexdigest().upper()
        self.profile = {'UUID': '00000000-0000-4000-8000-000000000001', 'Name': 'Fixture',
          'ExpirationDate': datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None) + datetime.timedelta(days=10),
          'TeamIdentifier': [module.TEAM], 'DeveloperCertificates': [self.cert],
          'Entitlements': {'application-identifier': module.TEAM+'.'+module.BUNDLE,
           'com.apple.developer.team-identifier': module.TEAM, 'get-task-allow': False,
           'com.apple.security.application-groups': [module.GROUP],
           'keychain-access-groups': [module.TEAM+'.*'], 'aps-environment': 'production',
           'com.apple.developer.devicecheck.appattest-environment': ['development', 'production'],
           'com.apple.developer.declared-age-range': True,
           'com.apple.developer.usernotifications.communication': True}}

    def inspect(self, profile=None, bundle=None):
        with patch.object(module, 'CERTIFICATE', self.fingerprint), patch.object(module.subprocess, 'check_output', return_value=plistlib.dumps(profile or self.profile)):
            return module.inspect(Path('synthetic.mobileprovision'), bundle or module.BUNDLE)

    def test_exact_main_and_extension(self):
        self.assertEqual(self.inspect()['certificateSHA1'], self.fingerprint)
        ext = copy.deepcopy(self.profile)
        ext['Entitlements']['application-identifier'] += '.NotificationService'
        for name in ['aps-environment', 'com.apple.developer.devicecheck.appattest-environment', 'com.apple.developer.declared-age-range', 'com.apple.developer.usernotifications.communication']:
            del ext['Entitlements'][name]
        self.assertEqual(self.inspect(ext,module.BUNDLE+'.NotificationService')['bundleId'],module.BUNDLE+'.NotificationService')

    def test_wrong_team_target_group_and_debug_entitlement_rejected(self):
        mutations = [lambda p:p.update(TeamIdentifier=['OTHERTEAM']),
          lambda p:p['Entitlements'].update({'application-identifier':module.TEAM+'.official.app'}),
          lambda p:p['Entitlements'].update({'com.apple.security.application-groups':['group.official.app']}),
          lambda p:p['Entitlements'].update({'get-task-allow':True})]
        for mutate in mutations:
            p=copy.deepcopy(self.profile);mutate(p)
            with self.assertRaises(ValueError):self.inspect(p)

    def test_expired_managed_device_and_wrong_certificate_rejected(self):
        for changes in [{'ExpirationDate':datetime.datetime(2000,1,1)}, {'IsXcodeManaged':True}, {'ProvisionedDevices':['device']}, {'DeveloperCertificates':[b'other']}, {'DeveloperCertificates':[self.cert,b'other']}]:
            p=copy.deepcopy(self.profile);p.update(changes)
            with self.assertRaises(ValueError):self.inspect(p)

    def test_bad_uuid_and_missing_managed_capability_rejected(self):
        p=copy.deepcopy(self.profile);p['UUID']='bad\nCODE_SIGN_STYLE=Automatic'
        with self.assertRaises(ValueError):self.inspect(p)
        p=copy.deepcopy(self.profile);del p['Entitlements']['com.apple.developer.usernotifications.communication']
        with self.assertRaises(ValueError):self.inspect(p)


if __name__ == '__main__':unittest.main()
