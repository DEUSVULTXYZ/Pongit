"""A single bounded transfer through the existing operator database and lock."""
import json,os,pathlib,subprocess
os.umask(0o077)
root=pathlib.Path('/opt/pongit/releases/responsive-20261008-r2')
config=json.loads(pathlib.Path('/opt/pongit/releases/responsive-20261008/reserve-runtime.json').read_text())
s=config['services']['qualification']
s['image']='sha256:0085e14426dc245e32119646e64deb455f99c714862ed9c55c301fdce57c023d'
s['environment'].pop('PONG_RESPONSIVE_RESERVE',None)
s['environment']['PONG_RESPONSIVE_ADMISSION_RESERVE']='owned-admission-500-20261009'
s['volumes']=['/opt/pongit/secrets/rooms/lifecycle.json:/run/operator.json:ro',str(root/'evidence')+':/evidence',
 str(root/'live/metadata/reusable.json')+':/metadata/reusable.json:ro',
 str(root/'fund-responsive-admission-20261009.ts')+':/app/scripts/fund-responsive-admission-20261009.ts:ro']
s.update(restart='no',mem_limit='256m',cpus=.5,
 command=['timeout','--signal=TERM','--kill-after=15','180','node','--import','tsx','scripts/fund-responsive-admission-20261009.ts'])
path=root/'admission-reserve-runtime-2.json'
assert not path.exists() and not (root/'evidence/admission-reserve-2.json').exists()
with path.open('x') as f:json.dump(config,f)
name='pongit-responsive-admission-reserve-20261009-2'
subprocess.run(['docker','compose','-p','pongit-responsive-admission-reserve','-f',str(path),'run','-d','--no-deps','--name',name,'qualification'],check=True,stdout=subprocess.DEVNULL)
print(json.dumps(dict(started=name,testMon=500,timeoutSeconds=180)))
