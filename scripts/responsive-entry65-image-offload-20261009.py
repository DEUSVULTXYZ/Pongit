"""Preserve exact unused web60/61 images; keep current64 and rollback62/63."""
import datetime,hashlib,json,pathlib,shutil,subprocess,tarfile
root=pathlib.Path('C:/Users/wwwle/.codex/private-backups/pongit/responsive-20261008-r2/entry65-image-offload')
root.mkdir(exist_ok=False)
images={};copies=[]
for number in [60,61]:
 source=pathlib.Path(f'artifacts/responsive-20261008-r2/web{number}-local')
 build=json.loads((source/'build.json').read_text());assert build['passed']
 archive=root/f'web{number}.tar.gz';shutil.copyfile(source/'web-image.tar.gz',archive)
 with archive.open('rb') as stream:assert hashlib.file_digest(stream,'sha256').hexdigest()==build['imageArchiveSha256']
 assert archive.stat().st_size==build['imageArchiveBytes']
 with tarfile.open(archive) as package:
  entries=json.load(package.extractfile('manifest.json'));verified=set()
  assert {tag for e in entries for tag in e['RepoTags']}=={build['tag']}
  for e in entries:
   for name in [e['Config'],*e['Layers']]:assert package.getmember(name).isfile()
  for member in package:
   if member.isfile() and member.name.startswith('blobs/sha256/'):
    with package.extractfile(member) as stream:assert hashlib.file_digest(stream,'sha256').hexdigest()==member.name.split('/')[-1]
    verified.add('sha256:'+member.name.split('/')[-1])
  assert build['image'] in verified
 images[build['tag']]=build['image'];copies.append({'file':archive.name,'sha256':build['imageArchiveSha256'],'source':build['source']})
report={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'images':images,'copies':copies,'offVpsVerified':True,'evicted':False}
(root/'report.json').write_text(json.dumps(report,indent=2))
code='''import json,subprocess,os
images=IMAGES
containers=json.loads(subprocess.check_output(['docker','inspect',*subprocess.check_output(['docker','ps','-aq'],text=True).split()]))
used={c['Image'] for c in containers}
for tag,expected in images.items():
 c=json.loads(subprocess.check_output(['docker','image','inspect',tag]))[0]
 assert c['Id']==expected and expected not in used and c['RepoTags']==[tag]
for tag in images:subprocess.run(['docker','image','rm',tag],capture_output=True,check=True)
s=os.statvfs('/');print(json.dumps({'diskUsable':100*(s.f_blocks-s.f_bfree)/(s.f_blocks-s.f_bfree+s.f_bavail)}))
'''.replace('IMAGES',repr(images))
result=subprocess.run(['ssh','pongit','python3','-'],input=code,text=True,capture_output=True,timeout=150)
assert result.returncode==0,'Scoped eviction failed; inspect exact report before retry'
report.update(evicted=True,**json.loads(result.stdout));(root/'report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
