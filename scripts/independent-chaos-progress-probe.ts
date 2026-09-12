// One journaled tick on a disposable candidate, including a paused rally. Used
// to distinguish unpublished engine state from a missing financial checkpoint.
import assert from 'node:assert/strict';
import {Pool} from 'pg';
import {readFile,writeFile} from 'node:fs/promises';
import {createPublicClient,http} from 'viem';
import {independentEngine} from '../relayer/src/independent-engine';
import {independentReader} from '../shared/independent-read';
import {publicIndependentManifest} from '../shared/independent';
const privateManifest=JSON.parse(await readFile(process.env.PONG_INDEPENDENT_MANIFEST!,'utf8'));assert.equal(privateManifest.production,false);assert.equal(process.env.PONG_INDEPENDENT_WRITE,'authorized-testnet');
const m=publicIndependentManifest(privateManifest),db=new Pool({connectionString:process.env.DATABASE_URL}),base=createPublicClient({transport:http(process.env.RPC_URL,{retryCount:0,timeout:10000})}),r=independentReader(base,m);
const key=JSON.parse(await readFile(process.env.ROOMS_PRESSURE_KEY_FILE!,'utf8')).privateKey;
try{for(const a of m.arenas){const b=await r.arena(a.app,'boundMatch');if(!b.id||b.mode!==1)continue;
 const e=independentEngine(db,base,a.app,a.node!,key);e.bind(b.id,b.epoch);
 const report:any={at:new Date().toISOString(),app:a.app,epoch:String(b.epoch),id:String(b.id)};
 try{const before=await e.read(),published=await r.arena(a.app,'getSnapshot',[b.id]);report.engineScore=[before.state.scoreA,before.state.scoreB];report.publishedScore=[published[12].scoreA,published[12].scoreB];await e.send('tick',[b.id]);report.accepted=true;}
 catch(error){let c:any=error;report.accepted=false;report.errors=[];for(let n=0;c&&n<8;n++,c=c.cause)report.errors.push(String(c.details||c.shortMessage||c.message).split('\n')[0].replace(/0x[\da-f]{130,}/gi,'[signed data omitted]').slice(0,700));}
 finally{e.stop();}
 await writeFile('artifacts/independent-candidate/chaos-progress-probe.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}}finally{await db.end();}
