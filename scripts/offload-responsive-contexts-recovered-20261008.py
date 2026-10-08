"""Archive exact completed, unmounted compiler contexts. Never remove evidence or images."""
import datetime, hashlib, json, pathlib, shutil, subprocess, sys, tarfile
root=pathlib.Path('/opt/pongit/releases/responsive-20261008-r2')
names=['build-source','touch-build-c0e687f','feedback-build-05d7711','motion-build-5486a5f']
out=root/'offload-contexts-10'
def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for b in iter(lambda:f.read(1048576),b''):h.update(b)
 return h.hexdigest()
def check():
 ids=subprocess.check_output(['docker','ps','-aq'],text=True).split()
 mounts=[pathlib.Path(m['Source']).resolve() for c in json.loads(subprocess.check_output(['docker','inspect',*ids])) for m in c['Mounts'] if m.get('Source')]
 for name in names:
  p=(root/name).resolve();assert p.parent==root and p.name==name and p.is_dir() and not p.is_symlink()
  assert not any(p==m or p in m.parents or m in p.parents for m in mounts),'Mounted context'
 return len(ids)
if sys.argv[1]=='archive':
 assert not out.exists();count=check();out.mkdir(mode=0o700)
 files={}
 for name in names:
  for p in (root/name).rglob('*'):
   assert not p.is_symlink(),'Unexpected link'
   if p.is_file():files[str(p.relative_to(root))]={'sha256':sha(p),'bytes':p.stat().st_size}
 archive=out/'contexts.private.tar.gz'
 with tarfile.open(archive,'w:gz',compresslevel=1) as tar:
  for name in names:tar.add(root/name,arcname=name)
 manifest={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'targets':names,'files':files,'archiveSha256':sha(archive),'containerChecks':count}
 (out/'manifest.json').write_text(json.dumps(manifest))
 print(json.dumps({'files':len(files),'sourceBytes':sum(v['bytes'] for v in files.values()),'archiveBytes':archive.stat().st_size,'archiveSha256':manifest['archiveSha256'],'manifestSha256':sha(out/'manifest.json')}))
elif sys.argv[1]=='remove':
 manifest=json.loads((out/'manifest.json').read_text());proof=json.loads((out/'off-vps.json').read_text())
 assert proof['verified'] and proof['manifestSha256']==sha(out/'manifest.json') and proof['archiveSha256']==sha(out/'contexts.private.tar.gz')==manifest['archiveSha256']
 count=check();assert manifest['targets']==names and not (out/'removed.json').exists()
 for name in names:
  actual={str(p.relative_to(root)) for p in (root/name).rglob('*') if p.is_file()}
  assert actual=={p for p in manifest['files'] if p.startswith(name+'/')}
 for name,v in manifest['files'].items():assert sha(root/name)==v['sha256']
 for name in names:shutil.rmtree(root/name)
 (out/'contexts.private.tar.gz').unlink()
 report={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'targets':names,'containerChecks':count,'offVps':proof}
 (out/'removed.json').write_text(json.dumps(report));print(json.dumps({'removedContexts':len(names),'allBytesOffVps':True}))
else:raise ValueError('Unknown phase')
