"""Offload only the already verified backup43 payloads; preserve newer backups."""
import datetime, hashlib, json, pathlib, subprocess

private=pathlib.Path('C:/Users/wwwle/.codex/private-backups/pongit/responsive-20261008-r2')
source=private/'backup-queue-46';out=private/'queue49-backup46-offload';out.mkdir(exist_ok=False)
manifest=json.loads((source/'manifest.json').read_text())
allowed={'human.dump','operator.dump','agents.dump','previous-agents.dump','shared-index.dump','configuration.private.tar.gz'}
assert set(manifest)==allowed
for name,entry in manifest.items():
 p=source/name
 assert p.stat().st_size==entry['bytes']
 with p.open('rb') as f:assert hashlib.file_digest(f,'sha256').hexdigest()==entry['sha256']
proof={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'offVpsVerified':True,'files':manifest}
(out/'proof.json').write_text(json.dumps(proof,indent=2))
script='''import pathlib,subprocess,json,hashlib,os
proof=PROOF
root=pathlib.Path('/opt/pongit/releases/responsive-20261008-r2')
backup=root/'backup-queue-46';out=root/'queue49-backup46-offload.json';assert not out.exists()
ids=subprocess.check_output(['docker','ps','-aq'],text=True).split()
mounts=[pathlib.Path(m['Source']).resolve() for c in json.loads(subprocess.check_output(['docker','inspect',*ids])) for m in c['Mounts'] if m.get('Source')]
for name,entry in proof['files'].items():
 p=backup/name
 assert p.resolve().parent==backup and p.is_file() and not p.is_symlink()
 assert not any(p==m or p in m.parents or m in p.parents for m in mounts),'Mounted backup retained'
 assert p.stat().st_size==entry['bytes']
 with p.open('rb') as f:assert hashlib.file_digest(f,'sha256').hexdigest()==entry['sha256']
out.write_text(json.dumps(proof,indent=2))
for name in proof['files']:(backup/name).unlink()
s=os.statvfs('/');proof.update(passed=True,diskUsablePercent=100*(s.f_blocks-s.f_bfree)/(s.f_blocks-s.f_bfree+s.f_bavail))
out.write_text(json.dumps(proof,indent=2))
print(json.dumps({'passed':True,'files':len(proof['files']),'bytes':sum(x['bytes'] for x in proof['files'].values()),'disk':proof['diskUsablePercent']}))
'''.replace('PROOF',repr(proof))
r=subprocess.run(['ssh','pongit','python3','-'],input=script,text=True,capture_output=True,timeout=90)
(out/'result.json').write_text(json.dumps({'code':r.returncode,'summary':r.stdout}))
assert r.returncode==0,'Scoped offload failed; preserve evidence and copies'
print(r.stdout)
