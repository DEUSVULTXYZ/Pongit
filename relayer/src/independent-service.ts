import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {decodeFunctionData,encodeFunctionData,isAddress,zeroAddress,zeroHash,parseEther,verifyMessage,keccak256,type Address,type Hex,type Abi,type PublicClient} from 'viem';
import type {Pool} from 'pg';
import type {IncomingMessage,ServerResponse} from 'node:http';
import {publicIndependentManifest,independentCreditMessage,independentDiagnosticsMessage} from '../../shared/independent';
import {independentReader} from '../../shared/independent-read';
import {abi as lobbyAbi} from '../../shared/abi-independent-IndependentLobby';
import {abi as familyAbi} from '../../shared/abi-independent-ArcadeFamily';
import {abi as arenaAbi} from '../../shared/abi-independent-IndependentArena';
import {abi as ratingAbi} from '../../shared/abi-independent-PublishedRatings';
import {abi as profileAbi} from '../../shared/abi-independent-ProfileRegistry';
import {abi as privateAbi} from '../../shared/abi-independent-PrivateDataStore';
import {abi as marketAbi} from '../../shared/abi-independent-MarketV4';
import {abi as vaultAbi} from '../../shared/abi-independent-RoomsVault';
import {abi as settlementAbi} from '../../shared/abi-independent-IndependentSettlement';
import {roomsLifecycleHubAbi as hubAbi} from '../../shared/abi-rooms-lifecycle';
import {abi as interludeHubReadAbi} from '../../shared/abi-independent-IInterludeHub';
import {readHubDelegation} from '../../shared/rooms-hub';
import {engineReadRetryMs} from '../../shared/engine-read';
import {independentWriter} from './independent-writer';
import {independentEngine} from './independent-engine';
import {requestHostedRenewal} from './rooms-hosted-renewal';
import {independentFinance} from './independent-finance';
import {independentSchema} from './independent-schema';
import {abi as lobbyEventsAbi} from '../../shared/abi-independent-ContractLobby';
import {authenticatedPlayer} from './social';
import {independentHistory} from './independent-history';
import {maintenanceContext} from '../../shared/independent-recovery';
import {publicationUnavailable,serviceError} from '../../shared/service-error';
import {createRpcDiagnostics} from './rpc-diagnostics';

