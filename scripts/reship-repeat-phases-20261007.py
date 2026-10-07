"""Additional bounded phases for the exact second public reship.

No phase runs implicitly. Retirement remains owned by its original worker.
"""
import copy
import datetime
import hashlib
import json
import os
import pathlib
import subprocess
import sys

root = pathlib.Path('/opt/pongit/releases/reship-repeat-20261007')
old = pathlib.Path('/opt/pongit/releases/reship-all-20261007')
action = sys.argv[1]
attempt = int(sys.argv[2]) if len(sys.argv) > 2 else 1
assert 1 <= attempt <= 3


def load(p):
    return json.loads(pathlib.Path(p).read_text())


def save(p, value):
    p.write_text(json.dumps(value, indent=2) + '\n')
    p.chmod(0o600)
    os.chown(p, 1000, 1000)


def stopped(name):
    state = json.loads(subprocess.check_output(['docker', 'inspect', '-f', '{{json .State}}', name]))
    assert not state['Running'], name
    return state


def released():
    state = stopped('pongit-reship-repeat-retirement-20261007-1')
    proof = load(root / 'evidence/retirement.json')
    assert state['ExitCode'] == 0 and proof['passed']
    assert len(proof['arenas']) == 11 and all(a.get('release') and a.get('verified') for a in proof['arenas'])


def start(config, role, label, seconds):
    name = 'pongit-reship-repeat-' + label + '-' + str(attempt)
    path = root / (label + '-runtime-' + str(attempt) + '.json')
    assert not path.exists(), 'Inspect prior phase rather than overwriting it'
    config['services'] = {role: config['services'][role]}
    config['services'][role]['restart'] = 'no'
    config['services'][role].pop('depends_on', None)
    save(path, config)
    subprocess.run(['docker', 'compose', '-p', 'pongit-reship-repeat-20261007', '-f', str(path), 'run', '-d', '--no-deps', '--name', name, role], check=True, stdout=subprocess.DEVNULL)
    print(json.dumps({'started': name, 'originalTimeoutSeconds': seconds}))


if action == 'source-finality':
    released()
    for role in ['admission', 'maintenance', 'sponsor', 'engines', 'archive']:
        stopped('pongit-arcade-five-' + role + '-1')
    stopped('pongit-relayer-1')
    c = load('/opt/pongit/releases/arcade-d2c6033/five-runtime/compose.json')
    s = c['services']['archive']
    s['environment'].update(PONG_PUBLIC_FINALITY='reship-repeat-source-20261007', PONG_FINALITY_ATTEMPT=str(attempt))
    s['volumes'] += [{'type': 'bind', 'source': str(root / 'source'), 'target': '/source', 'read_only': True},
        {'type': 'bind', 'source': str(root / 'evidence'), 'target': '/evidence'},
        {'type': 'bind', 'source': str(root / 'finalize-public-reship-20261007.ts'), 'target': '/app/scripts/finalize-public-reship-20261007.ts', 'read_only': True}]
    s['command'] = ['timeout', '--signal=TERM', '--kill-after=30', '900', 'node', '--import', 'tsx', 'scripts/finalize-public-reship-20261007.ts']
    start(c, 'archive', 'source-finality', 900)
elif action == 'human-finality':
    released()
    stopped('pongit-relayer-1')
    c = load('/opt/pongit/releases/human-v3-20261005/human-runtime.json')
    s = c['services']['relayer']
    s['environment'].update(PONG_INDEPENDENT_ADMISSION='false', ROOMS_ADMISSION_ENABLED='false')
    # The existing finality observer runs, but admissionReady returns before any
    # reserve opening when PONG_INDEPENDENT_ADMISSION is false.
    command = s.get('command')
    if command is None:
        image = json.loads(subprocess.check_output(['docker', 'image', 'inspect', s['image']]))[0]
        command = image['Config']['Cmd']
    assert command == ['node', '--import', 'tsx', 'relayer/src/main.ts']
    s['command'] = ['timeout', '--signal=TERM', '--kill-after=30', '600', *command]
    start(c, 'relayer', 'human-finality', 600)
elif action == 'roles-audit':
    released()
    r = load(root / 'agents/secrets/deployment.json')
    assert r['phase'] == 'deployed-closed'
    assert load(root / 'agents/evidence/public-import-1.json')['passed']
    before = load(old / 'live/metadata/reusable.json')
    retained = dict(before['serviceOperators'])
    retained['sponsor'] = '0x03CaceFD5522f27Ee20322aAA03E76745518FAd1'
    assert all(r['serviceOperators'][role].lower() == retained[role].lower() for role in ['admission', 'maintenance', 'archive', 'sponsor'])
    for role in ['admission', 'maintenance', 'archive', 'sponsor']:
        assert (root / 'agents/secrets' / (role + '.json')).read_bytes() == (old / 'live/keys' / (role + '.json')).read_bytes()
    path = root / 'agents/evidence/new-role-funding.json'
    assert not path.exists()
    save(path, {'at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'passed': True, 'pool': r['common']['pool'],
        'retainedRoles': retained, 'transfers': [], 'scope': 'Same scoped signers, keys, databases and nonce journals; no new role funding required.'})
    print(json.dumps({'passed': True, 'retainedRoles': 4, 'transfers': 0}))
elif action == 'stage-sdk':
    build = load(root / 'build-sdk.json')
    assert build['passed'] and build['sdk'] == '0.2.3'
    assert load(root / 'live/evidence/stage.json')['deployed'] is False
    assert not (root / 'live/evidence/runtime-backends.json').exists()
    p = root / 'live/agent-compose.json'
    c = load(p)
    for role in ['reader', 'sponsor', 'admission', 'maintenance', 'archive', 'engines']:
        assert c['services'][role]['image'] in [build['images']['agents']['base'], build['images']['agents']['base'].removeprefix('sha256:')]
        c['services'][role]['image'] = build['images']['agents']['image']
    save(p, c)
    p = root / 'live/human-runtime.json'
    c = load(p)
    assert c['services']['relayer']['image'] in [build['images']['human']['base'], build['images']['human']['base'].removeprefix('sha256:')]
    c['services']['relayer']['image'] = build['images']['human']['image']
    save(p, c)
    save(root / 'live/evidence/sdk-stage.json', {'sdk': '0.2.3', 'cli': '0.2.3', 'images': build['images'], 'deployed': False})
    print(json.dumps({'stagedSdk': '0.2.3', 'deployed': False}))
else:
    raise ValueError('Unknown explicit reship phase')
