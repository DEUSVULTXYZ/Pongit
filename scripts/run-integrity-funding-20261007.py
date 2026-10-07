"""One exact authorized reserve transfer; reuse the existing sponsor nonce journal."""
import copy
import json
import os
import pathlib
import subprocess

os.umask(0o077)
root = pathlib.Path('/opt/pongit/releases/command-integrity-20261007')
old = json.loads(subprocess.check_output(['docker', 'inspect', 'pongit-fluid-archive-reserve-20261007-1']))[0]
assert not old['State']['Running'] and old['State']['ExitCode'] == 0
path = old['Config']['Labels']['com.docker.compose.project.config_files']
assert ',' not in path
c = json.loads(pathlib.Path(path).read_text())
assert len(c['services']) == 1
role = next(iter(c['services']))
s = copy.deepcopy(c['services'][role])
s['restart'] = 'no'
s.pop('depends_on', None)
s['environment'].pop('PONG_FLUID_ARCHIVE_RESERVE', None)
s['environment']['PONG_INTEGRITY_ADMISSION_RESERVE'] = 'owned-5-test-mon-integrity-20261007'
evidence = root / 'fund-evidence'
evidence.mkdir(mode=0o700, exist_ok=True)
assert not (evidence / 'admission-reserve.json').exists(), 'Transfer already completed'
os.chown(evidence, 1000, 1000)
s['volumes'] = [({'type': 'bind', 'source': v.split(':')[0], 'target': v.split(':')[1], 'read_only': v.endswith(':ro')} if isinstance(v, str) else v) for v in s['volumes']]
for v in s['volumes']:
    if v['target'] == '/evidence': v['source'] = str(evidence)
    if v['target'] == '/app/scripts/fund-fluid-archive-20261007.ts':
        v['source'] = str(root / 'fund-integrity-admission-20261007.ts')
        v['target'] = '/app/scripts/fund-integrity-admission-20261007.ts'
s['command'] = ['timeout', '--signal=TERM', '--kill-after=15', '120', 'node', '--import', 'tsx', 'scripts/fund-integrity-admission-20261007.ts']
c['services'] = {role: s}
runtime = root / 'fund-runtime.json'
with runtime.open('x') as f: json.dump(c, f)
subprocess.run(['docker', 'compose', '-p', 'pongit-integrity-fund-20261007', '-f', str(runtime), 'run', '-d', '--no-deps', '--name', 'pongit-integrity-admission-reserve-20261007-1', role], check=True, stdout=subprocess.DEVNULL)
print(json.dumps({'started': 'pongit-integrity-admission-reserve-20261007-1', 'amountTestMon': 5, 'originalTimeoutSeconds': 120}))
