'use client';
import {watchAgentChanges} from '../lib/agent-notifications';
import {poolUserError} from '../../shared/agent-pool-error';
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import type {Address} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {preparePoolChallenge} from '../../shared/agent-pool-client';
import {readChallengeEntry} from '../../shared/agent-challenge-receipt';
import {agentEntryHandoff} from '../lib/agent-entry-handoff';
import {loadPoolFamily,SESSION_RENEW_MARGIN,type PoolFamilySession} from '../../shared/agent-pool-family';
import {validateAgentPoolManifest,type AgentPoolManifest,type PoolChallengeView} from '../../shared/agent-pool';
import type {AgentMatchRef} from '../../shared/agents';
import {engineReadRetryMs} from '../../shared/engine-read';
import {poolApi,poolBase,poolBrowserSponsor,finishPoolSponsor} from '../lib/agent-pool';
import {connect,rememberedAccount} from '../lib/wallet';
import {openArcadeAccess} from '../lib/arcade-access';
import {quietFailure} from '../lib/quiet-failure';
import {short} from '../lib/api';
import {Avatar} from './Avatar';
import {Dialog} from './Dialog';
import {IconButton} from './IconButton';
import {ArcadeAmbience,MusicCredit} from './ArcadeAmbience';
import {EngineCredit} from './EngineCredit';
import {WarmupRally} from './WarmupRally';
import {useQueueElapsed} from '../lib/use-lobby-clock';
import {ArcadeHeader,ArcadeHeading,ArcadeState} from './ArcadeChrome';
import {agentServiceUnavailable,canQueueAgent,reusableCapacity,type AgentCapacity,type AgentAvailability} from '../../shared/agent-availability';
import {ArcadeProgress} from './ArcadeProgress';
import {challengeStage,sponsorStage,type ArcadeStage} from '../../shared/arcade-progress';
import {AgentModeSwitch} from './AgentModeSwitch';
import type {ChainOperation} from '../../shared/independent';

