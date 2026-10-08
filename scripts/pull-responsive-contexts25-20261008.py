"""Verify each byte off VPS before the separate scoped removal phase."""
import pathlib,subprocess,json,hashlib,tarfile,datetime
remote='/opt/pongit/releases/responsive-20261008-r2/offload-contexts-25'
out=pathlib.Path('C:/Users/wwwle/.codex/private-backups/pongit/responsive-20261008-r2/offload-contexts-25')
assert not out.exists();out.mkdir()
for name in ['manifest.json','contexts.private.tar.gz']:subprocess.run(['scp','pongit:'+remote+'/'+name,str(out/name)],check=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
m=json.loads((out/'manifest.json').read_text());archive=out/'contexts.private.tar.gz';assert sha(archive)==m['archiveSha256']
with tarfile.open(archive) as t:
 members={x.name:x for x in t.getmembers() if x.isfile()};assert set(members)==set(m['files'])
 for name,v in m['files'].items():
  b=t.extractfile(members[name]).read();assert len(b)==v['bytes'] and hashlib.sha256(b).hexdigest()==v['sha256']
proof={'verified':True,'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'manifestSha256':sha(out/'manifest.json'),'archiveSha256':sha(archive),'files':len(m['files']),'sourceBytes':sum(v['bytes'] for v in m['files'].values())}
(out/'off-vps.json').write_text(json.dumps(proof));subprocess.run(['scp',str(out/'off-vps.json'),'pongit:'+remote+'/off-vps.json'],check=True);print(json.dumps(proof))
