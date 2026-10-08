"""Remove only older backup payloads already hash-verified outside the VPS."""
import datetime,hashlib,json,os,pathlib,subprocess
root=pathlib.Path('/opt/pongit/releases/responsive-20261008-r2').resolve()
labels=['backup-fix-24','backup-priority-25']
evidence=json.loads((root/'proposal27-offload2-local-proof.json').read_text());proof=evidence['backups']
assert sorted(proof)==sorted(labels)
output=root/'proposal27-offload-attempt2.json';assert not output.exists()
names=subprocess.check_output(['docker','ps','-aq'],text=True).split()
mounts=[pathlib.Path(m['Source']).resolve() for x in json.loads(subprocess.check_output(['docker','inspect',*names])) for m in x['Mounts'] if m.get('Source')]
files=[]
for label in labels:
 directory=(root/label).resolve();assert directory.parent==root
 manifest=json.loads((directory/'manifest.json').read_text())
 assert proof[label]['manifest']==hashlib.sha256((directory/'manifest.json').read_bytes()).hexdigest()
 assert len(manifest)==6 and manifest==proof[label]['files']
 for name,entry in manifest.items():
  path=(directory/name).resolve();assert path.parent==directory and path.is_file()
  assert not any(path==m or path.is_relative_to(m) or m.is_relative_to(path) for m in mounts),'Mounted backup must remain'
  assert path.stat().st_size==entry['bytes'] and hashlib.sha256(path.read_bytes()).hexdigest()==entry['sha256']
  files.append(path)
for name,entry in evidence['archives'].items():
 assert name in ['fix24-source-ce7968f.tar.gz','socket-source-a8ba724.tar.gz','admission-source-791bef9.tar.gz','admission-source-228c5b1.tar.gz']
 path=(root/name).resolve();assert path.parent==root and path.is_file()
 assert not any(path==m or path.is_relative_to(m) or m.is_relative_to(path) for m in mounts)
 assert path.stat().st_size==entry['bytes'] and hashlib.sha256(path.read_bytes()).hexdigest()==entry['sha256']
 files.append(path)
report={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'labels':labels,'files':len(files),'bytes':sum(p.stat().st_size for p in files),'passed':False}
output.write_text(json.dumps(report,indent=2))
for path in files:path.unlink()
s=os.statvfs('/');report.update(passed=True,disk=100*(s.f_blocks-s.f_bfree)/(s.f_blocks-s.f_bfree+s.f_bavail))
output.write_text(json.dumps(report,indent=2));print(json.dumps(report))
