"""Build the reviewed contact/release fix without replacing migration evidence."""
import datetime, hashlib, json, os, pathlib, shutil, subprocess, tarfile

root = pathlib.Path('/opt/pongit/releases/responsive-20261008-r2')
source = root / 'events-source-4094578.tar.gz'
commit = '40945786c19bd2273956f04b43a14e74cf06cbb2'
assert hashlib.sha256(source.read_bytes()).hexdigest() == '8703bdf4965030a313d0403ffc7276005181df3fd76656807c38aaef552f390a'
report = root / 'build-events-web-4.json'
context = root / 'events-build-4094578'
assert not report.exists() and not context.exists()
stat = os.statvfs('/')
used = 100 * (stat.f_blocks-stat.f_bfree) / (stat.f_blocks-stat.f_bfree+stat.f_bavail)
assert used < 80, ('Scoped cleanup required', used)
context.mkdir()
with tarfile.open(source) as archive:
    archive.extractall(context, filter='data')
shutil.copy2(root / 'build-source/Dockerfile.web', context / 'Dockerfile.web')
bindings = {}
for src, name in [
    ('live/metadata/manifest.json', 'agent-pool.json'),
    ('live/metadata/publication-review.json', 'agent-pool-release-review.json'),
    ('agents/evidence/agent-reusable-index.json', 'agent-reusable-index.json'),
    ('human/secrets/manifest.json', 'independent.json'),
]:
    target = context / 'deployments' / name
    shutil.copy2(root / src, target)
    target.chmod(0o644)
    bindings[name] = hashlib.sha256(target.read_bytes()).hexdigest()
manifest = json.loads((context / 'deployments/agent-pool.json').read_text())
assert manifest['enabled'] is True and manifest['tournamentsEnabled'] is False
tag = 'pongit:responsive-events-web-4094578-20261008'
result = dict(startedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(), source=commit,
              tag=tag, bindings=bindings, passed=False, diskBefore=used)
report.write_text(json.dumps(result, indent=2))
log = root / 'build-events-web-4.log'
try:
    with log.open('w') as output:
        process = subprocess.run(['docker', 'build', '--memory', '1800m', '--cpu-quota', '150000',
            '-f', 'Dockerfile.web', '-t', tag, '--target', 'web', '--label', 'org.opencontainers.image.revision='+commit,
            '--build-arg', 'NEXT_PUBLIC_API_URL=https://pongit.xyz/api', '--build-arg', 'NEXT_PUBLIC_WS_URL=wss://pongit.xyz/ws',
            '--build-arg', 'NEXT_PUBLIC_RP_ID=pongit.xyz', '--build-arg', 'PONG_REQUIRE_AGENT_POOL_MANIFEST=true', '.'],
            cwd=context, stdout=output, stderr=subprocess.STDOUT, timeout=900)
    assert process.returncode == 0, 'Build failed; original log retained'
    result['image'] = json.loads(subprocess.check_output(['docker', 'image', 'inspect', tag]))[0]['Id']
    result['passed'] = True
finally:
    result['finishedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    result['logSha256'] = hashlib.sha256(log.read_bytes()).hexdigest()
    report.write_text(json.dumps(result, indent=2))
    print(json.dumps(result))
