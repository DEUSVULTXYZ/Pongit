"""Bounded, phase-guarded public migration; secrets stay in private Compose files."""
import copy, datetime, hashlib, json, os, pathlib, shutil, subprocess, sys

os.umask(0o077)
root = pathlib.Path('/opt/pongit/releases/reship-all-20261007')
agents = root / 'agents'
human = root / 'human'
action = sys.argv[1]
attempt = int(sys.argv[2]) if len(sys.argv) > 2 else 1
assert 1 <= attempt <= 3

def load(p):
    return json.loads(pathlib.Path(p).read_text())

def state(name):
    return json.loads(subprocess.check_output(['docker', 'inspect', '-f', '{{json .State}}', name]))

def released():
    s = state('pongit-reship-all-retirement-20261007-2')
    p = load(root / 'evidence/retirement.json')
    assert not s['Running'] and s['ExitCode'] == 0
    assert p['passed'] and len(p['arenas']) == 11
    assert all(a.get('release') and a.get('verified') for a in p['arenas'])

def source_stopped():
    for name in ['admission', 'maintenance', 'engines', 'sponsor', 'archive']:
        assert not state('pongit-arcade-five-' + name + '-1')['Running'], name
    assert not state('pongit-relayer-1')['Running']

def fresh_backup():
    p = root / 'backup-final-source'
    b = load(p / 'off-vps.json')
    raw = (p / 'manifest.json').read_bytes()
    m = json.loads(raw)
    assert b['verified'] and b['manifestSha256'] == hashlib.sha256(raw).hexdigest()
    assert b['files'] == len(m)
    at = b.get('checkedAt', b.get('at'))
    assert (datetime.datetime.now(datetime.timezone.utc) - datetime.datetime.fromisoformat(at.replace('Z', '+00:00'))).total_seconds() < 3600
    for name, f in m.items():
        path = p / name
        assert path.parent == p and hashlib.sha256(path.read_bytes()).hexdigest() == f['sha256']

def start(c, service, label, seconds):
    name = 'pongit-reship-' + label + '-20261007-' + str(attempt)
    cfg = root / (label + '-runtime-' + str(attempt) + '.json')
    assert not cfg.exists(), 'Preserve the original invocation; inspect it before a new attempt'
    c['services'] = {service: c['services'][service]}
    c['services'][service]['restart'] = 'no'
    cfg.write_text(json.dumps(c, indent=2)); cfg.chmod(0o600)
    subprocess.run(['docker', 'compose', '-p', 'pongit-reship-all-20261007', '-f', str(cfg), 'run', '-d', '--no-deps', '--name', name, service], check=True, stdout=subprocess.DEVNULL)
    print(json.dumps({'started': name, 'action': action, 'originalTimeoutSeconds': seconds}))

released()
if action == 'source-finality':
    source_stopped()
    # Original archive is the sole scoped archive writer. No admission, engine
    # or maintenance is restarted. Human recovery disables both admission paths.
    subprocess.run(['docker', 'start', 'pongit-arcade-five-archive-1'], check=True, stdout=subprocess.DEVNULL)
    c = load('/opt/pongit/releases/human-v3-20261005/human-runtime.json')
    s = c['services']['relayer']; s['restart'] = 'no'
    s['environment'].update(PONG_INDEPENDENT_ADMISSION='false', ROOMS_ADMISSION_ENABLED='false')
    p = root / 'source-human-recovery.json'; assert not p.exists()
    p.write_text(json.dumps(c, indent=2)); p.chmod(0o600)
    subprocess.run(['docker', 'compose', '-p', 'pongit', '-f', str(p), 'up', '-d', '--no-deps', 'relayer'], check=True)
    print(json.dumps({'sourceFinalityStarted': True, 'admissions': False, 'automaticOpenings': False}))
