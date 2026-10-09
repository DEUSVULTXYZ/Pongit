"""Preserve exact obsolete source directories and one duplicate image upload off VPS."""
import datetime,hashlib,json,pathlib,subprocess,tarfile
root='/opt/pongit/tests/fluid-20260928'
names=['sync-f31eff0/web', 'sync-f31eff0/assets', 'sync-f31eff0/artwork', 'sync-runtime-579cbb9/web', 'sync-runtime-579cbb9/contracts', 'sync-runtime-579cbb9/assets', 'sync-runtime-579cbb9/artwork', 'sync-runtime-7e3d2e5/web', 'sync-runtime-7e3d2e5/contracts', 'sync-runtime-7e3d2e5/assets', 'sync-runtime-7e3d2e5/artwork', 'sync-runtime-20f9c1d/web', 'sync-runtime-20f9c1d/contracts', 'sync-runtime-20f9c1d/assets', 'sync-runtime-20f9c1d/artwork']
local=pathlib.Path('C:/Users/wwwle/.codex/private-backups/pongit/responsive-20261008-r2/entry50-source-offload')
local.mkdir(exist_ok=False)
guard='''import pathlib,json,subprocess,hashlib,os
root=pathlib.Path(ROOT).resolve();names=NAMES
targets=[root/n for n in names]
assert all(p.resolve().parent.parent==root and p.exists() and not p.is_symlink() for p in targets)
ids=subprocess.check_output(['docker','ps','-aq'],text=True).split()
mounts=[pathlib.Path(m['Source']).resolve() for c in json.loads(subprocess.check_output(['docker','inspect',*ids])) for m in c['Mounts'] if m.get('Source')]
assert not any(p==m or p in m.parents or m in p.parents for p in targets for m in mounts),'Mounted inputs retained'
files={}
for p in targets:
 for f in ([p] if p.is_file() else sorted(p.rglob('*'))):
  assert not f.is_symlink() and root in f.resolve().parents
  if f.is_file():
   with f.open('rb') as stream:digest=hashlib.file_digest(stream,'sha256').hexdigest()
   files[str(f.relative_to(root))]={'bytes':f.stat().st_size,'sha256':digest}
'''.replace('ROOT',repr(root)).replace('NAMES',repr(names))
def remote(code):
 r=subprocess.run(['ssh','pongit','python3','-'],input=code,text=True,capture_output=True,timeout=150)
 assert r.returncode==0,'Scoped input operation failed; no broader deletion permitted'
 return json.loads(r.stdout)
manifest=remote(guard+"\nprint(json.dumps(files))\n")
(local/'files.json').write_text(json.dumps(manifest,indent=2))
archive=local/'inputs.tar.gz'
with archive.open('xb') as stream:
 subprocess.run(['ssh','pongit','tar -C '+root+' -czf - '+' '.join(names)],stdout=stream,stderr=subprocess.PIPE,check=True,timeout=180)
observed=set()
with tarfile.open(archive) as package:
 for member in package:
  assert not member.issym() and not member.islnk()
  if member.isfile():
   assert member.name in manifest;expected=manifest[member.name]
   with package.extractfile(member) as stream:assert hashlib.file_digest(stream,'sha256').hexdigest()==expected['sha256']
   assert member.size==expected['bytes'];observed.add(member.name)
assert observed==set(manifest)
with archive.open('rb') as stream:digest=hashlib.file_digest(stream,'sha256').hexdigest()
report={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'names':names,'sha256':digest,'archiveBytes':archive.stat().st_size,'files':len(manifest),'sourceBytes':sum(x['bytes'] for x in manifest.values()),'offVpsVerified':True,'evicted':False}
(local/'report.json').write_text(json.dumps(report,indent=2))
result=remote(guard+'\nassert files=='+repr(manifest)+'''
for name in files:(root/name).unlink()
for target in targets:
 if target.is_dir():
  for d in sorted((p for p in target.rglob('*') if p.is_dir()),key=lambda p:len(p.parts),reverse=True):d.rmdir()
  target.rmdir()
s=os.statvfs('/');print(json.dumps({'diskUsable':100*(s.f_blocks-s.f_bfree)/(s.f_blocks-s.f_bfree+s.f_bavail)}))
''')
report.update(evicted=True,**result);(local/'report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
