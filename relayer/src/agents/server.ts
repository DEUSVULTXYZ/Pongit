import {createServer,type IncomingMessage,type ServerResponse} from 'node:http';
import {randomUUID} from 'node:crypto';
import {isIP} from 'node:net';
import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {recoverTypedDataAddress,type Address,type Hex} from 'viem';
import {z} from 'zod';
import {agentArcadeAbi as abi} from '../../../shared/abi-PongAgentArcade';
import {agentRegistrationTypes,validateAgentManifest,type AgentManifest,type AgentProfile} from '../../../shared/agents';
import {initializeAgents} from './schema';
import {createAgentCoordinator} from './coordinator';
import {createAgentAuth} from './auth';
import {agentMetrics} from './metrics';
import {checkRegistration,engineSeesStrategy,strategyAttempts,strategyRequeue,STRATEGY_RETRIES,vetStrategy} from './strategies';

const address=z.string().regex(/^0x[\da-fA-F]{40}$/).transform(s=>s.toLowerCase() as Address);
const uuid=z.string().uuid(),proof=z.string().regex(/^0x[\da-fA-F]{130}$/);
const json=(v:unknown)=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?String(x):x);
const send=(res:ServerResponse,value:unknown,status=200)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(json(value));};
async function body(req:IncomingMessage){let size=0;const parts:Buffer[]=[];for await(const part of req){size+=part.length;if(size>32768)throw Object.assign(Error('Request too large'),{status:413});parts.push(part);}
 try{return JSON.parse(Buffer.concat(parts).toString()||'{}');}catch{throw Object.assign(Error('The request body is not JSON'),{status:400,code:'AGENT_REQUEST_INVALID'});}}
