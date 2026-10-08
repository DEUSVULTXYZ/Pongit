"""Stop only the unreferenced archive test DB; retain its container and all data."""
import datetime,json,pathlib,subprocess
name='pongit-result-archive-test-db'
root=pathlib.Path('/opt/pongit/releases/responsive-20261008-r2')
out=root/'idle-test-db-stop-30.json';assert not out.exists()
allc=json.loads(subprocess.check_output(['docker','inspect',*subprocess.check_output(['docker','ps','-aq'],text=True).split()]))
c=next(c for c in allc if c['Name']=='/'+name);assert c['State']['Running']
assert not c['HostConfig']['PortBindings'],'Test DB must not have a published port'
aliases={name}
for net in c['NetworkSettings']['Networks'].values():
 aliases.update(net.get('Aliases') or []);aliases.add(net.get('IPAddress',''))
aliases={a for a in aliases if a and len(a)>6}
refs=[]
for other in allc:
 if other['Id']==c['Id'] or not other['State']['Running']:continue
 for value in other['Config']['Env'] or []:
  if any(a in value for a in aliases):refs.append(other['Name']);break
assert not refs,'A running service still references this test DB'
settings=dict(x.split('=',1) for x in c['Config']['Env'])
user=settings.get('POSTGRES_USER','postgres');db=settings.get('POSTGRES_DB',user)
clients=subprocess.check_output(['docker','exec',name,'psql','-U',user,'-d',db,'-Atc',"SELECT count(*) FROM pg_stat_activity WHERE backend_type='client backend' AND pid<>pg_backend_pid()"],text=True).strip()
assert clients=='0','A test client is still connected'
report={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'container':name,'image':c['Image'],'priorStartedAt':c['State']['StartedAt'],'runningDependents':refs,'otherClients':0,'mountsRetained':len(c['Mounts']),'passed':False}
out.write_text(json.dumps(report,indent=2))
subprocess.run(['docker','stop','--time','30',name],capture_output=True,check=True,timeout=45)
after=json.loads(subprocess.check_output(['docker','inspect',name]))[0]
assert not after['State']['Running'] and after['State']['ExitCode']==0 and after['Mounts']==c['Mounts']
report.update(passed=True,finishedAt=after['State']['FinishedAt'],rollback='docker start '+name)
out.write_text(json.dumps(report,indent=2));print(json.dumps(report))