type Options={db:Pool;base:PublicClient;body:(r:IncomingMessage)=>Promise<any>;send:(r:ServerResponse,b:any,status?:number)=>any;graphql?:(query:string,variables?:any)=>Promise<any>;collectRpc?:boolean};
export async function independentService(o:Options){
 const path=process.env.PONG_INDEPENDENT_MANIFEST;if(!path)return null;
 const m=publicIndependentManifest(JSON.parse(await readFile(path,'utf8'))),{db,base}=o;
 await independentSchema(db);
 const r=independentReader(base,m);
 const profileHints=new Map<string,{handle:string;avatar:number}>();
 if(process.env.PONG_INDEPENDENT_SNAPSHOT){
  const source=await readFile(process.env.PONG_INDEPENDENT_SNAPSHOT,'utf8');
  if(keccak256(new TextEncoder().encode(source))!==await r.ratings('migrationEvidence'))throw Error('Profile migration evidence mismatch');
  for(const p of JSON.parse(source).profiles){if(!isAddress(p.player)||!/^[a-z][a-z0-9_]{2,19}$/i.test(p.handle)||!Number.isInteger(p.avatar)||p.avatar<0||p.avatar>11)throw Error('Invalid reserved profile');profileHints.set(p.player.toLowerCase(),{handle:p.handle,avatar:p.avatar});}
 }
 const pressure=JSON.parse(await readFile(process.env.ROOMS_PRESSURE_KEY_FILE!,'utf8'));
 const actual=await r.lobby('arenaPage');
 if(!await r.lobby('setupSealed')||actual.length!==m.arenas.length||actual.some((a:Address,i:number)=>a.toLowerCase()!==m.arenas[i].app.toLowerCase()))throw Error('Independent deployment is not sealed as declared');
 for(const [read,name,expected] of [[r.lobby,'family',m.family],[r.lobby,'ratings',m.ratings],[r.lobby,'hub',m.hub]] as const){if((await read(name)).toLowerCase()!==expected.toLowerCase())throw Error('Independent linkage mismatch');}
 for(const [address,abi,name,expected] of [[m.market,marketAbi,'results',m.settlement],[m.market,marketAbi,'vault',m.vault],[m.settlement,settlementAbi,'lobby',m.lobby],[m.settlement,settlementAbi,'ledger',m.ratings]] as const){
  const value=await base.readContract({address,abi,functionName:name} as any) as string;
  if(value.toLowerCase()!==expected.toLowerCase())throw Error('Independent financial linkage mismatch');
 }
 if(!await base.readContract({address:m.vault,abi:vaultAbi,functionName:'modulesSealed'})||!await base.readContract({address:m.vault,abi:vaultAbi,functionName:'modules',args:[m.market]})||!await r.profiles('migrationSealed'))throw Error('Independent migration is not sealed');
 const writer=await independentWriter(db,base);
 await db.query(`CREATE TABLE IF NOT EXISTS independent_events(lobby text NOT NULL,block_number bigint NOT NULL,block_hash text NOT NULL,tx_hash text NOT NULL,log_index integer NOT NULL,event text NOT NULL,args jsonb NOT NULL,PRIMARY KEY(lobby,tx_hash,log_index));
 CREATE TABLE IF NOT EXISTS independent_cursor(lobby text PRIMARY KEY,block_number bigint NOT NULL);
 CREATE TABLE IF NOT EXISTS independent_rooms(lobby text NOT NULL,id text NOT NULL,PRIMARY KEY(lobby,id));
 CREATE TABLE IF NOT EXISTS independent_credits(vault text NOT NULL,player text NOT NULL,operation text NOT NULL,PRIMARY KEY(vault,player));
 CREATE TABLE IF NOT EXISTS independent_incidents(lobby text NOT NULL,arena text NOT NULL,stage text NOT NULL,code text,changed_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(lobby,arena));`);
 const history=await independentHistory(db,base,m,o.graphql);
 const diagnostics=await createRpcDiagnostics(db,m.lobby,o.collectRpc!==false),diagnosticAt=new Map<string,number>();
 const engines=m.arenas.map(a=>independentEngine(db,base,a.app,a.node!,pressure.privateKey,history.record));
 if(engines.some(e=>e.signer.address.toLowerCase()!==m.pressureSigner.toLowerCase()))throw Error('Independent bridge identity mismatch');
 const health=m.arenas.map(a=>({app:a.app,node:a.node,epoch:'0',id:'0',stage:'observing',online:false,expiresAt:0,releaseAt:0,lastProgressAt:0,code:'',rally:null as Awaited<ReturnType<Awaited<ReturnType<typeof independentFinance>>['rallyStatus']>>}));
 const validated=m.arenas.map(()=>({epoch:0n,checked:0}));
 const jobs=new Set<string>(),retry=new Map<string,number>(),reported=new Map<string,{detail:string;at:number}>();let stopped=false,roomOffset=0;
 const run=(name:string,fn:()=>Promise<void>,interval=2000)=>{
  if(stopped||jobs.has(name)||(retry.get(name)??0)>Date.now())return;
  jobs.add(name);void fn().then(()=>retry.set(name,Date.now()+interval)).catch(e=>{
   retry.set(name,Date.now()+Math.max(engineReadRetryMs(e),3000));
   const detail=String(e?.shortMessage||e?.message||'Unavailable').split(/\n(?:Request|Details|URL)/)[0].replace(/0x[\da-f]{130,}/gi,'[signed data omitted]').slice(0,400);
   const before=reported.get(name);if(before?.detail!==detail||Date.now()-before.at>=60000){reported.set(name,{detail,at:Date.now()});console.warn(JSON.stringify({event:'independent-job-retry',job:name,detail,at:new Date().toISOString()}));}
  }).finally(()=>jobs.delete(name));
 };
 async function stage(i:number,value:string,code=''){
  const h=health[i];if(h.stage===value&&h.code===code)return;const previous=h.stage;h.stage=value;h.code=code;
  await db.query('INSERT INTO independent_incidents(lobby,arena,stage,code) VALUES($1,$2,$3,$4) ON CONFLICT(lobby,arena) DO UPDATE SET stage=$3,code=$4,changed_at=now()',[m.lobby.toLowerCase(),h.app.toLowerCase(),value,code||null]);
  console.info(JSON.stringify({event:'arena-transition',arena:h.app,epoch:h.epoch,match:h.id,previous,stage:value,code:code||undefined,at:new Date().toISOString()}));
 }
 const queue=async(at:Address,abi:Abi,name:string,args:readonly unknown[]=[],value=0n,priority=1)=>{
  let context='';
  if(name==='assignNext')context=String(await r.lobby('slot',[0n]))+':'+String(await r.lobby('slot',[1n]));
  if(name==='propose')context=maintenanceContext('room',await r.lobby('room',args));
  if(name==='openRound'){
   const app=await r.lobby('arenaOf',args),b=await r.arena(app,'boundMatch'),s=(await r.arena(app,'getSnapshot',args))[12];
   context=maintenanceContext('round',[app,b.epoch,b.id,s.scoreA+s.scoreB,s.resumeAt]);
  }
  if(name==='matchmake')context=String(await r.lobby('queueProgress',[args[0]]))+':'+Math.floor(Date.now()/15000);
  if(name==='capture')context=JSON.stringify(await r.arena(await r.lobby('arenaOf',args),'publishedResult'),(_,v)=>typeof v==='bigint'?String(v):v)+':'+(await readHubDelegation(base,m.hub,await r.lobby('arenaOf',args))).status;
  if(name==='releaseStake'||name==='forceClose')context=String((await readHubDelegation(base,m.hub,args[0] as Address)).epoch);
  if(name==='rebuild')context=String(await r.ratings('buildGeneration'))+':'+String(await r.ratings('cursor'));
  if(name==='retryPayout')context=String((await base.readContract({address:m.market,abi:marketAbi,functionName:'payouts',args:[args[0] as Hex]}))[3]);
  const data=encodeFunctionData({abi,functionName:name,args});
  const operation=await writer.enqueue(at,data,value,priority,context);
  // Permissionless maintenance may become valid after a confirmed revert. The
  // original operation remains failed; pending or uncertain bytes never enter
  // this branch. Every new attempt is simulated before acquiring a fresh nonce.
  return operation.status==='failed'?writer.enqueue(at,data,value,priority,context+':after-revert:'+String((await base.getBlockNumber())/50n)):operation;
 };
 const finance=await independentFinance(db,base,m,pressure.privateKey,queue);
 async function observeArena(i:number){
  const a=m.arenas[i],h=health[i],e=engines[i];
  const [b,d]=await Promise.all([r.arena(a.app,'boundMatch'),readHubDelegation(base,m.hub,a.app)]);
  if(h.id!==String(b.id))h.rally=null;
  h.id=String(b.id);h.epoch=String(b.epoch);h.expiresAt=Number(d.expiresAt)*1000;h.releaseAt=Number(d.stakeUnlockAt)*1000;
  h.online=false;if(e.bind(d.status===1?b.id:0n,d.status===1?b.epoch:0n))await e.restoreHealth();
  if(!b.id){e.bind(0n,0n);await stage(i,'available');return;}
  const known=await r.ratings('indexOf',[b.id]);
  if(d.status===0){
   e.bind(0n,0n);
   if(b.epoch){await e.retire(b.epoch);if(!known||!(await r.ratings('entry',[b.id])).finality){await queue(m.lobby,lobbyAbi,'capture',[b.id],0n,0);await stage(i,'recovering');return;}await stage(i,'available');return;}
   const p=await r.lobby('proposal',[b.id]);if(p.status!==2){await stage(i,'available');return;}
   await stage(i,'opening');
   try{
    // Terms are read at admission, including the actual validator capacity check
    // executed inside openArena. A local free-slot count never proves admission.
    const v=await base.readContract({address:m.hub,abi:interludeHubReadAbi,functionName:'defaultValidator'} as any);
    const terms:any=await base.readContract({address:m.hub,abi:interludeHubReadAbi,functionName:'termsOf',args:[v]} as any);
    await queue(m.lobby,lobbyAbi,'openArena',[b.id],terms.delegationFee,0);
   }catch{await stage(i,'waiting','ARENA_ADMISSION_UNAVAILABLE');await queue(m.lobby,lobbyAbi,'cancelUnopened',[b.id],0n,0).catch(()=>{});}
   return;
  }
  if(d.status===3){await stage(i,'review','DELEGATION_CHALLENGED');return;}
  if(d.status===2){
   await stage(i,'closing');await e.reconcile();
   if(Date.now()>=h.releaseAt)await queue(m.hub,hubAbi,'releaseStake',[a.app,zeroHash],0n,1);
   // Published corrections remain observable while that arena is closing.
   if(known){const published=await r.arena(a.app,'publishedResult'),entry=await r.ratings('entry',[b.id]);if(published.hash!==entry.latest.hash)await queue(m.lobby,lobbyAbi,'capture',[b.id],0n,0);}
   return;
  }
  const published=await r.arena(a.app,'publishedResult');
  if(published.status>=3&&d.batchIndex>0n){await queue(m.lobby,lobbyAbi,'closeArena',[b.id],0n,0);await stage(i,'publishing');return;}
  if(d.maxBatchInterval>0n&&Date.now()>Number(d.lastCommitAt+d.maxBatchInterval)*1000){
   // The hub, not a browser timeout, enforces the actual silence deadline. Its
   // simulation and inclusion checks protect a concurrently published batch.
   await stage(i,'recovering','PUBLICATION_SILENCE_DEADLINE');await e.reconcile();
   await queue(m.hub,interludeHubReadAbi,'forceClose',[a.app,zeroHash],0n,0);return;
  }
  if(Date.now()>=h.expiresAt){await stage(i,'recovering','DELEGATION_EXPIRED');await e.reconcile();await queue(m.lobby,lobbyAbi,'recoverExpired',[b.id],0n,0);return;}
  try{
   if(validated[i].epoch!==d.epoch||Date.now()-validated[i].checked>15000){
    const node=await e.status();
    if(String(node.epoch)!==String(d.epoch)||String(node.app).toLowerCase()!==a.app.toLowerCase())throw Error('Hosted epoch mismatch');
    validated[i]={epoch:d.epoch,checked:Date.now()};
   }
   const live=await e.read();if(live.id!==b.id)throw Error('Hosted match mismatch');
   // Financial reads have their own worker. They must not turn a readable
   // Classic engine into an unavailable one or delay its physics observer.
   h.online=true;h.lastProgressAt=Date.now()-e.feed.progressAge(b.id);await stage(i,live.phase>=3?'publishing':e.publicationFailure()?'publication-paused':'playing',e.publicationFailure()?'ENGINE_PUBLICATION_UNAVAILABLE':'');
  }catch(e){
   await stage(i,'starting','ENGINE_SYNCHRONIZING');
   // A known engine outage is not a request to create a second hosted session.
   if(validated[i].epoch===d.epoch)throw e;
   await db.query("INSERT INTO il_lifecycle(app,stage,epoch) VALUES($1,'starting',$2) ON CONFLICT(app) DO NOTHING",[a.app,String(d.epoch)]);
   const provision=(await db.query('SELECT provisioning FROM il_lifecycle WHERE app=$1',[a.app])).rows[0]?.provisioning;
   // DNS provisioning can lag the control-plane acknowledgement. Keep checking
   // that known engine; another creation cannot repair network reachability.
   if(provision?.epoch===String(d.epoch)&&provision.state==='confirmed')throw e;
   await requestHostedRenewal(db,a.app,d.epoch,a.node!);
  }
 }
 async function progressArena(i:number){
  const h=health[i],e=engines[i];if(!h.online||!['playing','publication-paused'].includes(h.stage)||Date.now()>=h.expiresAt||e.publicationFailure()&&Date.now()-e.publicationFailure()<30000)return;
  const s=await e.read();
  if(s.phase===2&&!s.state.awaitingServe&&e.feed.progressAge(s.id)>=1500)await e.send('tick',[s.id]);
 }
 async function admission(){
  if(process.env.PONG_INDEPENDENT_ADMISSION!=='true')return;
  for(let i=0;i<2;i++){
   const id=await r.lobby('slot',[BigInt(i)]);if(!id)continue;
   const p=await r.lobby('proposal',[id]);
   if(p.status===1&&Number(p.expires)*1000<Date.now())await queue(m.lobby,lobbyAbi,'expireProposal',[id],0n,0);
   if(p.status===2&&await r.lobby('arenaOf',[id])===zeroAddress){
    try{const assigned=await base.simulateContract({address:m.lobby,abi:lobbyAbi,functionName:'assignNext'});
     if(assigned.result!==zeroAddress)await queue(m.lobby,lobbyAbi,'assignNext',[],0n,0);
    }catch{/* Re-evaluate invalid grants without blocking the other slot. */}
    await queue(m.lobby,lobbyAbi,'cancelUnopened',[id],0n,0).catch(()=>{});
   }
  }
  for(const mode of [0,1]){
   const progress=await r.lobby('queueProgress',[mode]);
   if(progress[1]>0n&&(progress[0]||1n)<=progress[1])await queue(m.lobby,lobbyAbi,'matchmake',[mode,32n],0n,0);
  }
  // Room ids are reconstructed from events. This table is an index, never authority.
  const rooms=(await db.query('SELECT id FROM independent_rooms WHERE lobby=$1 ORDER BY id LIMIT 16 OFFSET $2',[m.lobby.toLowerCase(),roomOffset])).rows;
  roomOffset=rooms.length===16?roomOffset+16:0;
  for(const {id} of rooms){
   const room=await r.lobby('room',[BigInt(id)]).catch(()=>null);if(!room)continue;
   // A two-player rematch is requested by its result action and receives 60s.
   // Larger rooms rotate automatically with the ordinary 20s consent window.
   if(room.members.length===2&&room.winner!==zeroAddress&&!room.proposal)continue;
   const p=room.proposal?await r.lobby('proposal',[room.proposal]):null;
   if(!p||p.status>=3){await queue(m.lobby,lobbyAbi,'propose',[room.id],0n,1).catch(()=>{});}
  }
 }
 async function index(){
  const head=await base.getBlockNumber();
  const old=(await db.query('SELECT block_number FROM independent_cursor WHERE lobby=$1',[m.lobby.toLowerCase()])).rows[0];
  const start=old?BigInt(old.block_number)>8n?BigInt(old.block_number)-8n:0n:BigInt(m.startBlock??process.env.PONG_INDEPENDENT_START_BLOCK??head);
  const to=start+99n<head?start+99n:head;
  const logs=await base.getContractEvents({address:m.lobby,abi:[...lobbyAbi,...lobbyEventsAbi.filter(x=>x.type==='event')],fromBlock:start,toBlock:to});
  const c=await db.connect();
  try{
   await c.query('BEGIN');await c.query('DELETE FROM independent_events WHERE lobby=$1 AND block_number>=$2',[m.lobby.toLowerCase(),String(start)]);
   for(const log of logs){if(!log.blockNumber||!log.blockHash||!log.transactionHash||log.logIndex===null)continue;
    await c.query('INSERT INTO independent_events VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING',[m.lobby.toLowerCase(),String(log.blockNumber),log.blockHash,log.transactionHash,log.logIndex,log.eventName,JSON.stringify(log.args,(_,v)=>typeof v==='bigint'?String(v):v)]);
    const room=(log.args as any).room;if(room)await c.query('INSERT INTO independent_rooms VALUES($1,$2) ON CONFLICT DO NOTHING',[m.lobby.toLowerCase(),String(room)]);
   }
   await c.query('INSERT INTO independent_cursor VALUES($1,$2) ON CONFLICT(lobby) DO UPDATE SET block_number=$2',[m.lobby.toLowerCase(),String(to)]);await c.query('COMMIT');
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 }
 const permitted=new Map<string,{abi:Abi;methods:string[]}>([
  [m.family.toLowerCase(),{abi:familyAbi,methods:['register','revoke']}],
  [m.lobby.toLowerCase(),{abi:lobbyAbi,methods:['relay','propose','matchmake','expireProposal','expireRoom','assignNext','capture','closeArena','cancelUnopened']}],
  [m.profiles.toLowerCase(),{abi:profileAbi,methods:['save']}],
  [m.privateData.toLowerCase(),{abi:privateAbi,methods:['begin','put','commit']}],
  [m.market.toLowerCase(),{abi:marketAbi,methods:['buy','claim','retryPayout']}],
  [m.vault.toLowerCase(),{abi:vaultAbi,methods:['withdraw']}],
 ]);
 async function route(req:IncomingMessage,res:ServerResponse,path:string){
  if(!path.startsWith('/independent/'))return false;
  try{
   if(req.method==='GET'&&path==='/independent/config'){o.send(res,{manifest:m,admission:process.env.PONG_INDEPENDENT_ADMISSION==='true',arenas:health,sponsor:writer.status()});return true;}
   if(req.method==='POST'&&path==='/independent/diagnostics'){
    const b=await o.body(req);
    if(!isAddress(b.player)||!Number.isSafeInteger(b.expires)||Math.abs(Date.now()/1000-b.expires)>120||typeof b.instance!=='string'||!/^[a-f0-9-]{36}$/i.test(b.instance)||!Array.isArray(b.samples)||b.samples.length>200||typeof b.signature!=='string'||!/^0x[\da-f]{130}$/i.test(b.signature))throw Error('Invalid diagnostics proof');
    const player=b.player.toLowerCase(),now=Date.now();
    if((diagnosticAt.get(player)??0)>now-9000){o.send(res,{accepted:false},202);return true;}
    const grant=await r.family('grantOf',[b.player]),digest=keccak256(new TextEncoder().encode(JSON.stringify(b.samples)));
    if(grant.key===zeroAddress||!await verifyMessage({address:grant.key,message:independentDiagnosticsMessage(m.family,b.player,b.instance,b.expires,digest),signature:b.signature}))throw Error('Diagnostics require an active arcade key');
    await diagnostics.accept(b.samples,b.instance);diagnosticAt.set(player,now);
    for(const [key,at] of diagnosticAt)if(at<now-120000)diagnosticAt.delete(key);
    o.send(res,{accepted:true});return true;
   }
   if(req.method==='GET'&&/^\/independent\/profile-migration\/0x[\da-fA-F]{40}$/.test(path)){o.send(res,profileHints.get(path.split('/').at(-1)!.toLowerCase())??null);return true;}
   if(req.method==='GET'&&/^\/independent\/player\/0x[\da-fA-F]{40}\/(recent|frequent|payments)$/.test(path)){
    const parts=path.split('/'),player=parts[3] as Address,kind=parts[4];
    o.send(res,kind==='recent'?await history.recent(player):kind==='frequent'?await history.frequent(player):await finance.accountPayments(player));return true;
   }
   if(req.method==='GET'&&/^\/independent\/replay\/\d+$/.test(path)){
    const after=new URL(req.url!,'http://localhost').searchParams.get('after')||'-1';if(!/^-?\d{1,20}$/.test(after))throw Error('Invalid replay cursor');
    o.send(res,await history.replay(BigInt(path.split('/').at(-1)!),BigInt(after)));return true;
   }
   if(req.method==='GET'&&path==='/independent/import/contacts'){
    const player=await authenticatedPlayer(req);
    const contacts=(await db.query('SELECT contact FROM il_contacts WHERE player=$1 ORDER BY contact',[player])).rows.map(r=>r.contact);
    res.setHeader('Cache-Control','no-store');o.send(res,{contacts});return true;
   }
   if(req.method==='GET'&&/^\/independent\/operations\/0x[\da-f]{64}$/.test(path)){
    const operation=await writer.get(path.split('/').at(-1)!);o.send(res,operation??{error:'Unknown operation'},operation?200:404);return true;
   }
   if(req.method==='GET'&&/^\/independent\/market\/\d+$/.test(path)){
    const q=new URL(req.url!,'http://localhost').searchParams,player=q.get('player')||zeroAddress,side=Number(q.get('side')||0),shares=q.get('shares')||'1000000000000000';
    if(!isAddress(player)||![0,1].includes(side)||!/^\d{1,22}$/.test(shares))throw Error('Invalid market query');
    o.send(res,await finance.view(BigInt(path.split('/').at(-1)!),player,side,BigInt(shares)));return true;
   }
   if(req.method==='POST'&&path==='/independent/transactions'){
    const b=await o.body(req);if(!isAddress(b.to)||typeof b.data!=='string'||!/^0x[\da-f]+$/i.test(b.data)||b.data.length>44000)throw Error('Invalid sponsored call');
    const allowed=permitted.get(b.to.toLowerCase());if(!allowed)throw Error('Contract is outside the arcade scope');
    const decoded=decodeFunctionData({abi:allowed.abi,data:b.data});if(!allowed.methods.includes(decoded.functionName))throw Error('Action is not sponsored');
    if(decoded.functionName==='relay'&&process.env.PONG_INDEPENDENT_ADMISSION!=='true'){
     const inner=decodeFunctionData({abi:lobbyAbi,data:decoded.args![1] as Hex});
     if(!['cancelQueue','leaveRoom','declineProposal','cancelAdmission','blockPlayer'].includes(inner.functionName))throw Error('New admissions are temporarily paused');
    }
    // A deferred payment may be attempted again, but its recipient and reserved
    // amount are still fixed by the contract. No new operation re-credits a claim.
    if(decoded.functionName==='retryPayout'){
     const payout:any=await base.readContract({address:m.market,abi:marketAbi,functionName:'payouts',args:[decoded.args![0] as Hex]});
     o.send(res,await writer.enqueue(b.to,b.data,0n,2,String(payout[3])),202);return true;
    }
    o.send(res,await writer.enqueue(b.to,b.data,0n,decoded.functionName==='relay'?0:2),202);return true;
   }
   if(req.method==='POST'&&path==='/independent/credit'){
    const b=await o.body(req);if(!isAddress(b.player)||!Number.isSafeInteger(b.expires)||typeof b.signature!=='string'||!/^0x[\da-f]{130}$/i.test(b.signature))throw Error('Invalid credit proof');
    const now=Number((await base.getBlock()).timestamp);
    if(b.expires<now||b.expires>now+180||!await verifyMessage({address:b.player,message:independentCreditMessage(b.player,m.vault,b.expires),signature:b.signature}))throw Error('Credit request requires its owner passkey');
    const old=(await db.query('SELECT operation FROM independent_credits WHERE vault=$1 AND player=$2',[m.vault.toLowerCase(),b.player.toLowerCase()])).rows[0];
    if(old){o.send(res,await writer.get(old.operation));return true;}
    const operation=await queue(m.vault,vaultAbi,'depositFor',[b.player],parseEther('0.02'),3);
    await db.query('INSERT INTO independent_credits VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[m.vault.toLowerCase(),b.player.toLowerCase(),operation.id]);
    o.send(res,operation,202);return true;
   }
   if(req.method==='POST'&&path==='/independent/arena-command'){
    const b=await o.body(req);if(!isAddress(b.app)||typeof b.data!=='string'||!/^0x[\da-f]+$/i.test(b.data)||b.data.length>2200)throw Error('Invalid arena command');
    const e=engines.find(e=>e.app.toLowerCase()===b.app.toLowerCase());if(!e)throw Error('Unknown arena');
    const decoded=decodeFunctionData({abi:arenaAbi,data:b.data});
    if(!['revokeActive','renewActive'].includes(decoded.functionName))throw Error('Only owner-signed permission changes are allowed');
    // The writer recognizes a previously executed root command before simulation.
    const result=await e.send(decoded.functionName as 'revokeActive'|'renewActive',decoded.args??[]);
    o.send(res,{status:'confirmed',revision:String(result.revision)});return true;
   }
   o.send(res,{error:'Unknown independent endpoint'},404);return true;
  }catch(e){
   const requestId=randomUUID(),rejected=(e as any).accepted===false;
   if(publicationUnavailable(e)||engineReadRetryMs(e)){const failure=serviceError(e,requestId);o.send(res,failure.body,failure.status);return true;}
   o.send(res,{error:rejected?(e as Error).message:'The action could not be accepted. Refresh its state before retrying.',code:rejected?'CONTRACT_REJECTED':'INDEPENDENT_ACTION_UNAVAILABLE',...(rejected?{accepted:false}:{}),source:'pongit',retryAt:Date.now()+3000,requestId},rejected?409:503);return true;
  }
 }
 const timer=setInterval(()=>{
  for(let i=0;i<engines.length;i++){run(`arena:${i}`,()=>observeArena(i),health[i].stage==='available'?10000:3000);run(`progress:${i}`,()=>progressArena(i));}
  for(let i=0;i<engines.length;i++)if(health[i].online&&['playing','publication-paused'].includes(health[i].stage)){
   run(`rally:${i}`,async()=>{health[i].rally=await finance.rallyStatus(engines[i].app,await engines[i].read());},3000);
   if(health[i].stage==='playing')run(`chaos:${i}`,()=>finance.checkpoint(engines[i]));
  }
  run('index',index,6000);run('history',history.observe,6000);run('admission',admission,4000);
  run('payments',finance.payments,6000);
  run('ranking',async()=>{if(await r.ratings('buildGeneration'))await queue(m.ratings,ratingAbi,'rebuild',[32n],0n,2);},10000);
 },2000);timer.unref();
 return {route,manifest:m,engines,writer,queue,status:()=>({online:health.some(h=>h.online||h.stage==='available'),admission:process.env.PONG_INDEPENDENT_ADMISSION==='true',arenas:health,sponsor:writer.status()}),stop:()=>{stopped=true;clearInterval(timer);writer.stop();history.stop();diagnostics.stop();engines.forEach(e=>e.stop());}};
}
