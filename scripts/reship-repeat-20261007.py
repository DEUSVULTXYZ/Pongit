"""Explicit second October 7 public reship. Preserve each original invocation.

This dispatcher is intentionally scoped to the currently published eleven apps.
It is never installed in a keeper. Historical scripts and backups stay intact.
"""
import copy
import datetime
import hashlib
import json
import os
import pathlib
import shutil
import subprocess
import sys

os.umask(0o077)
ROOT = pathlib.Path('/opt/pongit/releases/reship-repeat-20261007')
OLD = pathlib.Path('/opt/pongit/releases/reship-all-20261007')
POOL = '0x89906fadc63704b003c5e5ca8e090f4dca757902'
LOBBY = '0xb73b6957c0f213b30ec5e7e47dc307ce153833b9'
ROLES = ['admission', 'maintenance', 'engines', 'sponsor', 'archive']


def load(p):
    return json.loads(pathlib.Path(p).read_text())


def save(p, value, public=False):
    p = pathlib.Path(p)
    p.write_text(json.dumps(value, indent=2) + '\n')
    p.chmod(0o644 if public else 0o600)
    os.chown(p, 1000, 1000)


def state(name):
    return load_json(['docker', 'inspect', '-f', '{{json .State}}', name])


def load_json(command):
    return json.loads(subprocess.check_output(command))


def stopped():
    for name in [*['pongit-arcade-five-' + r + '-1' for r in ROLES], 'pongit-relayer-1']:
        assert not state(name)['Running'], name


def replace(text, before, after):
    assert before in text, 'Reviewed source changed: ' + before
    return text.replace(before, after)