// realtimeAgents: whether a creator may register a hosted real-time agent. Each one sends its own
// inputs and ticks, measured at about 115 hub batches a minute while it plays, against 6 for the
// whole house league; an epoch holds about 1,400 before its stake can no longer be released.
// On-chain strategies cost nothing extra and are always open.
export async function startAgentService(options:{db:Pool;manifest:AgentManifest;key:Hex;rpcUrl:string;port:number;host?:string;origin:string;houseAddresses?:string[];trustProxy?:boolean;realtimeAgents?:boolean;
 graphql?:(query:string,variables:unknown)=>Promise<any>;
 dependencies?:{coordinator:ReturnType<typeof createAgentCoordinator>;auth:ReturnType<typeof createAgentAuth>}}){
 const {db}=options,m=validateAgentManifest(options.manifest),app=m.app.toLowerCase();
 await initializeAgents(db);
 const leader=await db.connect();if(!(await leader.query('SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS ok',[`agent-service:${app}`])).rows[0].ok){leader.release();throw Error('Agent service already owns this app');}
 const coordinator=options.dependencies?.coordinator??createAgentCoordinator(db,m,abi,options.key,options.rpcUrl,options.graphql),auth=options.dependencies?.auth??createAgentAuth(db,coordinator.base,m,abi,async key=>await coordinator.client.read('controlBinding',[key]) as bigint);
 const limits=new Map<string,{count:number;until:number}>();
 const rate=(key:string,max:number)=>{const now=Date.now();let r=limits.get(key);if(!r||r.until<now){r={count:0,until:now+60000};limits.set(key,r);}if(++r.count>max)throw Object.assign(Error('Please wait before trying again'),{status:429,code:'AGENT_API_LIMIT',retryAt:r.until});};
 const ref=(id:string,epoch=m.epoch,contract=m.app)=>({chainId:10143 as const,app:contract,epoch:String(epoch),id});
 const house=new Set((options.houseAddresses||[]).map(s=>s.toLowerCase()));
 const rankings=new Map<number,{at:number;value:any;pending?:Promise<any>}>();
 async function ranking(mode:number){
  let entry=rankings.get(mode);if(!entry){entry={at:0,value:null};rankings.set(mode,entry);}
  if(entry.value&&Date.now()-entry.at<30000)return entry.value;if(entry.pending)return entry.pending;
  const cached=entry;cached.pending=(async()=>{
   const entries=(await db.query(`SELECT i.agent,i.name,i.avatar,i.creator,r.live,r.published,r.observed_at FROM agent_arcade.identities i
    LEFT JOIN agent_arcade.ratings r ON r.app=i.app AND r.agent=i.agent AND r.mode=$2
    WHERE i.app=$1 AND i.qualification->>$3='qualified'`,[app,mode,String(mode)])).rows;
   entries.sort((a,b)=>Number((b.live??b.published as any)?.elo??1000)-Number((a.live??a.published as any)?.elo??1000)||a.agent.localeCompare(b.agent));
   return cached.value={mode,entries,observedAt:new Date(cached.at=Date.now()).toISOString()};
  })().finally(()=>{cached.pending=undefined;});return cached.pending;
 }
 async function catalog():Promise<AgentProfile[]>{
  const rows=(await db.query(`SELECT i.*,p.available,p.seen,o.match_id FROM agent_arcade.identities i LEFT JOIN agent_arcade.presence p ON p.app=i.app AND p.player=i.agent
   LEFT JOIN agent_arcade.occupancy o ON o.app=i.app AND o.player=i.agent WHERE i.app=$1
   ORDER BY CASE i.kind WHEN 'pongit' THEN 0 WHEN 'strategy' THEN 1 ELSE 2 END,i.name,i.agent LIMIT 500`,[app])).rows;
  // A strategy is a contract on Monad: it is always there to play.
  return rows.map(r=>({agent:r.agent,creator:r.creator,name:r.name,avatar:r.avatar,kind:r.kind,modes:([0,1] as const).filter(mode=>r.modes&(1<<mode)),
   qualification:r.qualification,available:r.kind==='strategy'||!!r.available&&Date.now()-new Date(r.seen).getTime()<30000,...(r.match_id?{playing:ref(r.match_id)}:{}),createdAt:r.created_at}));
 }
 // kind_a and kind_b say who drives each seat, so a client knows whether anyone but the
 // coordinator needs to tick: only a real-time community agent does.
 async function ownMatch(player:string){return(await db.query(`SELECT m.*,ia.kind AS kind_a,ib.kind AS kind_b FROM agent_arcade.occupancy o JOIN agent_arcade.matches m ON m.id=o.match_id
  LEFT JOIN agent_arcade.identities ia ON ia.app=m.app AND ia.agent=m.a LEFT JOIN agent_arcade.identities ib ON ib.app=m.app AND ib.agent=m.b WHERE o.app=$1 AND o.player=$2`,[app,player])).rows[0];}
 const realtimeAgents=options.realtimeAgents??true;
 const server=createServer(async(req,res)=>{
  const requestId=randomUUID();res.setHeader('x-request-id',requestId);
  try{
   // Browser requests are same-origin; developers use the SDK directly. Never
   // accept a credentialed request from an unrelated web origin.
   if(req.headers.origin&&req.headers.origin!==options.origin)throw Object.assign(Error('Origin not allowed'),{status:403});
   const url=new URL(req.url||'/',options.origin),path=url.pathname.replace(/^\/agents(?=\/|$)/,'')||'/';
   const forwarded=req.headers['x-real-ip'];const ip=options.trustProxy&&typeof forwarded==='string'&&isIP(forwarded)?forwarded:req.socket.remoteAddress;
   rate(`ip:${ip}`,1200);
   if(req.method==='GET'&&path==='/health'){send(res,{process:'alive',game:coordinator.health()});return;}
   if(req.method==='GET'&&path==='/config'){send(res,{...m,registration:{strategies:true,realtimeAgents},health:coordinator.health()});return;}
   if(req.method==='GET'&&path==='/catalog'){send(res,{agents:await catalog(),health:coordinator.health()});return;}
   if(req.method==='GET'&&path==='/live'){
    const matches=(await db.query("SELECT id,app,epoch,mode,a,b,ranked,status,result FROM agent_arcade.matches WHERE app=$1 AND status IN ('active','publishing') ORDER BY id DESC LIMIT 2",[app])).rows;
    send(res,{matches:matches.map(x=>({...x,ref:ref(x.id)})),health:coordinator.health()});return;
   }
   if(req.method==='GET'&&path==='/history'){
    const player=address.parse(url.searchParams.get('player'));
    const matches=(await db.query(`SELECT m.id,m.app,m.epoch,m.mode,m.a,m.b,m.ranked,m.result,m.publication,m.updated_at,r.availability
     FROM agent_arcade.matches m LEFT JOIN agent_arcade.replays r ON r.match_id=m.id WHERE m.status='complete' AND (a=$1 OR b=$1) ORDER BY m.updated_at DESC,m.id DESC LIMIT 3`,[player])).rows;
    send(res,{matches:matches.map(x=>({...x,ref:ref(x.id,x.epoch,x.app),replayAvailable:x.availability==='available'}))});return;
   }
   if(req.method==='GET'&&path==='/replay'){
    const id=z.string().regex(/^[1-9]\d*$/).parse(url.searchParams.get('id')),contract=address.parse(url.searchParams.get('app'));
    const epoch=z.string().regex(/^[1-9]\d*$/).parse(url.searchParams.get('epoch'));
    const match=(await db.query('SELECT id,epoch,app,status FROM agent_arcade.matches WHERE id=$1 AND epoch=$2 AND app=$3',[id,epoch,contract])).rows[0];
    if(!match){send(res,{error:'Agent match not found'},404);return;}
    send(res,{ref:ref(id,epoch,contract),...await coordinator.replays.read(id)});return;
   }
   if(req.method==='GET'&&path==='/rankings'){
    const mode=z.coerce.number().int().min(0).max(1).parse(url.searchParams.get('mode')||0);
    send(res,await ranking(mode));return;
   }
   if(req.method==='POST'&&path==='/auth/challenge'){rate(`auth:${ip}`,30);send(res,await auth.challenge(await body(req)));return;}
   if(req.method==='POST'&&path==='/auth/session'){rate(`auth:${ip}`,30);send(res,await auth.session(await body(req)));return;}
   if(req.method==='POST'&&path==='/register'){
    if((await db.query('SELECT admissions FROM agent_arcade.control WHERE app=$1',[app])).rows[0]?.admissions===false)throw Object.assign(Error('Agent registrations wait for engine renewal'),{status:503,code:'AGENT_RENEWING'});
    rate(`register:${ip}`,6);
    // No agentProof: an on-chain strategy. A contract cannot sign, so it vouches for itself by
    // naming its creator, whose signature is the only one required.
    const r=z.object({creator:address,agent:address,name:z.string(),avatar:z.number().int(),modes:z.number().int().min(1).max(3),expires:z.coerce.bigint().min(0n).max((1n<<64n)-1n),
     creatorProof:proof.transform(s=>s as Hex),agentProof:proof.transform(s=>s as Hex).optional()}).parse(await body(req));
    const strategy=r.agentProof===undefined;
    if(!strategy&&!realtimeAgents&&!house.has(r.agent))throw Object.assign(Error('Hosted real-time agents are closed here. Publish an on-chain strategy instead'),{status:403,code:'AGENT_REALTIME_CLOSED'});
    // Everything the contract would refuse that the request itself shows, as a 400, before any
    // read or write: the engine's rehearsal is then left with only what the chain knows.
    const metadata=checkRegistration(r,BigInt(Math.floor(Date.now()/1000)),house.has(r.agent)),registration={creator:r.creator,agent:r.agent,modes:r.modes,metadata,expires:r.expires};
    const domain={name:'PONGIT Agent Arcade',version:'1',chainId:10143,verifyingContract:m.app};
    // A proof of the right shape can still be no signature at all (r or s zero, r off the curve):
    // the recovery throws, and that is the caller's input, not an outage.
    const recover=(signature:Hex|undefined)=>signature?recoverTypedDataAddress({domain,types:agentRegistrationTypes,primaryType:'AgentRegistration',message:registration,signature})
     .catch(()=>{throw Object.assign(Error('A registration proof is not a valid signature'),{status:403,code:'AGENT_REGISTRATION_SIGNATURE'});}):undefined;
    const [creator,agent]=await Promise.all([r.creatorProof as Hex,r.agentProof as Hex|undefined].map(recover));
    if(creator?.toLowerCase()!==r.creator||!strategy&&agent?.toLowerCase()!==r.agent)throw Object.assign(Error(strategy?'The creator must sign the strategy registration':'Both owners must sign the agent registration'),{status:403,code:'AGENT_REGISTRATION_SIGNATURE'});
    if(strategy&&house.has(r.agent))throw Object.assign(Error('A house bot is not a strategy'),{status:403,code:'AGENT_REGISTRATION_SIGNATURE'});
    const current=await coordinator.client.read('agentIdentity',[r.agent]) as readonly [Address,number,number,Hex];
    const fresh=BigInt(current[0])===0n,agentProof=r.agentProof??'0x';
    if(fresh){
     if(strategy){
      await vetStrategy(coordinator.base,r.agent,r.creator);
      await engineSeesStrategy(()=>coordinator.client.node.simulateContract({address:m.app,abi,functionName:'registerAgent',args:[registration,r.creatorProof,agentProof],account:m.coordinator}),
       {baseBlock:BigInt((await coordinator.client.status()).baseBlock),expires:r.expires,clock:async()=>(await coordinator.client.node.getBlock()).timestamp});
     }
     // A refusal the engine confirmed is final for this signature: its operation is spent, a fresh one's is not.
     await coordinator.writer.send(`register:${r.agent}:${r.expires}`,'registerAgent',[registration,r.creatorProof,agentProof]).catch(e=>{
      if((e as {code?:string}).code==='AGENT_ACTION_REVERTED')throw Object.assign(Error('The arcade refused this registration; sign a fresh one'),{status:409,code:'AGENT_REGISTRATION_REFUSED'});throw e;});
    }
    else{
     if(current[0].toLowerCase()!==r.creator||current[1]!==r.modes||current[3]!==metadata)throw Object.assign(Error('This agent identity is already registered'),{status:409,code:'AGENT_ALREADY_REGISTERED'});
     // Anyone can register on the engine directly, and agentIdentity does not say whether it
     // filed a strategy or a key. Only a vetted contract naming its creator is filed as a
     // strategy here: a key has no code, and one delegating to code (EIP-7702) is refused by name.
     if(strategy)await vetStrategy(coordinator.base,r.agent,r.creator);
    }
    // A strategy has no session to ask for its own qualification, so it is queued at once; its
    // creator signing the same registration again queues any mode that has to be retried, as
    // often as strategyRequeue allows.
    const modes=[0,1].filter(mode=>r.modes&(1<<mode)),kind=house.has(r.agent)?'pongit':strategy?'strategy':'community';
    await db.query(`INSERT INTO agent_arcade.identities(app,agent,creator,name,avatar,kind,modes,qualification) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(app,agent) DO NOTHING`,
     [app,r.agent,r.creator,r.name,r.avatar,kind,r.modes,Object.fromEntries(modes.map(mode=>[mode,strategy?'queued':'registered']))]);
    let held:number|undefined;
    if(strategy)for(const mode of modes){
     const before=(await db.query("SELECT qualification->>$3 AS state FROM agent_arcade.identities WHERE app=$1 AND agent=$2 AND kind='strategy'",[app,r.agent,String(mode)])).rows[0];
     if(!before)break;
     const verdict=strategyRequeue(before.state,await strategyAttempts(db,app,r.agent,mode)),next=verdict.queue?'queued':verdict.retryAt!==undefined?'failed':undefined;
     // Set only over the state just read, so two registrations at once act on it once.
     if(next)await db.query(`UPDATE agent_arcade.identities SET qualification=jsonb_set(qualification,ARRAY[$3],to_jsonb($5::text)) WHERE app=$1 AND agent=$2 AND kind='strategy' AND qualification->>$3=$4`,
      [app,r.agent,String(mode),before.state,next]);
     if(verdict.retryAt!==undefined)held=Math.min(held??Infinity,verdict.retryAt);
    }
    const row=(await db.query('SELECT kind,qualification FROM agent_arcade.identities WHERE app=$1 AND agent=$2',[app,r.agent])).rows[0];
    if(held!==undefined&&!modes.some(mode=>['queued','testing'].includes(row.qualification[mode])))
     throw Object.assign(Error(`This strategy has used its ${STRATEGY_RETRIES} retries; register it again after ${new Date(held*1000).toISOString()}`),{status:429,code:'AGENT_STRATEGY_COOLDOWN',retryAt:Math.ceil(held*1000)});
    send(res,{agent:r.agent,kind:row.kind,qualification:row.qualification});return;
   }
   const session=await auth.require(req),player=session.player;rate(`account:${player}`,300);
   if(req.method==='GET'&&path==='/me'){
    const match=await ownMatch(player);let accepted:string[]=[];
    if(match){const snapshot=await coordinator.feed.read(BigInt(match.id));
     // MatchAccepted events are not inferred from participant membership. Phase
     // 2 proves both consents; a phase-1 peer retries through nonce recovery.
     if(snapshot.phase>=2)accepted=[match.a,match.b];}
    // The player's own qualification, so a client in a qualification match knows whether the
    // trial is its own or its opponent's, and plays the reconnect ritual only for itself.
    const own=(await db.query('SELECT qualification FROM agent_arcade.identities WHERE app=$1 AND agent=$2',[app,player])).rows[0];
    send(res,{player,qualification:own?.qualification??null,match:match?{...match,ref:ref(match.id),accepted}:null,
     request:(await db.query("SELECT id,agent,mode,status,match_id FROM agent_arcade.challenges WHERE app=$1 AND player=$2 ORDER BY created_at DESC LIMIT 1",[app,player])).rows[0],health:coordinator.health()});return;
   }
   if(req.method==='POST'&&path==='/availability'){
    const {available}=z.object({available:z.boolean()}).parse(await body(req));
    if(!(await db.query('SELECT 1 FROM agent_arcade.identities WHERE app=$1 AND agent=$2',[app,player])).rowCount)throw Error('Register this agent first');
    await db.query(`INSERT INTO agent_arcade.presence(app,player,available) VALUES($1,$2,$3) ON CONFLICT(app,player) DO UPDATE SET available=$3,seen=now()`,[app,player,available]);send(res,{available});return;
   }
   if(req.method==='POST'&&path==='/heartbeat'){await db.query('UPDATE agent_arcade.presence SET seen=now() WHERE app=$1 AND player=$2',[app,player]);send(res,{ok:true});return;}
   if(req.method==='POST'&&path==='/qualification'){
    const {mode}=z.object({mode:z.number().int().min(0).max(1)}).parse(await body(req));
    // A strategy is queued only by its creator's registration, which bounds its retries.
    const updated=await db.query(`UPDATE agent_arcade.identities SET qualification=jsonb_set(qualification,ARRAY[$3],to_jsonb('queued'::text))
      WHERE app=$1 AND agent=$2 AND kind<>'strategy' AND (modes & $4)>0 AND COALESCE(qualification->>$3,'')<>'qualified' RETURNING agent`,[app,player,String(mode),1<<mode]);
    send(res,{mode,status:updated.rowCount?'queued':'unchanged'});return;
   }
   if(req.method==='POST'&&path==='/qualification/checkpoint'){
    const match=await ownMatch(player);
    if(!match||match.kind!=='qualification')throw Object.assign(Error('No qualification match is active'),{status:409});
    const snapshot=await coordinator.feed.read(BigInt(match.id),true);
    const nonce=player===snapshot.a.toLowerCase()?snapshot.nonceA:snapshot.nonceB;
    if(snapshot.phase!==2||nonce<2n)throw Object.assign(Error('Play valid controls before the reconnect checkpoint'),{status:409});
    const check=(await db.query('SELECT * FROM agent_arcade.qualification_checks WHERE match_id=$1 AND player=$2',[match.id,player])).rows[0];
    if(!check)await db.query('INSERT INTO agent_arcade.qualification_checks(match_id,player,initial_token,initial_nonce) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[match.id,player,session.tokenHash,String(nonce)]);
    else if(check.initial_token!==session.tokenHash&&!check.resumed_token)await db.query('UPDATE agent_arcade.qualification_checks SET resumed_token=$3,resumed_nonce=$4,resumed_at=now() WHERE match_id=$1 AND player=$2 AND resumed_token IS NULL',[match.id,player,session.tokenHash,String(nonce)]);
    send(res,{match:ref(match.id),resumed:!!check&&check.initial_token!==session.tokenHash,nonce:String(nonce)});return;
   }
   if(req.method==='POST'&&path==='/challenges'){
    const r=z.object({agent:address,mode:z.number().int().min(0).max(1),operation:uuid}).parse(await body(req));
    if(r.agent===player)throw Error('Choose another agent');rate(`challenge:${player}`,12);
    const target=(await catalog()).find(x=>x.agent===r.agent&&x.qualification[r.mode as 0|1]==='qualified');
    if(!target?.available)throw Error('This agent is currently unavailable');
    const existing=(await db.query('SELECT * FROM agent_arcade.challenges WHERE app=$1 AND player=$2 AND operation=$3',[app,player,r.operation])).rows[0];
    if(existing){send(res,existing);return;}
    // Reserve the next duel as soon as the engine has ended this one. Its old
    // occupancy still waits for publication, so no two matches can start.
    const previous=await ownMatch(player);
    if(previous){const ended=await coordinator.feed.read(BigInt(previous.id),true);
     if(ended.phase>=3)await db.query("UPDATE agent_arcade.challenges SET status='completing' WHERE app=$1 AND player=$2 AND match_id=$3 AND status IN ('offered','active')",[app,player,previous.id]);}
    const id=randomUUID();try{await db.query('INSERT INTO agent_arcade.challenges(id,app,player,agent,mode,operation) VALUES($1,$2,$3,$4,$5,$6)',[id,app,player,r.agent,r.mode,r.operation]);}
    catch(e){if((e as any).code==='23505'){
     const duplicate=(await db.query('SELECT * FROM agent_arcade.challenges WHERE app=$1 AND player=$2 AND operation=$3',[app,player,r.operation])).rows[0];
     if(duplicate){send(res,duplicate);return;}throw Object.assign(Error('You already have an Agent Arcade challenge'),{status:409});}throw e;}
    send(res,{id,status:'waiting',agent:r.agent,mode:r.mode});return;
   }
   if(req.method==='POST'&&path==='/challenges/cancel'){
    const {id}=z.object({id:uuid}).parse(await body(req));const row=(await db.query("UPDATE agent_arcade.challenges SET status='cancelled' WHERE app=$1 AND player=$2 AND id=$3 AND status='waiting' RETURNING id",[app,player,id])).rows[0];
    if(!row)throw Error('Read the offered match before leaving; a submitted match cannot be cancelled here');send(res,{id,status:'cancelled'});return;
   }
   if(req.method==='POST'&&path==='/disconnect'){
    await db.query('DELETE FROM agent_arcade.sessions WHERE token_hash=$1',[session.tokenHash]);await db.query('UPDATE agent_arcade.presence SET available=false WHERE app=$1 AND player=$2',[app,player]);send(res,{ok:true});return;
   }
   send(res,{error:'Agent Arcade route not found'},404);
  }catch(e){const error=e as any,fields=error instanceof z.ZodError;const status=fields?400:error.status??(String(error.code)==='23505'?409:503);
   // A request that can never succeed must not read as an outage: 503 is for the service alone.
   send(res,{error:fields?`Check the submitted fields: ${[...new Set(error.issues.map((x:any)=>x.path.join('.')||'request'))].join(', ')}`:String(error.shortMessage||error.message||'Agent Arcade unavailable').split('\n')[0].replace(/0x[\da-f]{64,}/gi,'[omitted]').slice(0,240),
    code:error.code??(status===400?'AGENT_REQUEST_INVALID':status===503?'AGENT_SERVICE_UNAVAILABLE':'AGENT_REQUEST_REFUSED'),source:'agent_arcade',retryAt:error.retryAt,requestId},status);}
 });
 await new Promise<void>(resolve=>server.listen(options.port,options.host??'127.0.0.1',resolve));
 const timer=setInterval(()=>void coordinator.cycle(),500),cleanup=setInterval(()=>{
  const now=Date.now();for(const [key,value] of limits)if(value.until<now)limits.delete(key);
  void db.query('DELETE FROM agent_arcade.auth_nonces WHERE expires<$1;',[Math.floor(now/1000)]).catch(()=>{});
  void db.query('DELETE FROM agent_arcade.sessions WHERE expiry<$1',[Math.floor(now/1000)]).catch(()=>{});
 },60000);
 let closing:Promise<void>|undefined;
 return {server,coordinator,close(){return closing??=(async()=>{clearInterval(timer);clearInterval(cleanup);await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));await coordinator.stop();await leader.query('SELECT pg_advisory_unlock(hashtextextended($1,0))',[`agent-service:${app}`]);leader.release();})();}};
}
if(process.env.PONG_AGENT_SERVICE==='1'){
 const closeMetrics=process.env.PONG_AGENT_DIAGNOSTICS?await agentMetrics(process.env.PONG_AGENT_DIAGNOSTICS,'service'):async()=>{};
 const manifest=JSON.parse(await readFile(process.env.PONG_AGENT_MANIFEST!,'utf8'));
 const secrets=JSON.parse(await readFile(process.env.PONG_AGENT_KEYS!,'utf8'));
 const db=new Pool({connectionString:process.env.DATABASE_URL,max:8});
 const graphql=process.env.GRAPHQL_URL?async(query:string,variables:unknown)=>{
  const response=await fetch(process.env.GRAPHQL_URL!,{method:'POST',headers:{'content-type':'application/json',...(process.env.HASURA_ADMIN_SECRET?{'x-hasura-admin-secret':process.env.HASURA_ADMIN_SECRET}:{})},body:JSON.stringify({query,variables}),signal:AbortSignal.timeout(10000)});
  const result=await response.json();if(!response.ok||result.errors)throw Error('Shared replay index is unavailable');return result.data;
 }:undefined;
 if(manifest.enabled&&manifest.qualified&&!graphql)throw Error('Public Agent Arcade requires shared replay retention');
 const service=await startAgentService({db,manifest,key:secrets.coordinator,rpcUrl:process.env.RPC_URL!,port:Number(process.env.PORT||4100),host:process.env.HOST||'127.0.0.1',origin:'https://pongit.xyz',houseAddresses:secrets.bots.map((b:any)=>b.address),trustProxy:process.env.TRUST_PROXY==='true',graphql,
  // Closed by default once the arcade is public; the private laboratory keeps them for its community agent.
  realtimeAgents:process.env.PONG_AGENT_REALTIME?process.env.PONG_AGENT_REALTIME==='open':!(manifest.enabled&&manifest.qualified)});
 process.once('SIGTERM',()=>void service.close().then(()=>db.end()).then(closeMetrics));
}
