import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {createPublicClient,http} from 'viem';
import {agentArcadeAbi as abi} from '../shared/abi-PongAgentArcade';
const m=JSON.parse(await readFile(process.env.PONG_AGENT_MANIFEST!,'utf8'));
const db=new Pool({connectionString:process.env.DATABASE_URL,max:2});
const node=createPublicClient({transport:http(m.node,{retryCount:0,timeout:10000})});
try{
 const session:any=await node.request({method:'interlude_session',params:[]} as any);
 const matches=(await db.query('SELECT id,mode,kind,status,result,publication FROM agent_arcade.matches WHERE app=$1 ORDER BY id DESC LIMIT 6',[m.app])).rows;
 for(const match of matches){const s:any=await node.readContract({address:m.app,abi,functionName:'getSnapshot',args:[BigInt(match.id)]});
  match.live={phase:String(s[2]),a:s[3],b:s[4],score:[s[12].scoreA,s[12].scoreB],elapsed:String(s[12].t),nonces:[String(s[9]),String(s[10])]};}
 const identities=(await db.query('SELECT agent,name,qualification FROM agent_arcade.identities WHERE app=$1 ORDER BY name',[m.app])).rows;
 const jobs=(await db.query('SELECT state,count(*)::int FROM agent_arcade.engine_jobs WHERE app=$1 GROUP BY state',[m.app])).rows;
 console.log(JSON.stringify({at:new Date().toISOString(),app:m.app,epoch:String(session.epoch),pendingDiffs:session.pendingDiffs.length,matches,identities,jobs},(_,v)=>typeof v==='bigint'?String(v):v));
}finally{await db.end();}
