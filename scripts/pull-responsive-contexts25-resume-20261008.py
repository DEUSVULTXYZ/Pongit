"""Verify each byte off VPS before the separate scoped removal phase."""
import pathlib,subprocess,json,hashlib,tarfile,datetime
remote='/opt/pongit/releases/responsive-20261008-r2/offload-contexts-25'
out=pathlib.Path('C:/Users/wwwle/.codex/private-backups/pongit/responsive-20261008-r2/offload-contexts-25')
assert out.exists() and not (out/'off-vps.json').exists()
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
m=json.loads((out/'manifest.json').read_text());archive=out/'contexts.private.tar.gz';assert sha(archive)==m['archiveSha256']
seen=set()
with tarfile.open(archive,mode='r|gz') as t:
 for member in t:
  if not member.isfile():continue
  name=member.name;assert name in m['files'] and name not in seen;seen.add(name);v=m['files'][name]
  b=t.extractfile(member).read();assert len(b)==v['bytes'] and hashlib.sha256(b).hexdigest()==v['sha256']
assert seen==set(m['files'])
proof={'verified':True,'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'manifestSha256':sha(out/'manifest.json'),'archiveSha256':sha(archive),'files':len(m['files']),'sourceBytes':sum(v['bytes'] for v in m['files'].values())}
(out/'off-vps.json').write_text(json.dumps(proof));subprocess.run(['scp',str(out/'off-vps.json'),'pongit:'+remote+'/off-vps.json'],check=True);print(json.dumps(proof))
