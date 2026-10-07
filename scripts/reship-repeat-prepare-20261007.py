"""Generate exact-scope second-reship helpers from the reviewed first reship.

This only prepares files. No transaction or service is started. Historical
scripts are retained byte-for-byte; generated scripts bind the frozen snapshot.
"""
import hashlib
import json
import os
import pathlib
import shutil

os.umask(0o077)
old = pathlib.Path('/opt/pongit/releases/reship-all-20261007')
root = pathlib.Path('/opt/pongit/releases/reship-repeat-20261007')
snapshot = json.loads((root / 'inventory-frozen.json').read_text())
assert snapshot['results'] == snapshot['ratings'] == '881'
assert snapshot['requests'] == '179' and snapshot['books'] == '40' and snapshot['resolved'] == 20
assert snapshot['pendingEngineJobs'] == 0
assert not (root / 'generated-sources.json').exists()
pool, lobby = snapshot['pool'], snapshot['lobby']
old_pool = '0x1f7d8a7b470a724df48d1b72723d7782d8e6014a'
old_lobby = '0x527ccb705048820694a4ac209f83528db68fff3f'
prefix = 'reusable-agents-20261007-2'
human_prefix = 'public-human-v3-20261007-2'
generated = {}


def save(path, value, public=False):
    path.write_text(json.dumps(value, indent=2) + '\n')
    path.chmod(0o644 if public else 0o600)
    os.chown(path, 1000, 1000)


def helper(name, changes=()):
    source = (old / name).read_text()
    text = source
    for before, after in changes:
        assert before in text, (name, before)
        text = text.replace(before, after)
    path = root / name
    assert not path.exists(), 'Never replace a running helper'
    path.write_text(text)
    path.chmod(0o644)
    generated[name] = {'parentSha256': hashlib.sha256((old / name).read_bytes()).hexdigest(), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}


base = [(str(old), str(root)), (old_pool, pool), (old_lobby, lobby), ('reusable-agents-20261007-1', prefix)]
helper('migrate-reusable-agents.ts', [
    (old_pool, pool), ('reusable-agents-20261007-1', prefix),
    ('public-39-reship-20261007', 'public-40-reship-repeat-20261007'),
    ('reship?39:23', 'reship?40:23'), ('public tournament 39', 'public tournament 40')])
helper('rating-continuation-audit.ts')
helper('audit-agent-rating-continuation.ts')
helper('public-agent-migration-control.ts', [
    (old_pool, pool), ('reusable-agents-20261007-1', prefix),
    ('user-authorized-reship-20261007', 'user-authorized-reship-repeat-20261007'),
    ('reship?837n:463n', 'reship?881n:463n'), ('reship?155n:67n', 'reship?179n:67n'),
    ('reship?39n:23n', 'reship?40n:23n'), ('reship?14:17', 'reship?20:17'),
    ('reship?839n:467n', 'reship?883n:467n')])
for name in ['snapshot-public-human-v3.ts', 'deploy-public-human-v3.ts', 'open-public-human-v3.ts']:
    helper(name, [('public-human-v3-20261007', human_prefix), (old_lobby, lobby)])
helper('verify-public-human-v3.ts')
helper('finalize-public-reship-20261007.ts', [(old_pool, pool), ('reship-source-20261007', 'reship-repeat-source-20261007'),
    ('source-finality-20261007', 'source-finality-repeat-20261007'), ('837n', '881n'), ('39n', '40n')])
helper('reship-public-source-observe-20261007.py', [(str(old), str(root))])
helper('reship-public-dispatch-20261007.py', [
    (str(old), str(root)), ('pongit-reship-all-retirement-20261007-2', 'pongit-reship-repeat-retirement-20261007-1'),
    ("'pongit-reship-'", "'pongit-reship-repeat-'"), ('pongit-reship-all-20261007', 'pongit-reship-repeat-20261007'),
    ("proof['results'] == 837", "proof['results'] == 881"), ("str(proof['requests']) == '155'", "str(proof['requests']) == '179'"),
    ('user-authorized-reship-20261007', 'user-authorized-reship-repeat-20261007'),
    ("'/opt/pongit/releases/human-v3-20261005/secrets:/previous-human:ro'", "'" + str(old / 'human/secrets') + ":/previous-human:ro'"),
    ("PONG_PUBLIC_HUMAN_MIGRATION='public-human-v3-20261007'", "PONG_PUBLIC_HUMAN_MIGRATION='" + human_prefix + "'")])
