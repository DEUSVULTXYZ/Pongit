import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {isIP} from 'node:net';
import {createPublicClient,http} from 'viem';
import {monadTestnet} from 'viem/chains';
import {AgentPoolReader,poolJson} from './pool-read';
import {poolRoutes} from './pool-api';
import {measuredFetch,recordRpc} from '../../../shared/rpc-metrics';
import {agentMetrics} from './metrics';
import {readPoolSignedBody,type poolSponsorRoutes} from './pool-sponsor';

// Dedicated version-2 process. Never starts the legacy single-application
// coordinator and never loads an operator key. A private qualification endpoint
// is bound to loopback unless an isolated Docker network is explicitly selected.
export function startPoolReadService(reader:AgentPoolReader,options:{host:string;port:number;public:boolean;trustedProxies?:string[];sponsor?:ReturnType<typeof poolSponsorRoutes>}){
 const routes=poolRoutes(reader),rates=new Map<string,{until:number;n:number}>();
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
   const section=url.pathname.replace(/^\/agents\//,'/').split('/')[1];
   if(['config','catalog','live','matches','tournaments','rankings','healthz'].includes(section))metric=`agents.${section}`;
   if(url.pathname==='/healthz'){send({process:'alive',writes:!!options.sponsor});return;}
   if(options.public){const config=await routes(new URL('http://localhost/config'));if(!('enabled' in config.value)||!config.value.enabled){send({error:'Agent Arcade is not open',code:'AGENT_CLOSED'},503);return;}}
   const view=await routes(url);res.setHeader('ETag',`"${view.revision}"`);
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
  server.listen(options.port,options.host,()=>resolve({server,close:()=>new Promise((done,reject)=>server.close(e=>e?reject(e):done()))}));
 });
}
if(process.env.PONG_AGENT_POOL_READER==='1'){
 const manifest=JSON.parse(await readFile(process.env.PONG_AGENT_POOL_MANIFEST!,'utf8'));
 const humanApps=(process.env.PONG_HUMAN_APPS??'').split(',').filter(Boolean);
 if(!humanApps.length)throw Error('List the protected human deployments before starting the arena pool');
 const metrics=await agentMetrics('/diagnostics/pool','reader');
 const client=createPublicClient({chain:monadTestnet,batch:{multicall:{wait:10,batchSize:4096}},transport:http(process.env.RPC_URL,{retryCount:0,timeout:10000,fetchFn:measuredFetch('monad')})});
 if(await client.getChainId()!==10143)throw Error('Agent pool reader requires Monad Testnet');
 const service=await startPoolReadService(new AgentPoolReader(client,manifest,humanApps),
  {host:process.env.HOST??'127.0.0.1',port:Number(process.env.PORT??4101),public:process.env.PONG_AGENT_POOL_PUBLIC==='1',
   trustedProxies:(process.env.PONG_AGENT_POOL_TRUSTED_PROXIES??'').split(',').filter(Boolean)});
 process.once('SIGTERM',()=>void service.close().finally(metrics));
}