elif action in ['verify-source', 'import', 'verify-import', 'setup', 'qualifications', 'challenges', 'public']:
    if action in ['verify-source', 'import', 'verify-import', 'setup']: source_stopped()
    if action == 'import':
        fresh_backup()
        proof = load(agents / 'evidence/public-source-1.json')
        assert proof['passed'] and proof['results'] == 837 and str(proof['requests']) == '155'
    dst = agents / 'metadata/public-retirement-20261007.json'
    if not dst.exists(): shutil.copy2(root / 'evidence/retirement.json', dst); dst.chmod(0o644)
    assert dst.read_bytes() == (root / 'evidence/retirement.json').read_bytes()
    c = load(agents / 'prepare-runtime-2.json'); s = c['services']['qualification']
    s['volumes'].append(str(agents / 'evidence') + ':/evidence')
    seconds = 1800 if action == 'import' else 900
    if action == 'import':
        s['environment']['PONG_CONTINUING_STAGE'] = 'import'
        s['command'] = ['timeout', '--signal=TERM', '--kill-after=30', str(seconds), 'node', '--import', 'tsx', 'scripts/migrate-reusable-agents.ts']
    else:
        label = {'verify-source': 'source', 'verify-import': 'import', 'setup': 'setup', 'qualifications': 'qualifications', 'challenges': 'challenges', 'public': 'open'}[action]
        s['environment'].update(PONG_PUBLIC_MIGRATION='user-authorized-reship-20261007', PONG_PUBLIC_MIGRATION_REPORT='/evidence/public-' + label + '-' + str(attempt) + '.json')
        s['command'] = ['timeout', '--signal=TERM', '--kill-after=30', str(seconds), 'node', '--import', 'tsx', 'scripts/public-agent-migration-control.ts', action]
        s['volumes'].append(str(root / 'public-agent-migration-control.ts') + ':/app/scripts/public-agent-migration-control.ts:ro')
    start(c, 'qualification', 'agents-' + action, seconds)
elif action in ['human-snapshot', 'human-deploy', 'human-open', 'human-audit']:
    if action in ['human-snapshot', 'human-deploy', 'human-open']: source_stopped()
    if action == 'human-deploy': fresh_backup()
    for name in ['secrets', 'evidence']:
        p = human / name; p.mkdir(parents=True, exist_ok=True); p.chmod(0o700); os.chown(p, 1000, 1000)
    c = load('/opt/pongit/releases/human-v3-20261005/deploy.json')
    s = c['services']['deploy']; e = s['environment']
    e.update(PONG_PUBLIC_HUMAN_MIGRATION='public-human-v3-20261007', PONG_SOURCE_COMMIT='reviewed-reship-20261007')
    s['volumes'] = [str(human / 'secrets') + ':/secrets' if v.endswith(':/secrets') else v for v in s['volumes']]
    s['volumes'] += [str(human / 'evidence') + ':/evidence', str(root / 'source') + ':/source:ro', '/opt/pongit/releases/human-v3-20261005/secrets:/previous-human:ro']
    for name in ['snapshot-public-human-v3.ts', 'deploy-public-human-v3.ts', 'open-public-human-v3.ts', 'verify-public-human-v3.ts']:
        s['volumes'].append(str(root / name) + ':/app/scripts/' + name + ':ro')
    # Preserve the original operator database, scope, key and artifact package.
    current = load('/opt/pongit/releases/human-v3-20261005/human-runtime.json')['services']['relayer']['environment']
    e['PONG_INDEPENDENT_DATABASE_URL'] = current['PONG_INDEPENDENT_DATABASE_URL']
    if action == 'human-snapshot':
        e.update(PONG_INDEPENDENT_MANIFEST='/source/human.json', PONG_INDEPENDENT_SNAPSHOT='/previous-human/source-snapshot.json', PONG_HUMAN_MIGRATION_OUTPUT='/secrets/source-snapshot.json')
    script = {'human-snapshot': 'snapshot-public-human-v3.ts', 'human-deploy': 'deploy-public-human-v3.ts', 'human-open': 'open-public-human-v3.ts', 'human-audit': 'verify-public-human-v3.ts'}[action]
    seconds = 1800 if action == 'human-deploy' else 600
    s['command'] = ['timeout', '--signal=TERM', '--kill-after=30', str(seconds), 'node', '--import', 'tsx', '--input-type=module', '-e', "import('./scripts/" + script + "').catch(e=>{console.error(JSON.stringify({failed:true,message:String(e.shortMessage||e.message).split('\\n')[0].replace(/0x[\\da-f]{64,}/gi,'[omitted]').slice(0,240)}));process.exit(1)})"]
    start(c, 'deploy', action, seconds)
else:
    raise ValueError('Unknown explicit migration phase')