helper('reship-public-stage-20261007.py', base + [
    ("'public-human-v3-20261007'", "'" + human_prefix + "'"),
    ("proof['results'] == 837", "proof['results'] == 881"), ("str(proof['requests']) == '155'", "str(proof['requests']) == '179'"),
    ("len(proof['tournaments']) == 39", "len(proof['tournaments']) == 40"),
    ("'reship-all-20261007'", "'reship-repeat-20261007'")])
helper('reship-public-build-20261007.py', [(str(old), str(root)), ('reusable-agents-20261007-1', prefix),
    ("'public-human-v3-20261007'", "'" + human_prefix + "'"), ('abc551b', 'cafe26a'),
    ('reship-web-cafe26a-20261007', 'reship-repeat-web-cafe26a-20261007'),
    ('reship-index-cafe26a-20261007', 'reship-repeat-index-cafe26a-20261007')])
helper('reship-public-runtime-20261007.py', [(str(old), str(root)), ("'reship-indexer'", "'reship-repeat-indexer'"),
    ("'public_reship_20261007'", "'public_reship_repeat_20261007'")])
helper('reship-public-restore-20261007.py', [(str(old), str(root)), ('pongit-reship-restore-20261007', 'pongit-reship-repeat-restore-20261007'),
    ('reusable-agents-20261007-1:', prefix + ':'), ('public-human-v3-20261007:', human_prefix + ':')])

for sub in ['secrets', 'metadata', 'state', 'evidence', 'diagnostics']:
    p = root / 'agents' / sub
    p.mkdir(mode=0o700)
    os.chown(p, 1000, 1000)
for sub in ['secrets', 'evidence']:
    p = root / 'human' / sub
    p.mkdir(mode=0o700)
    os.chown(p, 1000, 1000)
# Verification uses the same pinned human artifact storage layout.
shutil.copy2(old / 'human/evidence/ratings-storage-layout.json', root / 'human/evidence/ratings-storage-layout.json')
meta = root / 'agents/metadata'
for source, target in [
    (root / 'source/agents.json', meta / 'source-manifest.json'),
    (old / 'agents/evidence/agent-reusable-index.json', meta / 'source-agent-index.json'),
    (old / 'agents/metadata/ratings-empty-seed-audit.json', meta / 'predecessor-ratings-audit.json')]:
    shutil.copy2(source, target)
    target.chmod(0o644)
config = json.loads((old / 'agents/prepare-runtime-2.json').read_text())
s = config['services']['qualification']
s['volumes'] = [v.replace(str(old), str(root)) for v in s['volumes']]
s['environment'].update(PONG_REUSABLE_AGENT_PREFIX=prefix, PONG_RETIRED_TOURNAMENT='public-40-reship-repeat-20261007', PONG_SOURCE_COMMIT='cafe26a+scoped-repeat-reship',
    PONG_HUMAN_APPS=','.join(a['app'] for a in snapshot['arenas'] if a['kind'] == 'human'))
save(root / 'agents/prepare-runtime-2.json', config)
audit = json.loads(json.dumps(config))
audit['services']['qualification']['volumes'] += [str(root / 'audit-agent-rating-continuation.ts') + ':/app/scripts/audit-agent-rating-continuation.ts:ro',
    str(meta) + ':/audit-output']
audit['services']['qualification']['command'] = ['timeout', '--signal=TERM', '--kill-after=30', '300', 'node', '--import', 'tsx', 'scripts/audit-agent-rating-continuation.ts',
    json.loads((root / 'source/agents.json').read_text())['ratings'], '/metadata/predecessor-ratings-audit.json',
    '/app/contracts/out/ContinuingAgentRatings.sol/ContinuingAgentRatings.json', '/audit-output/ratings-empty-seed-audit.json']
save(root / 'agents/audit-runtime.json', audit)
save(root / 'generated-sources.json', {'sourceBlock': snapshot['block'], 'sourcePool': pool, 'sourceLobby': lobby, 'sources': generated}, True)
print(json.dumps({'prepared': True, 'helpers': len(generated), 'targetPrefix': prefix, 'writes': 0}))
