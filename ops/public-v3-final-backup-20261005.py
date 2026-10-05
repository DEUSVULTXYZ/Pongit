"""One bounded post-release backup. Reads lifecycle evidence; never writes chain state."""
import datetime
import hashlib
import json
import os
import pathlib
import subprocess
import tarfile
import time
import urllib.parse

root = pathlib.Path('/opt/pongit/releases/human-v3-20261005')
destination = root / 'backup-final'
assert not destination.exists(), 'Preserve the existing final backup'
deadline = datetime.datetime.fromisoformat('2026-10-05T04:58:00+00:00').timestamp()
while time.time() < deadline:
    evidence = json.loads((root / 'evidence/legacy-retirement.json').read_text())
    state = json.loads(subprocess.check_output(['docker', 'inspect', 'pongit-public-human-v2-retire-20261005']))[0]['State']
    if state['Status'] == 'exited':
        assert state['ExitCode'] == 0 and evidence['passed'], 'Retirement failed; preserve its evidence'
        assert len(evidence['arenas']) == 3 and all(a['released'] for a in evidence['arenas'])
        break
    time.sleep(10)
else:
    raise RuntimeError('Original backup wait deadline elapsed')

destination.mkdir(mode=0o700)
ids = subprocess.check_output(['docker', 'ps', '-aq'], text=True).split()
containers = json.loads(subprocess.check_output(['docker', 'inspect', *ids]))
named = {c['Name'].lstrip('/'): c for c in containers}
aliases = {}
for c in containers:
    for network in c['NetworkSettings']['Networks'].values():
        for alias in network.get('Aliases') or []:
            aliases[alias] = c['Name'].lstrip('/')
    aliases[c['Name'].lstrip('/')] = c['Name'].lstrip('/')

def env(name):
    return dict(v.split('=', 1) for v in named[name]['Config']['Env'])

human = env('pongit-relayer-1')
agents = env('pongit-arcade-five-admission-1')
legacy = env('pongit-agent-public-keeper')
databases = []
for label, url in [
    ('human', human['PONG_INDEPENDENT_DATABASE_URL']),
    ('operator', human['DATABASE_URL']),
    ('agents', agents['AGENT_DATABASE_URL']),
    ('previous-agents', legacy['AGENT_DATABASE_URL']),
]:
    parsed = urllib.parse.urlparse(url)
    databases.append((label, aliases[parsed.hostname], urllib.parse.unquote(parsed.username), parsed.path.lstrip('/')))
databases.append(('shared-index', 'pongit-reusable-agents2-db', 'pongit_agents', 'reusable_shared_indexer14'))
assert len({(container, database) for _, container, _, database in databases}) == 5
for label, container, user, database in databases:
    path = destination / (label + '.dump')
    with path.open('wb') as output:
        subprocess.run(['docker', 'exec', container, 'pg_dump', '-U', user, '-d', database, '-Fc'], stdout=output, check=True)
    assert path.stat().st_size > 1000

paths = [root / 'secrets', root / 'evidence']
paths += list(root.glob('*.json')) + list(root.glob('*.ts'))
paths += [
    pathlib.Path('/opt/pongit/releases/arcade-d2c6033/five-runtime/compose.json'),
    pathlib.Path('/opt/pongit/releases/sync-public-214c95a/live-v3/compose.json'),
    pathlib.Path('/opt/pongit/releases/sync-public-214c95a/live-v3/metadata'),
    pathlib.Path('/opt/pongit/releases/sync-public-214c95a/live-v3/state'),
    pathlib.Path('/opt/pongit/secrets/reusable-agents-20260929-1'),
    pathlib.Path('/opt/pongit/secrets/rooms'),
    pathlib.Path('/opt/pongit/secrets/independent'),
    pathlib.Path('/opt/pongit/secrets/agent-reusable-public/state'),
]
# The inventory contains private runtime configuration and stays inside the
# private backup. Only hashes, sizes and non-secret database names are reported.
(destination / 'runtime.private.json').write_text(json.dumps([named[n] for n in [
    'pongit-relayer-1', 'pongit-arcade-five-arcade-web-1',
    'pongit-arcade-five-admission-1', 'pongit-arcade-five-maintenance-1',
    'pongit-arcade-five-archive-1', 'pongit-arcade-five-engines-1',
    'pongit-arcade-five-sponsor-1', 'pongit-arcade-five-reader-1',
    'pongit-arcade-five-human-v3-indexer-1', 'pongit-reusable-shared-hasura-human14',
]]))
with tarfile.open(destination / 'configuration.private.tar.gz', 'w:gz') as archive:
    for path in sorted(set(paths)):
        assert path.exists(), str(path)
        archive.add(path, arcname=str(path).lstrip('/'))
    archive.add(destination / 'runtime.private.json', arcname='runtime.private.json')
(destination / 'runtime.private.json').unlink()
manifest = {p.name: {'bytes': p.stat().st_size, 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()} for p in destination.iterdir() if p.is_file()}
(destination / 'manifest.json').write_text(json.dumps(manifest, indent=2))
report = {'at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'passed': True,
          'path': str(destination), 'databases': [v[3] for v in databases],
          'files': len(manifest), 'bytes': sum(v['bytes'] for v in manifest.values()),
          'manifestSha256': hashlib.sha256((destination / 'manifest.json').read_bytes()).hexdigest()}
(root / 'evidence/final-backup.json').write_text(json.dumps(report, indent=2))
print(json.dumps(report))
