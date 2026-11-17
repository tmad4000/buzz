#!/bin/bash
# Run only through the task's Aqua-session wrapper holding the shared Apple slot.
set -euo pipefail
: "${BUZZ_RELEASE_DIR:?Set the task-owned artifact directory}"
: "${BUZZ_IOS_MAIN_PROFILE:?Set the exact manual App Store main profile path}"
: "${BUZZ_IOS_NOTIFICATION_PROFILE:?Set the exact extension profile path}"
: "${BUZZ_IOS_BUILD_NUMBER:?Set the next verified App Store Connect build number}"
: "${BUZZ_SOURCE_REVISION:?Set the exact source commit}"
: "${BUZZ_SOURCE_MANIFEST:?Set the tracked-source SHA256 manifest}"
: "${BUZZ_BUILD_AGENT_ID:?Set the authorized task owner}"
[[ "$(launchctl managername)" == Aqua ]] || { echo 'Aqua signing session required'; exit 75; }
[[ "$BUZZ_IOS_BUILD_NUMBER" =~ ^[1-9][0-9]*$ ]]
source_root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$source_root"
source_preflight="$(python3 scripts/ideaflow/verify-mobile-source.py "$source_root" "$BUZZ_SOURCE_REVISION" "$BUZZ_SOURCE_MANIFEST")"
[[ -f "$HOME/.local/state/ios-build-slot.lock.d/owner.json" ]] || { echo 'Shared Apple lease required'; exit 75; }
python3 - <<'PY'
from pathlib import Path
import json,os
owner=json.loads((Path.home()/'.local/state/ios-build-slot.lock.d/owner.json').read_text())
assert owner['agentId']==os.environ['BUZZ_BUILD_AGENT_ID']
assert owner['project']=='buzz-mobile-testflight'
assert owner['leaseId']==os.environ['BUZZ_BUILD_LEASE_ID']
PY
mkdir -p "$BUZZ_RELEASE_DIR"
[[ "$BUZZ_RELEASE_DIR" = /* ]] || { echo 'Artifact directory must be absolute'; exit 1; }
release_run="$(mktemp -d "$BUZZ_RELEASE_DIR/archive.XXXXXXXX")"
export BUZZ_RELEASE_DIR="$release_run"
printf 'BUILD_RUN=%s\n' "$BUZZ_RELEASE_DIR"
printf '%s\n' "$source_preflight" > "$BUZZ_RELEASE_DIR/source-verified.json"
python3 scripts/ideaflow/verify-mobile-profiles.py "$BUZZ_IOS_MAIN_PROFILE" "$BUZZ_IOS_NOTIFICATION_PROFILE" > "$BUZZ_RELEASE_DIR/profiles.json"
cp scripts/ideaflow/mobile-testflight.xcconfig mobile/ios/Flutter/AppOverrides.xcconfig
python3 - <<'PY'
from pathlib import Path
import json,os,plistlib,shutil
release=Path(os.environ['BUZZ_RELEASE_DIR'])
profiles=json.loads((release/'profiles.json').read_text())
with Path('mobile/ios/Flutter/AppOverrides.xcconfig').open('a') as output:
 output.write('\nBUZZ_MAIN_PROFILE_SPECIFIER = '+profiles['main']['uuid']+'\n')
 output.write('BUZZ_NOTIFICATION_PROFILE_SPECIFIER = '+profiles['notification']['uuid']+'\n')
cache=Path.home()/'Library/Developer/Xcode/UserData/Provisioning Profiles'
cache.mkdir(parents=True,exist_ok=True)
for label,variable in [('main','BUZZ_IOS_MAIN_PROFILE'),('notification','BUZZ_IOS_NOTIFICATION_PROFILE')]:
 destination=cache/(profiles[label]['uuid']+'.mobileprovision')
 raw=Path(os.environ[variable]).read_bytes()
 if destination.exists() and destination.read_bytes()!=raw: raise RuntimeError('Existing profile UUID content mismatch')
 destination.write_bytes(raw)
options={'method':'app-store-connect','teamID':'JESMXK96LG','signingStyle':'manual',
 'signingCertificate':'300FAAFC4D696C4B886638DECE3E1319C3D0082E',
 'manageAppVersionAndBuildNumber':False,'uploadSymbols':True,
 'provisioningProfiles':{p['bundleId']:p['uuid'] for p in profiles.values()}}
(release/'ExportOptions.plist').write_bytes(plistlib.dumps(options))
PY
export PATH="$source_root/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
# Retain the repository's aged SDK and dependency locks; do not use system Flutter.
flutter --version --machine > "$BUZZ_RELEASE_DIR/flutter-version.json"
cd mobile
flutter pub get --enforce-lockfile
(cd ios && pod install --deployment)
# Retain prior outputs; bind selection to this build's fresh archive Info.plist.
python3 ../scripts/ideaflow/mobile-archive-artifacts.py prepare "$source_root" "$BUZZ_RELEASE_DIR" > "$BUZZ_RELEASE_DIR/archive-prepare.json"
flutter build ipa --release --no-pub --build-name=0.1.0 --build-number="$BUZZ_IOS_BUILD_NUMBER" \
 --dart-define=BUZZ_RELAY_URL=https://jprojects.communities.buzz.xyz \
 --dart-define=BUZZ_URL_SCHEME=buzz-ideaflow \
 --export-options-plist="$BUZZ_RELEASE_DIR/ExportOptions.plist"
# Flutter can return success on export failure; use an explicit checked fresh export.
archive_path="$(python3 ../scripts/ideaflow/mobile-archive-artifacts.py select "$source_root" "$BUZZ_RELEASE_DIR")"
export BUZZ_IOS_ARCHIVE_PATH="$archive_path"
# Xcode's system rsync must also launch its receiver from the system PATH.
PATH=/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin xcodebuild -exportArchive -archivePath "$archive_path" \
 -exportPath "$BUZZ_RELEASE_DIR/export" -exportOptionsPlist "$BUZZ_RELEASE_DIR/ExportOptions.plist"
python3 ../scripts/ideaflow/mobile-archive-artifacts.py reconcile-lock "$source_root" "$BUZZ_RELEASE_DIR" > "$BUZZ_RELEASE_DIR/generated-lock-postflight.json"
python3 - <<'PY_LOCKS'
from pathlib import Path
import hashlib,json,os
manifest=json.loads(Path(os.environ['BUZZ_SOURCE_MANIFEST']).read_text())
for name in ['pubspec.lock','ios/Podfile.lock']:
 assert hashlib.sha256(Path(name).read_bytes()).hexdigest()==manifest['mobile/'+name], 'Dependency lock changed: '+name
PY_LOCKS
python3 - <<'PY'
from pathlib import Path
import hashlib,json,os,plistlib,subprocess,tempfile,zipfile
release=Path(os.environ['BUZZ_RELEASE_DIR']); archive=Path(os.environ['BUZZ_IOS_ARCHIVE_PATH'])
source=Path.cwd().parent.resolve()
source_receipt=json.loads(subprocess.check_output(['python3','../scripts/ideaflow/verify-mobile-source.py',str(source),os.environ['BUZZ_SOURCE_REVISION'],os.environ['BUZZ_SOURCE_MANIFEST']]))
assert source_receipt==json.loads((release/'source-verified.json').read_text()), 'Source changed after preflight'
apps=list((archive/'Products/Applications').glob('*.app')); assert len(apps)==1
app=apps[0]; info=plistlib.loads((app/'Info.plist').read_bytes())
assert info['CFBundleIdentifier']=='app.ideaflow.buzz.mobile'
assert info['CFBundleDisplayName']=='Buzz Ideaflow'
assert info['CFBundleShortVersionString']=='0.1.0'
assert info['CFBundleVersion']==os.environ['BUZZ_IOS_BUILD_NUMBER']
assert info['CFBundleURLTypes'][0]['CFBundleURLSchemes']==['buzz-ideaflow']
subprocess.run(['codesign','--verify','--deep','--strict',str(app)],check=True)
extensions=list((app/'PlugIns').glob('*.appex')); assert len(extensions)==1
ext=plistlib.loads((extensions[0]/'Info.plist').read_bytes())
assert ext['CFBundleIdentifier']=='app.ideaflow.buzz.mobile.NotificationService'
ipas=list((release/'export').glob('*.ipa')); assert len(ipas)==1
ipa=ipas[0]
with tempfile.TemporaryDirectory(prefix='verify-ipa-',dir=release) as temporary:
 stage=Path(temporary)
 with zipfile.ZipFile(ipa) as package:
  entries=package.infolist()
  assert len(entries)<100000 and sum(e.file_size for e in entries)<3*1024**3
  assert all((stage/e.filename).resolve().is_relative_to(stage) for e in entries)
  package.extractall(stage)
 exported=list((stage/'Payload').glob('*.app')); assert len(exported)==1
 targets=[(exported[0],'app.ideaflow.buzz.mobile')]
 exported_extensions=list((exported[0]/'PlugIns').glob('*.appex')); assert len(exported_extensions)==1
 targets.append((exported_extensions[0],'app.ideaflow.buzz.mobile.NotificationService'))
 for number,(target,bundle) in enumerate(targets):
  exported_info=plistlib.loads((target/'Info.plist').read_bytes())
  assert exported_info['CFBundleIdentifier']==bundle
  assert exported_info['CFBundleVersion']==os.environ['BUZZ_IOS_BUILD_NUMBER']
  subprocess.run(['codesign','--verify','--deep','--strict',str(target)],check=True)
  ent=plistlib.loads(subprocess.check_output(['codesign','-d','--entitlements',':-',str(target)],stderr=subprocess.DEVNULL))
  assert ent['application-identifier']=='JESMXK96LG.'+bundle
  assert ent['com.apple.developer.team-identifier']=='JESMXK96LG'
  assert ent.get('get-task-allow') is not True
  assert ent['com.apple.security.application-groups']==['group.app.ideaflow.buzz.mobile']
  assert ent['keychain-access-groups']==['JESMXK96LG.app.ideaflow.buzz.mobile']
  prefix=str(stage/('certificate-'+str(number)+'-'))
  subprocess.run(['codesign','-d','--extract-certificates='+prefix,str(target)],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
  assert hashlib.sha1(Path(prefix+'0').read_bytes()).hexdigest().upper()=='300FAAFC4D696C4B886638DECE3E1319C3D0082E'
 profile_check=json.loads(subprocess.check_output(['python3','../scripts/ideaflow/verify-mobile-profiles.py',str(exported[0]/'embedded.mobileprovision'),str(exported_extensions[0]/'embedded.mobileprovision')]))
 expected_profiles=json.loads((release/'profiles.json').read_text())
 assert {k:p['uuid'] for k,p in profile_check.items()}=={k:p['uuid'] for k,p in expected_profiles.items()}
receipt={'source':os.environ['BUZZ_SOURCE_REVISION'],
 'version':info['CFBundleShortVersionString'],'build':info['CFBundleVersion'],
 'sourceManifestSHA256':source_receipt['sourceManifestSHA256'],
 'relay':'https://jprojects.communities.buzz.xyz','urlScheme':'buzz-ideaflow',
 'bundleId':info['CFBundleIdentifier'],'team':'JESMXK96LG','ipa':str(ipa.resolve()),
 'ipaSHA256':hashlib.file_digest(ipa.open('rb'),'sha256').hexdigest(),'signatureVerified':True,
 'uploaded':False,'appLaunched':False,'pushGatewayConfigured':False}
(release/'archive-receipt.json').write_text(json.dumps(receipt,indent=2))
PY
printf 'Buzz Ideaflow archive verified; upload is a separate checked step.\n'
