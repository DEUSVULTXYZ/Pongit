"""Remove only verified off-VPS duplicates; retain current backups and images."""
import datetime
import hashlib
import json
import pathlib
import subprocess

repo = pathlib.Path(__file__).resolve().parents[1]
root = '/opt/pongit/releases/responsive-20261008-r2'
private = pathlib.Path('C:/Users/wwwle/.codex/private-backups/pongit/responsive-20261008-r2')
out = private / 'socket36-offload'
out.mkdir(exist_ok=False)
sha = lambda path: hashlib.file_digest(path.open('rb'), 'sha256').hexdigest()
files = {}
backup = private / 'backup-http-34'
manifest = json.loads((backup / 'manifest.json').read_text())
assert json.loads((backup / 'off-vps.json').read_text())['verified'] and len(manifest) == 6
for name, entry in manifest.items():
    assert name in ['human.dump', 'operator.dump', 'agents.dump', 'previous-agents.dump', 'shared-index.dump', 'configuration.private.tar.gz']
    path = backup / name
    assert path.stat().st_size == entry['bytes'] and sha(path) == entry['sha256']
    files[root + '/backup-http-34/' + name] = entry
image = repo / 'artifacts/responsive-20261008-r2/web35-local'
build = json.loads((image / 'build.json').read_text())
archive = image / 'web-image.tar.gz'
assert build['passed'] and sha(archive) == build['imageArchiveSha256']
files[root + '/web35-local-image.tar.gz'] = {'bytes': archive.stat().st_size, 'sha256': build['imageArchiveSha256']}
proof = dict(at=datetime.datetime.now(datetime.timezone.utc).isoformat(), files=files, offVpsVerified=True)
(out / 'proof.json').write_text(json.dumps(proof, indent=2))
script = '''import pathlib,subprocess,json,hashlib,os
proof=PROOF
root=pathlib.Path('/opt/pongit/releases/responsive-20261008-r2')
out=root/'socket36-offload.json';assert not out.exists()
ids=subprocess.check_output(['docker','ps','-aq'],text=True).split()
mounts=[pathlib.Path(m['Source']).resolve() for c in json.loads(subprocess.check_output(['docker','inspect',*ids])) for m in c['Mounts'] if m.get('Source')]
for name,entry in proof['files'].items():
 p=pathlib.Path(name).resolve();assert str(p)==name and p.is_file() and not p.is_symlink()
 assert p.parent==root/'backup-http-34' or p==root/'web35-local-image.tar.gz'
 assert not any(p==m or p in m.parents or m in p.parents for m in mounts),'Mounted copy retained'
 assert p.stat().st_size==entry['bytes']
 with p.open('rb') as f:assert hashlib.file_digest(f,'sha256').hexdigest()==entry['sha256']
out.write_text(json.dumps(proof,indent=2))
for name in proof['files']:pathlib.Path(name).unlink()
s=os.statvfs('/');proof.update(passed=True,diskUsablePercent=100*(s.f_blocks-s.f_bfree)/(s.f_blocks-s.f_bfree+s.f_bavail))
out.write_text(json.dumps(proof,indent=2))
print(json.dumps({'passed':True,'files':len(proof['files']),'bytes':sum(x['bytes'] for x in proof['files'].values()),'disk':proof['diskUsablePercent']}))
'''.replace('PROOF', repr(proof))
result = subprocess.run(['ssh', 'pongit', 'python3', '-'], input=script, text=True, capture_output=True, timeout=90)
if result.returncode:
    raise RuntimeError('Scoped offload failed; keep proof and all local copies')
(out / 'removed.json').write_text(result.stdout)
print(result.stdout)
