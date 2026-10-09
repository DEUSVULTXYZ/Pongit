"""Preserve eight obsolete, unused PONGIT web images off VPS before eviction.

Current and immediate rollback images, all containers, volumes and journals stay.
Every exported OCI blob is verified, including each inspected image manifest.
"""
import datetime,hashlib,json,pathlib,subprocess,tarfile,sys
images={
 'pongit:responsive-web-eb42374-20261008':'sha256:86f199d4a3c8637c05ebe222104dc5ec2d85c89800c019d55c5ab9c46f684a00',
 'pongit:responsive-contact-web-d2dcd65-20261008':'sha256:c3fd99b48466e768dd4a4f6da88ac0ae645f9fb4ec2ef0305a352f17ad3140eb',
 'pongit:responsive-wall-web-467053d-20261008':'sha256:2c47e24eeaa5244ec6e6075837c0861834b6809a5f91f0051213fb29e9e27611',
 'pongit:responsive-events-web-4094578-20261008':'sha256:5cd9c7463fbff2e15487599d89c9b4a49370c30b8fcc3acbd60bc9826a23a20c',
 'pongit:responsive-replay-web-04acb95-20261008':'sha256:e07047bcf2057bb8fd0e54ee93084d828902329b290f4f0be5f1a4ea5d8549c0',
 'pongit:responsive-docs-web-6deaa0d-20261008':'sha256:1e0fb9ed31ca0e9f28466f220e806ba0b8bc500759e0528022333a36854c94f5',
 'pongit:responsive-feedback-web-05d7711-20261008':'sha256:53333cc77fef7916c8b41bde2d62ea279548495a9cd58939c98f9a8e140cfe08',
 'pongit:responsive-motion-web-5486a5f-20261008':'sha256:bbddf11371df3c99949d08a35bdb262ad8aa9cedcca20651e9d63e87941ace73',
}
root=pathlib.Path('C:/Users/wwwle/.codex/private-backups/pongit/responsive-20261008-r2/admission44-image-offload')
resume=sys.argv[1:]==['--verify-existing'];assert not sys.argv[1:] or resume
if resume:assert (root/'first-validation-failed.json').exists() and not (root/'report.json').exists()
else:root.mkdir(exist_ok=False)
guard='''import json,subprocess
images=IMAGES
cs=json.loads(subprocess.check_output(['docker','inspect',*subprocess.check_output(['docker','ps','-aq'],text=True).split()]))
used={c['Image'] for c in cs}
for tag,id in images.items():
 c=json.loads(subprocess.check_output(['docker','image','inspect',tag]))[0]
 assert c['Id']==id and id not in used and c['RepoTags']==[tag], 'Image still in use or identity changed'
'''.replace('IMAGES',repr(images))
def remote(code):
 r=subprocess.run(['ssh','pongit','python3','-'],input=code,text=True,capture_output=True,timeout=150)
 assert r.returncode==0,'Scoped image operation failed; preserve report'
 return r.stdout
remote(guard)
archive=root/'web-images.tar.gz'
if not resume:
 with archive.open('xb') as stream:
  subprocess.run(['ssh','pongit','docker image save '+' '.join(images)+' | gzip -1'],stdout=stream,stderr=subprocess.PIPE,check=True,timeout=240)
with archive.open('rb') as stream:digest=hashlib.file_digest(stream,'sha256').hexdigest()
with tarfile.open(archive) as package:
 entries=json.load(package.extractfile('manifest.json'));observed=set();verified=set()
 for entry in entries:
  observed.update(entry['RepoTags'])
  for name in [entry['Config'],*entry['Layers']]:assert package.getmember(name).isfile()
 for member in package:
  if member.isfile() and member.name.startswith('blobs/sha256/'):
   with package.extractfile(member) as stream:assert hashlib.file_digest(stream,'sha256').hexdigest()==member.name.split('/')[-1]
   verified.add('sha256:'+member.name.split('/')[-1])
 assert observed==set(images) and set(images.values())<=verified,'Export is not a complete exact OCI image backup'
report={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'images':images,'archiveSha256':digest,'archiveBytes':archive.stat().st_size,'offVpsVerified':True,'evicted':False}
(root/'report.json').write_text(json.dumps(report,indent=2))
result=remote(guard+"\nimport os\nfor tag in images:subprocess.run(['docker','image','rm',tag],capture_output=True,check=True)\ns=os.statvfs('/');print(json.dumps({'diskUsable':100*(s.f_blocks-s.f_bfree)/(s.f_blocks-s.f_bfree+s.f_bavail)}))\n")
report.update(evicted=True,**json.loads(result));(root/'report.json').write_text(json.dumps(report,indent=2))
print(json.dumps({k:report[k] for k in ['evicted','archiveBytes','archiveSha256','diskUsable']}))