action = sys.argv[1]
assert action in ['prepare-files', 'backup-before', 'freeze', 'retirement']
assert ROOT.exists()
if action == 'prepare-files':
    assert not (ROOT / 'source').exists()
    for sub in ['source', 'evidence', 'agents', 'human']:
        p = ROOT / sub
        p.mkdir(mode=0o700)
        os.chown(p, 1000, 1000)
    a = load(OLD / 'live/metadata/manifest.json')
    h = load(OLD / 'human/secrets/manifest.json')
    assert a['pool'].lower() == POOL and h['lobby'].lower() == LOBBY
    assert len(a['arenas']) == 8 and len(h['arenas']) == 3
    save(ROOT / 'source/agents.json', a, True)
    save(ROOT / 'source/human.json', h, True)
    for name in ['independent-chain-tools.ts', 'approved-retirement.ts']:
        shutil.copy2(OLD / name, ROOT / name)
        (ROOT / name).chmod(0o644)
    text = (OLD / 'reship-public-backup-20261007.py').read_text()
    text = text.replace("['backup-final-source', 'backup-imported', 'backup-final']", "['backup-before', 'backup-final-source', 'backup-imported', 'backup-final']")
    text = text.replace(str(OLD), str(ROOT))
    # Keep the entire previous active runtime and all its protected keys/history.
    text = replace(text, '# The inventory contains', "paths += [pathlib.Path('" + str(OLD) + "/live'), pathlib.Path('" + str(OLD) + "/human/secrets'), pathlib.Path('" + str(OLD) + "/agents/secrets')]\npaths = [p for p in paths if p.exists()]\n# The inventory contains")
    (ROOT / 'backup.py').write_text(text)
    save(ROOT / 'source/preparation.json', {'at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'pool': POOL, 'lobby': LOBBY, 'authorization': 'User requested another complete reship; preserve accounts, history, balances and latest compatible fixes.'}, True)
    print(json.dumps({'prepared': True, 'chainWrites': 0}))
elif action == 'backup-before':
    subprocess.run(['python3', str(ROOT / 'backup.py'), 'backup-before'], check=True)
elif action == 'freeze':
    proof = load(ROOT / 'backup-before/off-vps.json')
    assert proof['verified'] and proof['manifestSha256'] == hashlib.sha256((ROOT / 'backup-before/manifest.json').read_bytes()).hexdigest()
    assert not (ROOT / 'evidence/freeze.json').exists()
    # Stop admission owners first. Existing engine state is checked before any close.
    names = ['pongit-arcade-five-' + r + '-1' for r in ROLES] + ['pongit-relayer-1']
    subprocess.run(['docker', 'stop', '--time', '30', *names], check=True, stdout=subprocess.DEVNULL)
    states = {name: state(name) for name in names}
    assert all(not s['Running'] and not s['OOMKilled'] for s in states.values())
    a = load(ROOT / 'source/agents.json')
    a.update(enabled=False, tournamentsEnabled=False)
    save(OLD / 'live/metadata/manifest.json', a, True)
    save(ROOT / 'evidence/freeze.json', {'at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'containers': {n: {'exitCode': s['ExitCode'], 'oom': s['OOMKilled']} for n, s in states.items()}, 'chainWrites': 0}, True)
    print(json.dumps({'stopped': len(states), 'closureSubmitted': False}))
elif action == 'retirement':
    stopped()
    assert not (ROOT / 'retirement-compose.json').exists()
    snapshot = load(ROOT / 'inventory-frozen.json')
    assert snapshot['pool'].lower() == POOL and snapshot['lobby'].lower() == LOBBY
    assert snapshot['results'] == snapshot['ratings'] == '881' and snapshot['requests'] == '179'
    assert snapshot['books'] == '40' and snapshot['resolved'] == 20
    assert all(l['ref']['id'] == '0' for l in snapshot['lanes']) and snapshot['humanSlots'] == ['0', '0']
    assert len(snapshot['arenas']) == 11 and all(a['status'] == 1 and a['epoch'] == '1' for a in snapshot['arenas'])
    now = datetime.datetime.now(datetime.timezone.utc)
    deadline = now + datetime.timedelta(minutes=78)
    manifest_hash = hashlib.sha256((ROOT / 'backup-before/manifest.json').read_bytes()).hexdigest()
    proof = load(ROOT / 'backup-before/off-vps.json')
    assert proof['verified'] and proof['manifestSha256'] == manifest_hash
    approval = {'reason': 'User requested another full public reship on 2026-10-07; only the eleven current idle apps may close normally', 'backupSha256': manifest_hash, 'offVpsVerified': True, 'deadline': deadline.isoformat(), 'arenas': snapshot['arenas']}
    save(ROOT / 'source/retirement-approval.json', approval, True)
    text = (OLD / 'retire-public-reship-20261007.ts').read_text()
    for before, after in [
        ('all-public-20261007', 'all-public-repeat-20261007'),
        ('public-reship-20261007:retire', 'public-reship-repeat-20261007:retire'),
        ('0x1f7d8a7b470a724df48d1b72723d7782d8e6014a', POOL),
        ('0x527ccb705048820694a4ac209f83528db68fff3f', LOBBY),
        ('User explicitly authorized all public contract replacements and old delegation closure on 2026-10-07', approval['reason']),
        ('3860df3bb0c0d8d466364a010b91da7ebe5d1bdaf1e9beb4178ea8ea56955451', manifest_hash),
        ('39n', '40n'), ('837n', '881n')]:
        text = replace(text, before, after)
    (ROOT / 'retire-public-reship-20261007.ts').write_text(text)
    (ROOT / 'retire-public-reship-20261007.ts').chmod(0o644)
    config = load(OLD / 'retirement-compose-2.json')
    service = config['services']['retirement']
    service['restart'] = 'no'
    service['environment'].update(PONG_PUBLIC_RESHIP='all-public-repeat-20261007', PONG_PUBLIC_RESHIP_DEADLINE=deadline.isoformat())
    for mount in service['volumes']:
        path = mount['source']
        if path.startswith(str(OLD) + '/'):
            mount['source'] = path.replace(str(OLD), str(ROOT), 1)
        if mount['target'] == '/run/pongit-human-v3':
            mount['source'] = str(OLD / 'human/secrets')
    save(ROOT / 'retirement-compose.json', config)
    hashes = {n: hashlib.sha256((ROOT / n).read_bytes()).hexdigest() for n in ['retire-public-reship-20261007.ts', 'independent-chain-tools.ts', 'approved-retirement.ts']}
    save(ROOT / 'evidence/retirement-dispatch.json', {'startedAt': now.isoformat(), 'deadline': deadline.isoformat(), 'sourceBlock': snapshot['block'], 'hashes': hashes}, True)
    subprocess.run(['docker', 'compose', '-p', 'pongit-reship-repeat-20261007', '-f', str(ROOT / 'retirement-compose.json'), 'run', '-d', '--no-deps', '--name', 'pongit-reship-repeat-retirement-20261007-1', 'retirement'], check=True, stdout=subprocess.DEVNULL)
    print(json.dumps({'started': 'pongit-reship-repeat-retirement-20261007-1', 'originalDeadline': deadline.isoformat(), 'scope': '11 exact idle epoch-1 apps; normal close only'}))
