"""Read-only, bounded canonical publication evidence; no keys or databases mounted."""
import copy, datetime, hashlib, json, os, pathlib, re, subprocess, sys

root = pathlib.Path('/opt/pongit/releases/responsive-20261008-r2')
label, end, span = sys.argv[1:]
assert re.fullmatch(r'r2-seven[4-9]', label)
assert end.isdecimal() and int(end) > 0 and span.isdecimal() and 1 <= int(span) <= 3000
target = root / ('publication-' + label)
target.mkdir(exist_ok=False); target.chmod(0o755)
diagnostics = target / 'diagnostics'; diagnostics.mkdir(); os.chown(diagnostics, 1000, 1000)
config = json.loads((root / 'live/agent-compose.json').read_text())
source = config['services']['reader']
actual = json.loads(subprocess.check_output(['docker', 'inspect', 'pongit-arcade-five-reader-1']))[0]
assert actual['State']['Running'] and actual['Image'] == source['image']
script = root / 'reusable-publication-evidence.ts'
assert script.is_file()
script.chmod(0o644)
environment = {k: source['environment'][k] for k in ['RPC_URL', 'PONG_AGENT_POOL_MANIFEST', 'PONG_HUMAN_APPS']}
assert environment['PONG_AGENT_POOL_MANIFEST'].startswith('/metadata/')
environment.update(PONG_REUSABLE_PUBLICATION_EVIDENCE='read-only-public', PONG_PUBLICATION_LABEL=label,
                   PONG_PUBLICATION_END_BLOCK=end, PONG_PUBLICATION_BLOCKS=span)
metadata = root / 'live/metadata'
assert (metadata / environment['PONG_AGENT_POOL_MANIFEST'].removeprefix('/metadata/')).is_file()
name = 'pongit-publication-' + label + '-20261008'
service = dict(image=source['image'], user='1000:1000', restart='no', container_name=name,
               mem_limit='512m', cpus=.5, networks=copy.deepcopy(source['networks']), environment=environment,
               command=['timeout', '--signal=TERM', '--kill-after=15', '1800', 'node', '--import', 'tsx', 'scripts/reusable-publication-evidence.ts'],
               volumes=[str(metadata)+':/metadata:ro', str(diagnostics)+':/diagnostics',
                        str(script)+':/app/scripts/reusable-publication-evidence.ts:ro'])
document = {'services': {'evidence': service}, 'networks': {k: {'external': True, 'name': v['name']} for k,v in config['networks'].items()}}
path = target / 'compose.private.json'; path.write_text(json.dumps(document, indent=2)); path.chmod(0o600)
report = dict(startedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(), container=name,
              image=source['image'], sourceSha256=hashlib.sha256(script.read_bytes()).hexdigest(),
              fromBlock=str(int(end)-int(span)+1), toBlock=end, timeoutSeconds=1800,
              scope='Read-only exact publication window, no game/lifecycle/DB writes, no signing material', dispatched=False)
output = target / 'dispatch.json'; output.write_text(json.dumps(report, indent=2))
subprocess.run(['docker', 'compose', '-p', 'pongit-publication-'+label, '-f', str(path), 'up', '-d', 'evidence'],
               check=True, timeout=90, capture_output=True)
report['dispatched'] = True; output.write_text(json.dumps(report, indent=2)); print(json.dumps(report))
