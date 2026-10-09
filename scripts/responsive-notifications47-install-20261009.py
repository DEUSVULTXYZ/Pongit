"""Import the SHA-verified local Linux image without starting a service."""
import datetime
import hashlib
import json
import pathlib
import subprocess

root = pathlib.Path('/opt/pongit/releases/responsive-20261008-r2')
source = json.loads((root / 'web47-local-build.json').read_text())
output = root / 'build-admission-web-47.json'
assert not output.exists()
assert source['passed'] and source['source'] == 'cf0b4587829d473ecc6ddcef23f278e563953dd7'
archive = root / 'web47-local-image.tar.gz'
with archive.open('rb') as stream:
    assert hashlib.file_digest(stream, 'sha256').hexdigest() == source['imageArchiveSha256']
assert archive.stat().st_size == source['imageArchiveBytes']
report = dict(source)
report.update(passed=False, stage='load', importStartedAt=datetime.datetime.now(datetime.timezone.utc).isoformat())
output.write_text(json.dumps(report, indent=2))
try:
    subprocess.run(['docker', 'load', '-i', str(archive)], check=True, capture_output=True, timeout=180)
    image = json.loads(subprocess.check_output(['docker', 'image', 'inspect', source['tag']]))[0]
    digest = lambda x: hashlib.sha256(json.dumps(x, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    assert image['Os'] == 'linux' and image['Architecture'] == 'amd64'
    assert image['Config']['Labels']['org.opencontainers.image.revision'] == source['source']
    assert digest(image['Config']) == source['configSha256']
    assert digest(image['RootFS']) == source['rootfsSha256']
    report.update(localImage=source['image'], image=image['Id'], passed=True, stage='ready-not-deployed')
finally:
    report['importFinishedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    output.write_text(json.dumps(report, indent=2))
    print(json.dumps({k: report[k] for k in ['source', 'image', 'passed', 'stage']}))
