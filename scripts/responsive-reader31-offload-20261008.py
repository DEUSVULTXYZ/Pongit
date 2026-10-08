"""Keep exact old source archives and the previous backup off VPS before removing duplicates."""
import datetime,hashlib,json,pathlib,subprocess
root='/opt/pongit/releases/responsive-20261008-r2'
dest=pathlib.Path('C:/Users/wwwle/.codex/private-backups/pongit/responsive-20261008-r2/reader31-old-backup')
assert not dest.exists();dest.mkdir()
names=[]
remote='/opt/pongit/tests/agents-20260918-4/'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
files={}
for name in names:
 p=dest/name
 subprocess.run(['scp','pongit:'+remote+name,str(p)],check=True)
 files[remote+name]={'bytes':p.stat().st_size,'sha256':sha(p)}
backup=dest.parent/'backup-keeper-29';m=json.loads((backup/'manifest.json').read_text())
assert json.loads((backup/'off-vps.json').read_text())['verified'] and len(m)==6
for name,v in m.items():
 assert name in ['human.dump','operator.dump','agents.dump','previous-agents.dump','shared-index.dump','configuration.private.tar.gz']
 p=backup/name;assert p.stat().st_size==v['bytes'] and sha(p)==v['sha256'];files[root+'/backup-keeper-29/'+name]=v
proof={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'files':files,'offVpsVerified':True}
(dest/'proof.json').write_text(json.dumps(proof,indent=2))
script='''import pathlib,subprocess,json,hashlib,os,datetime
proof=PROOF
out=pathlib.Path('/opt/pongit/releases/responsive-20261008-r2/reader31-flat-offload.json');assert not out.exists()
names=subprocess.check_output(['docker','ps','-aq'],text=True).split()
mounts=[pathlib.Path(m['Source']).resolve() for c in json.loads(subprocess.check_output(['docker','inspect',*names])) for m in c['Mounts'] if m.get('Source')]
for path,v in proof['files'].items():
 p=pathlib.Path(path).resolve();assert str(p)==path and p.is_file() and not p.is_symlink()
 assert p.parent in [pathlib.Path('/opt/pongit/tests/agents-20260918-4'),pathlib.Path('/opt/pongit/releases/responsive-20261008-r2/backup-keeper-29')]
 assert not any(p==m or p in m.parents or m in p.parents for m in mounts),'Mounted file retained'
 assert p.stat().st_size==v['bytes'] and hashlib.sha256(p.read_bytes()).hexdigest()==v['sha256']
out.write_text(json.dumps(proof,indent=2))
for path in proof['files']:pathlib.Path(path).unlink()
s=os.statvfs('/');proof.update(passed=True,disk=100*(s.f_blocks-s.f_bfree)/(s.f_blocks-s.f_bfree+s.f_bavail))
out.write_text(json.dumps(proof,indent=2));print(json.dumps({'files':len(proof['files']),'bytes':sum(v['bytes'] for v in proof['files'].values()),'disk':proof['disk'],'passed':True}))
'''.replace('PROOF',repr(proof))
r=subprocess.run(['ssh','pongit','python3','-'],input=script,text=True,capture_output=True,timeout=120)
if r.returncode:raise RuntimeError('Scoped removal failed; off-VPS copies preserved')
(dest/'removed.json').write_text(r.stdout);print(r.stdout)