type Person={agent:Address;creator:Address;name:string;avatar:number;official:boolean;difficulty:string;level?:number;modes:number[];qualification:Record<0|1,boolean>;available:boolean;waiting:boolean;availability?:Record<0|1,AgentAvailability>};
const availabilityLabels:Record<AgentAvailability,string>={available:'Ready to play','capacity-occupied':'Waiting for an arena','service-unavailable':'Arenas reconnecting','agent-busy':'Finishing a match',qualifying:'Qualifying',incompatible:'Mode unavailable'};
type Live={ref:AgentMatchRef;a:Address;b:Address;mode:0|1;lane:string};
const quiet=()=>{};
const matchHref=(ref:AgentMatchRef)=>`/agents/arenas/${ref.app}/${ref.epoch}/${ref.id}`;
export function AgentPoolArcade({enabled,tournaments,initialMode,initialView,initialAgent}:{enabled:boolean;tournaments:boolean;initialMode:0|1;initialView:'play'|'watch';initialAgent?:string}){
 const router=useRouter(),[config,setConfig]=useState<AgentPoolManifest|null>(null),[people,setPeople]=useState<Person[]>([]),[live,setLive]=useState<Live[]>([]);
 const [mode,setMode]=useState(initialMode),[view,setView]=useState(initialView),[account,setAccount]=useState<Address>(),[request,setRequest]=useState<PoolChallengeView|null>(null);
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[connectOpen,setConnectOpen]=useState(false),[selected,setSelected]=useState(initialAgent??''),[retry,setRetry]=useState(0),[offset,setOffset]=useState('0'),[next,setNext]=useState<string|null>(null);
 const [actionStage,setActionStage]=useState<ArcadeStage>('preparing'),[cancelQueued,setCancelQueued]=useState<string|null>(null);
 const [catalogRevision,setCatalogRevision]=useState(0),[challengeRevision,setChallengeRevision]=useState(0);
 const [entering,setEntering]=useState<AgentMatchRef|null>(null);
 const enterMatch=(ref:AgentMatchRef)=>{setEntering(ref);router.push(matchHref(ref));};
 const progress=(op:ChainOperation)=>setActionStage(sponsorStage(op.status));
 const [capacity,setCapacity]=useState<AgentCapacity>(),[checking,setChecking]=useState(false);
 const recentCapacity=useRef<{value:AgentCapacity;receivedAt:number}|undefined>(undefined);
 const observeCapacity=(value:AgentCapacity|undefined)=>{setCapacity(value);recentCapacity.current=value?{value,receivedAt:performance.now()}:undefined;};
 const [catalogError,setCatalogError]=useState(''),[queueError,setQueueError]=useState(''),[renewing,setRenewing]=useState(false);
 const [watchMode,setWatchMode]=useState<'all'|0|1>('all');
 const visibleError=(!connectOpen&&error)||queueError||catalogError;
 const session=useRef<PoolFamilySession|null>(null),locked=useRef(false),intent=useRef<Address|null>(null),alive=useRef(false),waiting=useRef(false);
 const launchFocus=useRef<HTMLButtonElement>(null);
 const hasCatalogue=useRef(false);
 const [warmup,setWarmup]=useState(false);
 const [detailAgent,setDetailAgent]=useState<Person|null>(null),[catalogLoaded,setCatalogLoaded]=useState(false);
 const serviceDown=!!capacity&&agentServiceUnavailable(capacity);
 const capacityBusy=!!capacity&&!serviceDown&&(!capacity.freeChallengeLanes||!capacity.readyArenas);
 const followingChallenge=busy||!!request||!!entering;
 const person=(p:string)=>people.find(x=>x.agent.toLowerCase()===p.toLowerCase());
 useEffect(()=>{if(enabled)return watchAgentChanges(change=>{
  if(change.resync||change.changed.some(topic=>['config','catalog','live'].includes(topic))){recentCapacity.current=undefined;setCatalogRevision(n=>n+1);}
  if(change.resync||change.changed.some(topic=>topic==='config'||topic===`challenges/${account?.toLowerCase()}`))setChallengeRevision(n=>n+1);
 },account,account&&followingChallenge?'challenge':'arcade');},[enabled,account,followingChallenge]);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{if(!enabled)return;const remembered=rememberedAccount();if(remembered)setAccount(remembered.address);},[enabled]);
 useEffect(()=>{
  // The chosen rival stays visible. While its signed request is being sent or
  // followed, only that request/configuration need fresh observations. Loading
  // all profiles/live fixtures again competes with admission and nonce checks.
  if(!enabled||followingChallenge)return;let stopped=false,timer:ReturnType<typeof setTimeout>;const abort=new AbortController(),quiet=quietFailure();
  const refresh=async()=>{let delay=10000;
   try{
    if(document.hidden)return;
    const readSignal=AbortSignal.any([abort.signal,AbortSignal.timeout(8000)]);
    const results=await Promise.allSettled([
     poolApi<AgentPoolManifest>('config',undefined,readSignal).then(raw=>{const m=validateAgentPoolManifest(raw);if(!m.enabled)throw Error('Agent Arcade is not open');if(!stopped)setConfig(m);}),
     poolApi<{items:Person[];next:string|null;capacity?:AgentCapacity}>(`catalog?offset=${offset}&limit=16`,undefined,readSignal).then(catalog=>{if(!stopped){hasCatalogue.current=true;setPeople(catalog.items);observeCapacity(catalog.capacity);setNext(catalog.next);setCatalogLoaded(true);}}),
     poolApi<{items:Live[]}>('live',undefined,readSignal).then(games=>{if(!stopped)setLive(games.items);}),
    ]);
    const failed=results.find(r=>r.status==='rejected');if(failed?.status==='rejected')throw failed.reason;
    if(!stopped){quiet.recovered();setCatalogError('');}
   }catch(e){if(!stopped){setCatalogError(hasCatalogue.current?quiet.failed(poolUserError(e)):'The arcade could not be loaded. Please retry.');delay=Math.max(10000,engineReadRetryMs(e));}}
   finally{if(!stopped)timer=setTimeout(refresh,delay);}
  };void refresh();return()=>{stopped=true;clearTimeout(timer);abort.abort();};
 },[enabled,retry,catalogRevision,offset,followingChallenge]);
 useEffect(()=>{
  if(!config||!account)return;let stopped=false,timer:ReturnType<typeof setTimeout>;const abort=new AbortController(),quiet=quietFailure();
  const poll=async()=>{let delay=2000;try{
   // A pending challenge keeps being followed in a background tab: the match only
   // waits about thirty seconds for its player once an arena admits it.
   if(document.hidden&&!waiting.current)return;const result=await poolApi<{request:PoolChallengeView|null}>(`challenges/${account}`,undefined,abort.signal);
   if(stopped)return;quiet.recovered();setRequest(result.request);setQueueError('');waiting.current=!!result.request&&!result.request.ref;if(!result.request)delay=10000;
   if(result.request?.ref){
    if(!document.hidden){enterMatch(result.request.ref);return;}
    const title=document.title;document.title='Your match is ready! · PONGIT';
    const back=()=>{if(document.hidden)return;document.removeEventListener('visibilitychange',back);document.title=title;enterMatch(result.request!.ref!);};
    document.addEventListener('visibilitychange',back);return;
   }
  }catch(e){if(!stopped)setQueueError(quiet.failed(poolUserError(e)));delay=Math.max(5000,engineReadRetryMs(e));}finally{if(!stopped)timer=setTimeout(poll,delay);}};
  void poll();return()=>{stopped=true;clearTimeout(timer);abort.abort();};
 },[config?.pool,account,retry,challengeRevision,router]);
 async function run(fn:()=>Promise<void>){if(locked.current)return;locked.current=true;setBusy(true);setActionStage('preparing');setError('');try{await fn();}catch(e){if(alive.current)setError(poolUserError(e));}finally{locked.current=false;if(alive.current)setBusy(false);}}
 async function canStart(m:AgentPoolManifest){
  if(m.version<5)return true;
  const recent=recentCapacity.current;
  if(recent&&reusableCapacity(recent.value,performance.now()-recent.receivedAt))return true;
  setChecking(true);
  try{const result=await poolApi<{capacity:AgentCapacity}>('capacity',undefined,AbortSignal.timeout(5000));observeCapacity(result.capacity);return !agentServiceUnavailable(result.capacity);}
  catch{throw Error('Arena availability could not be checked. Please retry.');}
  finally{setChecking(false);}
 }
 async function challenge(m:AgentPoolManifest,s:PoolFamilySession,agent:Address){
  // Availability and authorization have independent read paths. Observe both
  // now, then require both before signing. Catch immediately so an earlier
  // journal/canonical-read failure cannot leave an unhandled network rejection.
  const capacityResult=canStart(m).then(available=>({available,error:undefined as unknown}),error=>({available:false,error}));
  const admissionPreflight=async()=>{const result=await capacityResult;if(result.error)throw result.error;
   if(!result.available)throw Object.assign(Error('Arena admission is unavailable'),{code:'POOL_CAPACITY_UNAVAILABLE'});};
  const sponsor=poolBrowserSponsor(m,s.grant.player);await finishPoolSponsor(sponsor,undefined,progress);
  let prepared;
  try{prepared=await preparePoolChallenge(poolBase(),m,privateKeyToAccount(s.key),s.grant.player,{agent,mode,expectedFamily:s.grant,renewWithin:SESSION_RENEW_MARGIN,checkPending:true,admissionPreflight});}
  catch(error){
   if((error as {code?:string}).code==='POOL_CAPACITY_UNAVAILABLE')return;
   if((error as {code?:string}).code!=='POOL_CHALLENGE_PENDING')throw error;
   const existing=await poolApi<{request:PoolChallengeView|null}>(`challenges/${s.grant.player}`);
   setRequest(existing.request);if(existing.request?.ref)enterMatch(existing.request.ref);setRetry(n=>n+1);return;
  }
  const operation=await finishPoolSponsor(sponsor,prepared,progress);
  // Read the actual confirmed receipt instead of waiting behind a pre-submit
  // API snapshot. An optional admission can assign somebody else: validate the
  // player, mode and full reference, then let the arena perform its own checks.
  if(m.challengeAdmission==='atomic-v1'&&operation?.status==='confirmed'&&operation.hash){
   try{const entry=await readChallengeEntry(poolBase(),m,operation.hash,s.grant.player,{agent,mode});
    if(entry&&!document.hidden){
     if(entry.view)agentEntryHandoff.put(m,entry.view,s.grant.player);
     enterMatch(entry.ref);return;
    }
   }catch{/* The saved action is confirmed; resume observation, never resubmit. */}
  }
  waiting.current=true;setRetry(n=>n+1);
 }
 function choose(agent:Address,trigger:HTMLButtonElement){launchFocus.current=trigger;setSelected(agent);intent.current=agent;
  // The catalogue and config arrive independently. Selecting an archetype
  // during recovery needs neither a manifest nor a session ceremony.
  if(serviceDown){setError('');return;}
  void run(async()=>{
  if(!config)throw Error('The arcade is reconnecting');
  if(!canQueueAgent(person(agent)?.availability?.[mode]))return;
  const saved=account?loadPoolFamily(config,account,sessionStorage):null;
  if(saved){
   session.current=saved;
   try{await challenge(config,saved,agent);intent.current=null;return;}
   catch(error){
    // Only a successful canonical observation can require fresh consent. A
    // network failure preserves the saved key and selected archetype.
    if((error as {code?:string}).code!=='POOL_FAMILY_RENEW')throw error;
    setRenewing((error as {active:boolean}).active);
   }}
  else if(!await canStart(config))return;
  setConnectOpen(true);
 });}
 async function login(create=false){await run(async()=>{
  if(!config)throw Error('The arcade is reconnecting');if(!await canStart(config)){setConnectOpen(false);return;}setActionStage('connecting');const identity=await connect(create);
  try{
   setAccount(identity.account.address);setActionStage('preparing');
   const access=await openArcadeAccess(identity,{agents:config},progress),authorized=access.agents!;
   session.current=authorized;setConnectOpen(false);setRenewing(false);const agent=intent.current;
   if(agent)await challenge(config,authorized,agent);intent.current=null;
  }finally{identity.end();}
 });}
 async function cancel(){await run(async()=>{
  if(!config||!account||!request)return;const saved=loadPoolFamily(config,account,sessionStorage);if(!saved)throw Error('Use the arcade session that created this challenge');
  const sponsor=poolBrowserSponsor(config,account);await finishPoolSponsor(sponsor,undefined,progress);
  const prepared=await preparePoolChallenge(poolBase(),config,privateKeyToAccount(saved.key),account,{agent:request.agent,mode:request.mode,cancel:BigInt(request.id)});
  await finishPoolSponsor(sponsor,prepared,progress);setRequest(null);setRetry(n=>n+1);
 });}
 // A click during sponsorship queues intent; it never creates a competing nonce.
 useEffect(()=>{if(!cancelQueued||busy)return;setCancelQueued(null);if(request?.id===cancelQueued&&request.status===1)void cancel();},[cancelQueued,busy,request?.id,request?.status]);
 const waitSeconds=useQueueElapsed(request&&!request.ref?`challenge:${request.id}`:undefined);
 return <main className="cabinet-ui rooms-shell agents-shell">
  <ArcadeHeader><ArcadeAmbience onSound={quiet}/><a href="/docs" target="_blank" rel="noreferrer">Docs ↗</a><Link href="/">Back to arcade</Link></ArcadeHeader>
  <ArcadeHeading title="Agent Arcade" description="Pick a rival. Find your rhythm.">{account&&<span>{short(account)}</span>}</ArcadeHeading>
  {!enabled?<section className="agent-empty"><h2>Qualification in progress</h2><p>The independent arenas are being tested before opening.</p></section>:<>
   <nav className="agent-tabs" aria-label="Agent Arcade"><button aria-pressed={view==='play'} onClick={()=>setView('play')}>Player vs Agent</button><button aria-pressed={view==='watch'} onClick={()=>setView('watch')}>Watch agents</button>{tournaments&&<Link href="/agents/tournaments">Tournaments</Link>}</nav>
   <AgentModeSwitch value={view==='watch'?watchMode:mode} all={view==='watch'} disabled={view==='play'&&followingChallenge} onChange={n=>view==='watch'?setWatchMode(n):n!=='all'&&setMode(n)}/>
   {serviceDown&&!request&&!visibleError&&<ArcadeProgress stage="unavailable" title="Arcade is recovering"
    detail={selected?`${person(selected)?.name??'Your rival'} is selected. Play resumes when an arena is ready.`:'Play is paused while arenas recover. You can still choose your rival.'}
    actions={<><button onClick={()=>setRetry(n=>n+1)}>Check again</button><Link className="rooms-button" href="/">Back to arcade</Link></>}/>}
   {view==='play'&&capacityBusy&&!followingChallenge&&!visibleError&&<ArcadeProgress stage="capacity" title="Arenas are in play"
    detail="Choose your rival to join the next available arena."/>}

   {visibleError&&!request&&<ArcadeProgress stage="error" detail={visibleError} actions={<button onClick={()=>setRetry(n=>n+1)}>Retry</button>}/>}
   {(busy||entering)&&!request&&!connectOpen&&!visibleError&&!serviceDown&&(entering
    ?<Link href={matchHref(entering)} aria-label="Open your arena"><ArcadeProgress stage="ready"/></Link>
    :<ArcadeProgress stage={checking?'loading':actionStage}/>)}
   {request&&<section aria-label="Your challenge">
    <ArcadeProgress stage={visibleError?'error':busy?actionStage:serviceDown&&!request.ref?'unavailable':request.progress?.stage??challengeStage(!!request.ref,request.waitReason)} elapsed={request.ref?undefined:waitSeconds}
     title={cancelQueued?'Cancellation queued':!busy&&!request.ref&&(serviceDown||request.progress?.stage==='unavailable')?'Arcade is recovering':undefined} detail={visibleError||(!busy&&!request.ref&&(serviceDown||request.progress?.stage==='unavailable')?'Your challenge is saved. Cancel or wait for recovery.':`${person(request.agent)?.name??short(request.agent)} · ${request.mode===0?'Classic':'Chaos'} · Friendly`)}
     progress={request.progress?.progress} actions={request.ref?<Link className="rooms-button" href={matchHref(request.ref)}>Enter arena</Link>:<><button disabled={!!cancelQueued||request.status!==1} onClick={()=>setCancelQueued(request.id)}>{cancelQueued?'Cancelling…':'Cancel challenge'}</button><button onClick={()=>setWarmup(w=>!w)}>{warmup?'Hide warm-up':'Warm up'}</button></>}/>
    {!request.ref&&warmup&&<WarmupRally onClose={()=>setWarmup(false)}/>}</section>}
   {view==='play'?<><div className="agent-grid">{people.filter(p=>p.modes.includes(mode)).sort((a,b)=>(a.level??9)-(b.level??9)).map(p=><article className="agent-card" key={p.agent} data-selected={selected.toLowerCase()===p.agent.toLowerCase()}>
    <div className="agent-card-top"><span className="agent-badge">{p.official?'PONGIT BOT':'COMMUNITY'}</span><button className="agent-details" aria-label={`About ${p.name}`} onClick={()=>setDetailAgent(p)}>···</button></div>
    <div className="agent-identity"><Avatar index={p.avatar}/><div><h2>{p.name}</h2><p>{p.difficulty}</p></div></div>
    {p.level&&<div className="agent-difficulty" aria-label={`Difficulty ${p.level} of 8`}>{Array.from({length:8},(_,i)=><i key={i} data-filled={i<p.level!}/>)}</div>}
    <span className="agent-status" data-online={!serviceDown&&p.availability?.[mode]==='available'}>{serviceDown||capacityBusy?(p.official?'Friendly instance':'Community agent'):p.availability?availabilityLabels[p.availability[mode]]:!p.qualification[mode]?'Qualifying':!p.available?'Unavailable':'Checking arenas'}</span>
    <button className="primary" aria-label={`Challenge ${p.name}`} disabled={followingChallenge||(!config&&!serviceDown)||!p.available||!p.qualification[mode]} onClick={e=>choose(p.agent,e.currentTarget)}>{serviceDown?'Select':p.availability?.[mode]==='available'?'Play':'Join queue'} <span aria-hidden="true">↗</span></button></article>)}</div>
    {!people.length&&!visibleError&&(catalogLoaded?<ArcadeState title="No agents in this mode yet"><p>Try the other mode or return shortly.</p></ArcadeState>:<ArcadeProgress stage="loading" title="Loading your rivals"/>)}<div className="agent-toolbar">{offset!=='0'&&<button onClick={()=>setOffset('0')}>First page</button>}{next&&<button onClick={()=>setOffset(next)}>More agents</button>}</div></>:<div className="agent-grid agent-live-grid">
    {live.filter(g=>watchMode==='all'||g.mode===watchMode).map(g=><article className="agent-card" key={matchHref(g.ref)}><span className="agent-badge">{g.lane.toUpperCase()} · {g.mode===0?'CLASSIC':'CHAOS'}</span><h2>{person(g.a)?.name??short(g.a)} vs {person(g.b)?.name??short(g.b)}</h2><Link className="rooms-button" href={matchHref(g.ref)}>Open arena ↗</Link></article>)}
    {!serviceDown&&!live.some(g=>watchMode==='all'||g.mode===watchMode)&&<ArcadeProgress stage="preparing" title="Next match is on its way" detail="A live match appears here once play starts."/>}</div>}
  </>}
  {connectOpen&&<Dialog returnFocus={launchFocus} label="Connect to challenge an agent" onClose={()=>{if(!busy){setConnectOpen(false);intent.current=null;}}}><IconButton aria-label="Close connection" onClick={()=>{if(!busy){setConnectOpen(false);intent.current=null;}}}/><h2>{renewing?'Keep playing':account?'Enable agent play':'Your next rival is ready'}</h2><p>{renewing?'Your session ends soon. Confirm once to keep playing.':account?'Your account is connected. Confirm once to add agent play to this arcade session.':'One confirmation for two hours of human and agent play.'} Wallet actions still need your approval.</p><div className="button-row"><button className="primary" disabled={busy} onClick={()=>void login()}>{renewing?'Continue':account?'Enable & play':'Connect & play'}</button>{!renewing&&!account&&<button disabled={busy} onClick={()=>void login(true)}>Create account</button>}</div>{error?<ArcadeProgress stage="error" detail={error} compact/>:busy?<ArcadeProgress stage={actionStage} compact/>:null}</Dialog>}
  {detailAgent&&<Dialog label={`About ${detailAgent.name}`} onClose={()=>setDetailAgent(null)}><IconButton aria-label="Close agent details" onClick={()=>setDetailAgent(null)}/><h2>{detailAgent.name}</h2><p>{detailAgent.difficulty}</p><p>{detailAgent.official?'PONGIT BOT':'COMMUNITY AGENT'} · Creator {detailAgent.official?'PONGIT':short(detailAgent.creator)}</p><p>{detailAgent.modes.map(m=>m===0?'Classic':'Chaos').join(' · ')}</p><p>{detailAgent.official&&config?.houseInstances?'Each friendly match has its own controller. You can play this rival while another instance competes.':'A challenge waits until this agent is free.'}</p></Dialog>}
  <footer className="rooms-footer"><MusicCredit/><EngineCredit/></footer>
 </main>;
}
