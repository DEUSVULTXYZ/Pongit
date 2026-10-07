"""One bounded post-release backup. Reads lifecycle evidence; never writes chain state."""
import datetime
import hashlib
import json
import os
import pathlib
import subprocess
import tarfile
import time
import sys
import urllib.parse

root = pathlib.Path('/opt/pongit/releases/human-v3-20261005')
backup_label = sys.argv[1]
assert backup_label == 'backup-final'
destination = pathlib.Path('/opt/pongit/releases/fluid-input-6bb63f8') / backup_label
assert not destination.exists(), 'Preserve previous backup'
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

continuous = pathlib.Path('/opt/pongit/releases/continuous-20261005')
paths = [root / 'secrets', root / 'evidence', continuous / 'source-7480ecf', continuous / 'continuous-delegation-5d85044.ts', continuous / 'inputs-final']
paths += list(continuous.glob('*.json')) + list(continuous.glob('*.py'))

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
paths += [pathlib.Path('/opt/pongit/releases/reship-repeat-20261007') / x for x in ['source','agents/secrets','agents/metadata','agents/evidence','evidence']]
paths += list(pathlib.Path('/opt/pongit/releases/reship-repeat-20261007').glob('*.json')) + list(pathlib.Path('/opt/pongit/releases/reship-repeat-20261007').glob('*.ts'))
paths += list(pathlib.Path('/opt/pongit/releases/reship-repeat-20261007').glob('*.py'))
paths += [p for name in ['human/secrets','human/evidence','live'] if (p := pathlib.Path('/opt/pongit/releases/reship-repeat-20261007') / name).exists()]
paths += [pathlib.Path('/opt/pongit/releases/reship-all-20261007/live'), pathlib.Path('/opt/pongit/releases/reship-all-20261007/human/secrets'), pathlib.Path('/opt/pongit/releases/reship-all-20261007/agents/secrets')]
paths += [pathlib.Path('/opt/pongit/current/deployments')]
fluid = pathlib.Path('/opt/pongit/releases/fluid-input-01ba01c')
paths += list(fluid.glob('*.json')) + list(fluid.glob('*.py')) + list(fluid.glob('*.ts')) + [fluid/'fund-evidence', fluid/'backup-before']
final_web = pathlib.Path('/opt/pongit/releases/fluid-input-58fee17')
paths += list(final_web.glob('*.json')) + list(final_web.glob('*.py')) + [final_web/'backup-before']
recovered_web = pathlib.Path('/opt/pongit/releases/fluid-input-03fc112')
paths += list(recovered_web.glob('*.json')) + list(recovered_web.glob('*.py')) + [recovered_web/'backup-before']
final_candidate = pathlib.Path('/opt/pongit/releases/fluid-input-6bb63f8')
paths += list(final_candidate.glob('*.json')) + list(final_candidate.glob('*.py')) + [final_candidate/'backup-before']
paths = [p for p in paths if p.exists()]
# The inventory contains private runtime configuration and stays inside the
# private backup. Only hashes, sizes and non-secret database names are reported.
(destination / 'runtime.private.json').write_text(json.dumps([named[n] for n in [
    'pongit-relayer-1', 'pongit-arcade-five-arcade-web-1',
    'pongit-arcade-five-admission-1', 'pongit-arcade-five-maintenance-1',
    'pongit-arcade-five-archive-1', 'pongit-arcade-five-engines-1',
    'pongit-arcade-five-sponsor-1', 'pongit-arcade-five-reader-1',
    'pongit-arcade-five-human-v3-indexer-1', 'pongit-arcade-five-reship-repeat-indexer-1', 'pongit-reusable-shared-hasura-human14',
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
(destination.parent / (backup_label + '-report.json')).write_text(json.dumps(report, indent=2))
print(json.dumps(report))
