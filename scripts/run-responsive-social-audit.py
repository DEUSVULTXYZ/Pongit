"""One bounded read-only complement to the completed seed audit."""
import json
import os
import pathlib
import subprocess
import sys

os.umask(0o077)
root = pathlib.Path('/opt/pongit/releases/command-integrity-20261007')
attempt = int(sys.argv[1]); assert attempt in [1, 2, 3, 4, 5, 6, 7, 8]
old = json.loads(subprocess.check_output(['docker', 'inspect', 'pongit-responsive-human-audit-20261007-5']))[0]
assert not old['State']['Running'] and old['State']['ExitCode'] == 0
assert (root / 'human-evidence/source-audit-5.json').is_file()
assert not (root / ('human-evidence/social-audit-'+str(attempt)+'.json')).exists()
if attempt > 1:
    prior = json.loads(subprocess.check_output(['docker', 'inspect', 'pongit-responsive-social-audit-20261007-'+str(attempt-1)]))[0]
    assert not prior['State']['Running'] and prior['State']['ExitCode'] != 0
    (root / ('human-evidence/social-attempt-'+str(attempt-1)+'-failure.json')).write_text(json.dumps({'name': prior['Name'], 'state': prior['State']}, indent=2))
config = json.loads((root / 'human-audit-runtime-5.json').read_text())
service = config['services']['audit']
service['environment'].update(PONG_RESPONSIVE_SOCIAL='audit-public-rules18-20261007',
    PONG_HUMAN_SOCIAL_SNAPSHOT='/evidence/source-audit-5.json',
    PONG_HUMAN_SOCIAL_CACHE='/evidence/social-canonical-pages.json',
    PONG_HUMAN_SOCIAL_OUTPUT='/evidence/social-audit-'+str(attempt)+'.json')
service['volumes'].append({'type': 'bind', 'source': str(root / 'audit-responsive-human-social.ts'),
    'target': '/app/scripts/audit-responsive-human-social.ts', 'read_only': True})
service['command'] = ['timeout', '--signal=TERM', '--kill-after=15', '300', 'node', '--import', 'tsx', 'scripts/audit-responsive-human-social.ts']
runtime = root / ('social-audit-runtime-'+str(attempt)+'.json')
with runtime.open('x') as f:
    json.dump(config, f)
name = 'pongit-responsive-social-audit-20261007-'+str(attempt)
subprocess.run(['docker', 'compose', '-p', 'pongit-responsive-social-audit', '-f', str(runtime), 'run', '-d', '--no-deps', '--name', name, 'audit'], check=True, stdout=subprocess.DEVNULL)
print(json.dumps({'started': name, 'readOnly': True, 'timeoutSeconds': 300}))
