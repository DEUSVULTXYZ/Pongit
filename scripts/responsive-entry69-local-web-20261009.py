"""Build the pinned Linux web image locally; never starts an application server."""
import datetime
import hashlib
import json
import pathlib
import subprocess
import tarfile
import gzip
import shutil

repo = pathlib.Path(__file__).resolve().parents[1]
commit = '55c2c4071b3de087c1211d6abf8f748709f6a426'
root = repo / 'artifacts/responsive-20261008-r2/web69-local'
assert not root.exists(), 'Preserve the previous build'
root.mkdir()
context = root / 'context'
context.mkdir()
report = dict(source=commit, scope='Local Linux Docker compilation, no browser server', passed=False,
              startedAt=datetime.datetime.now(datetime.timezone.utc).isoformat())
path = root / 'build.json'
save = lambda: path.write_text(json.dumps(report, indent=2))
save()
try:
    assert subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=repo, text=True).strip() == commit
    # Exact committed source, never the local environment or ignored files.
    archive = root / 'source.tar.gz'
    subprocess.run(['git', 'archive', '--format=tar.gz', '-o', str(archive), commit,
                    '.dockerignore', 'package.json', 'package-lock.json', 'tsconfig.json',
                    'shared', 'web', 'scripts/docs-build.ts', 'deployments'], cwd=repo, check=True)
    report['archiveSha256'] = hashlib.sha256(archive.read_bytes()).hexdigest()
    with tarfile.open(archive) as package:
        package.extractall(context, filter='data')
    release = '/opt/pongit/releases/responsive-20261008-r2/'
    files = {
        '/opt/pongit/releases/sync-public-214c95a/web-source/Dockerfile.web': 'Dockerfile.web',
        release + 'live/metadata/manifest.json': 'deployments/agent-pool.json',
        release + 'live/metadata/publication-review.json': 'deployments/agent-pool-release-review.json',
        release + 'agents/evidence/agent-reusable-index.json': 'deployments/agent-reusable-index.json',
        release + 'human/secrets/manifest.json': 'deployments/independent.json',
    }
    hashes = {}
    for source, relative in files.items():
        target = context / relative
        subprocess.run(['scp', 'pongit:' + source, str(target)], check=True, capture_output=True, timeout=30)
        hashes[relative] = hashlib.sha256(target.read_bytes()).hexdigest()
    report['runtimePublicFiles'] = hashes
    manifest = json.loads((context / 'deployments/agent-pool.json').read_text())
    assert manifest['pool'].lower() == '0xe01c31f482113367c510a04816ff371676477fa3'
    assert manifest['rulesVersion'] == 17 and manifest['maxMatches'] == 5
    tag = 'pongit:responsive-entry-55c2c40-20261009'
    report['stage'] = 'compile'
    save()
    with (root / 'build.log').open('x') as log:
        subprocess.run(['docker', 'build', '--platform', 'linux/amd64', '--progress=plain',
                        '--memory', '4g', '--memory-swap', '4g',
                        '--label', 'org.opencontainers.image.revision=' + commit,
                        '-f', 'Dockerfile.web', '--target', 'web', '-t', tag,
                        '--build-arg', 'NEXT_PUBLIC_API_URL=https://pongit.xyz/api',
                        '--build-arg', 'NEXT_PUBLIC_WS_URL=wss://pongit.xyz/ws',
                        '--build-arg', 'NEXT_PUBLIC_RP_ID=pongit.xyz',
                        '--build-arg', 'PONG_REQUIRE_AGENT_POOL_MANIFEST=true', '.'],
                       cwd=context, stdout=log, stderr=subprocess.STDOUT, check=True, timeout=900)
    image = json.loads(subprocess.check_output(['docker', 'image', 'inspect', tag]))[0]
    assert image['Os'] == 'linux' and image['Architecture'] == 'amd64'
    digest=lambda x:hashlib.sha256(json.dumps(x,sort_keys=True,separators=(',',':')).encode()).hexdigest()
    report.update(image=image['Id'], tag=tag, stage='export',configSha256=digest(image['Config']),rootfsSha256=digest(image['RootFS']))
    save()
    image_tar = root / 'web-image.tar'
    subprocess.run(['docker', 'save', '-o', str(image_tar), tag], check=True, timeout=180)
    image_gz = root / 'web-image.tar.gz'
    with image_tar.open('rb') as source, image_gz.open('xb') as dest:
        with gzip.GzipFile(fileobj=dest, mode='wb', mtime=0) as zipped:
            shutil.copyfileobj(source, zipped)
    report.update(imageArchiveSha256=hashlib.file_digest(image_gz.open('rb'), 'sha256').hexdigest(),
                  imageArchiveBytes=image_gz.stat().st_size, passed=True, stage='complete')
finally:
    report['finishedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    save()
    print(json.dumps(report))
