import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {isIP} from 'node:net';
import {createPublicClient,http} from 'viem';
import {monadTestnet} from 'viem/chains';
import {AgentPoolReader,poolJson} from './pool-read';
import {poolRoutes} from './pool-api';
import {PoolNotifications} from './pool-notifications';
import {measuredFetch,recordRpc} from '../../../shared/rpc-metrics';
import {agentMetrics} from './metrics';
import {readPoolSignedBody,type poolSponsorRoutes} from './pool-sponsor';
import {Pool} from 'pg';
import {PoolReplays,initializePoolReplays,poolReplayRetention} from './pool-replays';
import {publicChainReadBody,publicChainReads} from '../public-chain-read';

// Dedicated version-2 process. Never starts the legacy single-application
// coordinator and never loads an operator key. A private qualification endpoint
// is bound to loopback unless an isolated Docker network is explicitly selected.
export function startPoolReadService(reader:AgentPoolReader,options:{host:string;port:number;public:boolean;trustedProxies?:string[];sponsor?:ReturnType<typeof poolSponsorRoutes>;sponsorHealth?:()=>{available:boolean;error?:string;code?:string};replays?:PoolReplays}){
 const routes=poolRoutes(reader,undefined,options.replays),rates=new Map<string,{until:number;n:number}>();
 const events=new PoolNotifications(routes,options.public);
 const chainRead=publicChainReads(reader.client),chainRates=new Map<string,{until:number;n:number}>();
 const normalize=(value:string)=>value.replace(/^::ffff:/,'');
 const proxies=new Set((options.trustedProxies??[]).map(normalize));let global={until:0,n:0};
 const server=createServer(async(req,res)=>{
  const began=Date.now();let metric='agents.other';
  res.once('finish',()=>recordRpc({at:began,target:'pongit',method:metric,status:res.statusCode,ms:Date.now()-began,source:'network'}));
  const requestId=randomUUID();res.setHeader('X-Request-Id',requestId);res.setHeader('Content-Type','application/json');
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  const send=(data:unknown,status=200)=>{res.statusCode=status;res.end(poolJson(data));};
  try{
   if(!req.url||req.url.length>512)throw Object.assign(Error('Invalid request URL'),{status:400});
   const remote=normalize(req.socket.remoteAddress??'unknown');let ip=remote;const now=Date.now();
   // Trust only the configured immediate proxy, and its appended final hop.
   // A direct client cannot choose another user's budget via this header.
   if(proxies.has(remote)&&typeof req.headers['x-forwarded-for']==='string'){
    const forwarded=normalize(req.headers['x-forwarded-for'].split(',').at(-1)!.trim());if(isIP(forwarded))ip=forwarded;
   }
   if(req.url==='/agents/chain-read'&&options.public&&!options.sponsor){
    metric='agents.chain-read';
    if(req.method!=='POST'){send({error:'Use a public JSON read'},405);return;}
    for(const [key,value] of chainRates)if(value.until<=now)chainRates.delete(key);
    const rate=chainRates.get(ip)??{until:now+60000,n:0};
    if(chainRates.size>=2048&&!chainRates.has(ip)||++rate.n>1200){res.setHeader('Retry-After','1');send({error:'Public read rate limited'},429);return;}
    chainRates.set(ip,rate);
    let call;try{call=await publicChainReadBody(req);}catch{send({error:'Unsupported public chain read'},400);return;}
    send(await chainRead(call));return;
   }
   if(global.until<=now)global={until:now+60000,n:0};
   for(const [key,value] of rates)if(value.until<=now)rates.delete(key);
   const rate=rates.get(ip)??{until:now+60000,n:0};
   if(rates.size>=2048&&!rates.has(ip)||++rate.n>600||++global.n>12000){res.setHeader('Retry-After','60');throw Object.assign(Error('Please retry this page shortly'),{status:429,code:'AGENT_API_LIMIT'});}
   rates.set(ip,rate);
   const url=new URL(req.url,'http://localhost');
   if(options.sponsor&&(url.pathname==='/agents/transactions'||/^\/agents\/operations\//.test(url.pathname))){
    metric='agents.sponsor';
    const body=req.method==='POST'?await readPoolSignedBody(req):undefined;
    const result=await options.sponsor(req.method??'',url.pathname,body);
    if(result){send(result.value,result.status);return;}
   }
   if(req.method!=='GET'){res.setHeader('Allow','GET');send({error:'This endpoint serves published contract views',code:'AGENT_METHOD_NOT_ALLOWED'},405);return;}
   if(url.pathname==='/agents/events'){metric='agents.events';events.add(res,url.searchParams.get('account'));return;}
   const section=url.pathname.replace(/^\/agents\//,'/').split('/')[1];
   if(['config','catalog','capacity','live','matches','replay','challenges','tournaments','rankings','healthz'].includes(section))metric=`agents.${section}`;
   if(url.pathname==='/healthz'){send({process:'alive',writes:!!options.sponsor,sponsorship:options.sponsorHealth?.()??{available:false,code:options.sponsor?'SPONSOR_UNVERIFIED':'READ_ONLY_SERVICE'}});return;}
   // Closing admissions must not close observers, published results or pending
   // requests. These routes contain public contract data only. Config reports
   // the gates; signed writes keep their separate canonical admission checks.
   const view=await routes(url);
   res.setHeader('ETag',`"${view.revision}"`);
   if(req.headers['if-none-match']===`"${view.revision}"`){res.statusCode=304;res.end();return;}
   send({...view.value,observation:{block:view.observedBlock,hash:view.observedHash,timestamp:view.observedTimestamp,revision:view.revision}});
  }catch(e){
   const error=e as {status?:number;code?:string;accepted?:boolean};const status=error.status??(error.accepted===false?409:503);
   // RPC exceptions may contain serialized input or credentials. Only known
   // application messages are exposed; diagnostics retain the request id.
   send({error:status===404?'Agent Arcade record not found':status===400?'Check the page parameters':status===429?'Please retry this page shortly':'Published state is temporarily unavailable',
    code:error.code??'AGENT_READ_UNAVAILABLE',source:'agent_pool',requestId,...(error.accepted===false?{accepted:false}:{})},status);
  }
 });
 server.requestTimeout=15000;server.headersTimeout=10000;server.keepAliveTimeout=5000;
 return new Promise<{server:ReturnType<typeof createServer>;close:()=>Promise<void>}>(resolve=>{
  server.listen(options.port,options.host,()=>resolve({server,close:()=>new Promise((done,reject)=>{events.close();server.close(e=>e?reject(e):done());})}));
 });
}
if(process.env.PONG_AGENT_POOL_READER==='1'){
 const manifest=JSON.parse(await readFile(process.env.PONG_AGENT_POOL_MANIFEST!,'utf8'));
 const humanApps=(process.env.PONG_HUMAN_APPS??'').split(',').filter(Boolean);
 if(!humanApps.length)throw Error('List the protected human deployments before starting the arena pool');
 const metrics=await agentMetrics('/diagnostics/pool','reader');
 const client=createPublicClient({chain:monadTestnet,batch:{multicall:{wait:10,batchSize:4096}},transport:http(process.env.RPC_URL,{retryCount:0,timeout:10000,fetchFn:measuredFetch('monad')})});
 if(await client.getChainId()!==10143)throw Error('Agent pool reader requires Monad Testnet');
 const replayDb=process.env.AGENT_DATABASE_URL?new Pool({connectionString:process.env.AGENT_DATABASE_URL,max:3}):undefined;
 if(replayDb)await initializePoolReplays(replayDb);
 const replays=replayDb?new PoolReplays(replayDb,process.env.GRAPHQL_URL?poolReplayRetention(process.env.GRAPHQL_URL,
  process.env.HASURA_ADMIN_SECRET?{'x-hasura-admin-secret':process.env.HASURA_ADMIN_SECRET}:{}):undefined):undefined;
 const operational=replayDb?async()=>{
  const rows=(await replayDb.query("SELECT app,stage,detail->>'epoch' AS epoch,detail->>'id' AS id,updated_at FROM agent_pool.health WHERE updated_at>now()-interval '15 seconds'")).rows;
  return rows.map(row=>({app:row.app,epoch:String(row.epoch),id:row.id==null?undefined:String(row.id),stage:row.stage,observedAt:new Date(row.updated_at).getTime()}));
 }:undefined;
 const service=await startPoolReadService(new AgentPoolReader(client,manifest,humanApps,operational),
  {host:process.env.HOST??'127.0.0.1',port:Number(process.env.PORT??4101),public:process.env.PONG_AGENT_POOL_PUBLIC==='1',
   trustedProxies:(process.env.PONG_AGENT_POOL_TRUSTED_PROXIES??'').split(',').filter(Boolean),replays});
 process.once('SIGTERM',()=>void service.close().finally(async()=>{await replayDb?.end();await metrics();}));
}
