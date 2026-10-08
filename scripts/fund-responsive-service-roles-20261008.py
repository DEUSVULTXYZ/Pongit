"""One bounded transfer worker through the original operator journal."""
import json,os,pathlib,subprocess
os.umask(0o077)
root=pathlib.Path('/opt/pongit/releases/responsive-20261008-r2')
config=json.loads(pathlib.Path('/opt/pongit/releases/responsive-20261008/reserve-runtime.json').read_text())
service=config['services']['qualification']
service['image']='sha256:0085e14426dc245e32119646e64deb455f99c714862ed9c55c301fdce57c023d'
service['environment'].pop('PONG_RESPONSIVE_RESERVE',None)
service['environment']['PONG_RESPONSIVE_ROLE_RESERVE']='owned-archive-sponsor-100-each'
service['volumes']=['/opt/pongit/secrets/rooms/lifecycle.json:/run/operator.json:ro',str(root/'evidence')+':/evidence',
 str(root/'live/metadata/reusable.json')+':/metadata/reusable.json:ro',
 str(root/'fund-responsive-service-roles-20261008.ts')+':/app/scripts/fund-responsive-service-roles-20261008.ts:ro']
service['restart']='no';service['mem_limit']='384m';service['cpus']=.5
service['command']=['timeout','--signal=TERM','--kill-after=15','180','node','--import','tsx','scripts/fund-responsive-service-roles-20261008.ts']
path=root/'role-reserve-runtime-1.json'
assert not path.exists() and not (root/'evidence/role-reserve-1.json').exists()
with path.open('x') as f:json.dump(config,f)
name='pongit-responsive-roles-reserve-20261008-1'
subprocess.run(['docker','compose','-p','pongit-responsive-roles-reserve','-f',str(path),'run','-d','--no-deps','--name',name,'qualification'],check=True,stdout=subprocess.DEVNULL)
print(json.dumps(dict(started=name,testMon=200,timeoutSeconds=180)))
