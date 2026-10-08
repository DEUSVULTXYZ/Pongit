"""Read-only timing evidence, with no payloads, credentials or signer output."""
import datetime,json,pathlib,subprocess
root=pathlib.Path('/opt/pongit/releases/responsive-20261008-r2')
out=root/'live/evidence/admission-audit-25-attempt2.json'
assert not out.exists()
js=r'''
import {Pool} from 'pg';
import {readFile} from 'node:fs/promises';
import {decodeFunctionData} from 'viem';
import {independentRules} from './shared/independent-rules.ts';
const manifest=JSON.parse(await readFile(process.env.PONG_INDEPENDENT_MANIFEST,'utf8'));
const rules=independentRules(manifest), report={};
for(const [role,url] of [['human',process.env.PONG_INDEPENDENT_DATABASE_URL],['player',process.env.PONG_INDEPENDENT_PLAYER_DATABASE_URL]]){
 if(!url)continue;const db=new Pool({connectionString:url});
 try{
  const rows=(await db.query("SELECT id,target,data,status,created_at,updated_at FROM independent_operations WHERE created_at >= '2026-10-08T19:38:40Z' AND created_at < '2026-10-08T19:41:10Z' ORDER BY created_at LIMIT 200")).rows;
  report[role]=rows.map(({data,...r})=>{let name=data.slice(0,10);try{name=decodeFunctionData({abi:rules.lobby,data}).functionName;}catch{}return {...r,action:name};});
  if(role==='human')report.commands=(await db.query("SELECT app,epoch,match_id,action,status,updated_at FROM il_engine_jobs WHERE updated_at >= '2026-10-08T19:38:40Z' AND updated_at < '2026-10-08T19:41:10Z' AND action IN ('admit','confirmReady','start') ORDER BY updated_at LIMIT 40")).rows;
 }finally{await db.end();}
}
console.log(JSON.stringify(report));
'''
r=subprocess.run(['docker','exec','-i','pongit-relayer-1','node','--import','tsx','--input-type=module'],input=js,text=True,capture_output=True,timeout=45)
if r.returncode:raise RuntimeError('Read-only timing audit failed; no change made')
report=json.loads(r.stdout.strip().splitlines()[-1]);report['at']=datetime.datetime.now(datetime.timezone.utc).isoformat()
logs=[]
for name in ['pongit-relayer-1','pongit-arcade-five-engines-1']:
 p=subprocess.run(['docker','logs','--since','2026-10-08T19:38:40Z','--until','2026-10-08T19:41:20Z',name],text=True,capture_output=True,timeout=30)
 for line in (p.stdout+'\n'+p.stderr).splitlines():
  try:d=json.loads(line)
  except ValueError:continue
  if d.get('event') in ['arena-transition','reusable-admission-timing']:
   keys=['event','at','arena','app','epoch','match','id','previous','stage','code','ticketMs','proofMs','commandMs','totalMs']
   logs.append({k:d[k] for k in keys if k in d})
report['logs']=logs
out.write_text(json.dumps(report,indent=2));print(json.dumps({'file':str(out),'roles':list(report),'operations':{k:len(v) for k,v in report.items() if isinstance(v,list)}}))
