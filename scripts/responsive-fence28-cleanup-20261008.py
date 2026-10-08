"""Remove only untagged, unused PONGIT frontend build stages, never runtime images."""
import datetime,json,pathlib,re,subprocess
root=pathlib.Path('/opt/pongit/releases/responsive-20261008-r2')
output=root/'fence28-image-cleanup.json';assert not output.exists()
docker=lambda *args:subprocess.check_output(['docker',*args],text=True,timeout=60)
ids=docker('images','--filter','dangling=true','-q').split()
containers=docker('ps','-aq').split()
used={x['Image'] for x in json.loads(docker('inspect',*containers))}
protected=set(used)
for directory in [root/'live',pathlib.Path('/opt/pongit/current')]:
 for p in directory.iterdir():
  if p.is_file() and p.suffix in ['.json','.yaml','.yml']:
   protected.update(re.findall(r'sha256:[0-9a-f]{64}',p.read_text()))
report={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'selected':[],'removed':[],'protected':len(protected),'passed':False}
for im in (json.loads(docker('image','inspect',*ids)) if ids else []):
 env=set(im['Config'].get('Env') or [])
 if not im.get('RepoTags') and im['Id'] not in protected and 'NEXT_PUBLIC_RP_ID=pongit.xyz' in env and 'NEXT_PUBLIC_API_URL=https://pongit.xyz/api' in env:
  report['selected'].append({'id':im['Id'],'bytes':im['Size'],'created':im['Created']})
output.write_text(json.dumps(report,indent=2))
for row in report['selected']:
 # Docker refuses referenced layers; no force, prune, container or volume removal.
 r=subprocess.run(['docker','image','rm',row['id']],capture_output=True,text=True,timeout=60)
 if r.returncode==0:report['removed'].append(row['id'])
 output.write_text(json.dumps(report,indent=2))
report['passed']=True;output.write_text(json.dumps(report,indent=2))
print(json.dumps({'selected':len(report['selected']),'removed':len(report['removed']),'protected':len(protected)}))
