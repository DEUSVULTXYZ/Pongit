"""One bounded, idempotent role-reserve worker using the original nonce authority."""
import json,os,pathlib,subprocess
os.umask(0o077)
root=pathlib.Path('/opt/pongit/releases/responsive-20261008-r2')
config=json.loads(pathlib.Path('/opt/pongit/releases/responsive-20261008/reserve-runtime.json').read_text())
s=config['services']['qualification']
s['image']='sha256:0085e14426dc245e32119646e64deb455f99c714862ed9c55c301fdce57c023d'
s['environment'].pop('PONG_RESPONSIVE_RESERVE',None)
s['environment']['PONG_RESPONSIVE_SOAK_RESERVE']='owned-roles-900-20261009'
s['volumes']=['/opt/pongit/secrets/rooms/lifecycle.json:/run/operator.json:ro',str(root/'evidence')+':/evidence',
 str(root/'live/metadata/reusable.json')+':/metadata/reusable.json:ro',
 str(root/'fund-responsive-soak-roles-20261009.ts')+':/app/scripts/fund-responsive-soak-roles-20261009.ts:ro']
s.update(restart='no',mem_limit='256m',cpus=.5,
 command=['timeout','--signal=TERM','--kill-after=15','240','node','--import','tsx','scripts/fund-responsive-soak-roles-20261009.ts'])
path=root/'soak-role-reserve-runtime-1.json'
assert not path.exists() and not (root/'evidence/soak-role-reserve-1.json').exists()
with path.open('x') as f:json.dump(config,f)
name='pongit-responsive-soak-role-reserve-20261009-1'
subprocess.run(['docker','compose','-p','pongit-responsive-soak-role-reserve','-f',str(path),'run','-d','--no-deps','--name',name,'qualification'],check=True,stdout=subprocess.DEVNULL)
print(json.dumps(dict(started=name,testMon=900,timeoutSeconds=240)))
