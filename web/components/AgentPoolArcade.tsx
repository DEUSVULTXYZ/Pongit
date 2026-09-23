'use client';
import {poolUserError} from '../../shared/agent-pool-error';
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import type {Address} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {preparePoolChallenge} from '../../shared/agent-pool-client';
import {preparePoolFamily,loadPoolFamily,observePoolFamily,familyExpiresSoon,SESSION_RENEW_MARGIN,type PoolFamilySession} from '../../shared/agent-pool-family';
import {validateAgentPoolManifest,type AgentPoolManifest,type PoolChallengeView} from '../../shared/agent-pool';
import type {AgentMatchRef} from '../../shared/agents';
import {engineReadRetryMs} from '../../shared/engine-read';
import {poolApi,poolBase,poolBrowserSponsor,finishPoolSponsor} from '../lib/agent-pool';
import {connect,rememberedAccount} from '../lib/wallet';
import {short} from '../lib/api';
import {Avatar} from './Avatar';
import {Dialog} from './Dialog';
import {IconButton} from './IconButton';
import {ArcadeAmbience,MusicCredit} from './ArcadeAmbience';
import {EngineCredit} from './EngineCredit';

type Person={agent:Address;creator:Address;name:string;avatar:number;official:boolean;difficulty:string;modes:number[];qualification:Record<0|1,boolean>;available:boolean;waiting:boolean};
type Live={ref:AgentMatchRef;a:Address;b:Address;mode:0|1;lane:string};
const quiet=()=>{};
const matchHref=(ref:AgentMatchRef)=>`/agents/arenas/${ref.app}/${ref.epoch}/${ref.id}`;
export function AgentPoolArcade({enabled,tournaments,initialMode,initialView,initialAgent}:{enabled:boolean;tournaments:boolean;initialMode:0|1;initialView:'play'|'watch';initialAgent?:string}){
 const router=useRouter(),[config,setConfig]=useState<AgentPoolManifest|null>(null),[people,setPeople]=useState<Person[]>([]),[live,setLive]=useState<Live[]>([]);
 const [mode,setMode]=useState(initialMode),[view,setView]=useState(initialView),[account,setAccount]=useState<Address>(),[request,setRequest]=useState<PoolChallengeView|null>(null);
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[connectOpen,setConnectOpen]=useState(false),[selected,setSelected]=useState(initialAgent??''),[retry,setRetry]=useState(0),[offset,setOffset]=useState('0'),[next,setNext]=useState<string|null>(null);
 const [catalogError,setCatalogError]=useState(''),[queueError,setQueueError]=useState(''),[renewing,setRenewing]=useState(false);
 const [watchMode,setWatchMode]=useState<'all'|0|1>('all');
 const visibleError=(!connectOpen&&error)||queueError||catalogError;
 const session=useRef<PoolFamilySession|null>(null),locked=useRef(false),intent=useRef<Address|null>(null),alive=useRef(false);
 const person=(p:string)=>people.find(x=>x.agent.toLowerCase()===p.toLowerCase());
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{if(!enabled)return;const remembered=rememberedAccount();if(remembered)setAccount(remembered.address);},[enabled]);
 useEffect(()=>{
  if(!enabled)return;let stopped=false,timer:ReturnType<typeof setTimeout>;const abort=new AbortController();
  const refresh=async()=>{let delay=10000;
   try{
    if(document.hidden)return;
    const results=await Promise.allSettled([
     poolApi<AgentPoolManifest>('config',undefined,abort.signal).then(raw=>{const m=validateAgentPoolManifest(raw);if(!m.enabled)throw Error('Agent Arcade is not open');if(!stopped)setConfig(m);}),
     poolApi<{items:Person[];next:string|null}>(`catalog?offset=${offset}&limit=16`,undefined,abort.signal).then(catalog=>{if(!stopped){setPeople(catalog.items);setNext(catalog.next);}}),
     poolApi<{items:Live[]}>('live',undefined,abort.signal).then(games=>{if(!stopped)setLive(games.items);}),
    ]);
    const failed=results.find(r=>r.status==='rejected');if(failed?.status==='rejected')throw failed.reason;
    if(!stopped)setCatalogError('');
   }catch(e){if(!stopped){setCatalogError(poolUserError(e));delay=Math.max(10000,engineReadRetryMs(e));}}
   finally{if(!stopped)timer=setTimeout(refresh,delay);}
  };void refresh();return()=>{stopped=true;clearTimeout(timer);abort.abort();};
 },[enabled,retry,offset]);
 useEffect(()=>{
  if(!config||!account)return;let stopped=false,timer:ReturnType<typeof setTimeout>;const abort=new AbortController();
  const poll=async()=>{let delay=2000;try{
   if(document.hidden)return;const result=await poolApi<{request:PoolChallengeView|null}>(`challenges/${account}`,undefined,abort.signal);
   if(stopped)return;setRequest(result.request);setQueueError('');if(!result.request)delay=10000;if(result.request?.ref){router.push(matchHref(result.request.ref));return;}
  }catch(e){if(!stopped)setQueueError(poolUserError(e));delay=Math.max(5000,engineReadRetryMs(e));}finally{if(!stopped)timer=setTimeout(poll,delay);}};
  void poll();return()=>{stopped=true;clearTimeout(timer);abort.abort();};
 },[config?.pool,account,retry,router]);
 async function run(fn:()=>Promise<void>){if(locked.current)return;locked.current=true;setBusy(true);setError('');try{await fn();}catch(e){if(alive.current)setError(poolUserError(e));}finally{locked.current=false;if(alive.current)setBusy(false);}}
 async function challenge(m:AgentPoolManifest,s:PoolFamilySession,agent:Address){
  const sponsor=poolBrowserSponsor(m,s.grant.player);await finishPoolSponsor(sponsor);
  const existing=await poolApi<{request:PoolChallengeView|null}>(`challenges/${s.grant.player}`);
  if(existing.request){setRequest(existing.request);if(existing.request.ref)router.push(matchHref(existing.request.ref));return;}
  const prepared=await preparePoolChallenge(poolBase(),m,privateKeyToAccount(s.key),s.grant.player,{agent,mode});
  await finishPoolSponsor(sponsor,prepared);setRetry(n=>n+1);
 }
 function choose(agent:Address){setSelected(agent);intent.current=agent;void run(async()=>{
  if(!config)throw Error('The arcade is reconnecting');
  const saved=account?loadPoolFamily(config,account,sessionStorage):null;
  if(saved){await finishPoolSponsor(poolBrowserSponsor(config,saved.grant.player));const observed=await observePoolFamily(poolBase(),config,saved);
   // Renew here, in the lobby, rather than let the grant expire mid-match.
   if(observed.active&&!familyExpiresSoon(saved,observed.block.timestamp)){session.current=saved;await challenge(config,saved,agent);intent.current=null;return;}
   setRenewing(observed.active);}
  setConnectOpen(true);
 });}
 async function login(create=false){await run(async()=>{
  if(!config)throw Error('The arcade is reconnecting');const identity=await connect(create);
  try{
   setAccount(identity.account.address);const sponsor=poolBrowserSponsor(config,identity.account.address);await finishPoolSponsor(sponsor);
   const prepared=await preparePoolFamily(poolBase(),config,identity.account,sessionStorage,{renewWithin:SESSION_RENEW_MARGIN});
   if(prepared.call)await finishPoolSponsor(sponsor,prepared.call);
   session.current=prepared.session;setConnectOpen(false);setRenewing(false);const agent=intent.current;
   if(agent)await challenge(config,prepared.session,agent);intent.current=null;
  }finally{identity.end();}
 });}
 async function cancel(){await run(async()=>{
  if(!config||!account||!request)return;const saved=loadPoolFamily(config,account,sessionStorage);if(!saved)throw Error('Use the arcade session that created this challenge');
  const sponsor=poolBrowserSponsor(config,account);await finishPoolSponsor(sponsor);
  const prepared=await preparePoolChallenge(poolBase(),config,privateKeyToAccount(saved.key),account,{agent:request.agent,mode:request.mode,cancel:BigInt(request.id)});
  await finishPoolSponsor(sponsor,prepared);setRequest(null);setRetry(n=>n+1);
 });}
 return <main className="cabinet-ui rooms-shell agents-shell">
  <header className="rooms-header"><Link href="/" className="brand" aria-label="PONGIT home"><img className="brand-mark" src="/brand/opposing-orbits.webp" width="40" height="40" alt=""/><span className="brand-word">PONGIT</span></Link>
   <div className="rooms-header-actions"><ArcadeAmbience onSound={quiet}/><a href="/docs" target="_blank" rel="noreferrer">Docs ↗</a><Link href="/">Back to arcade</Link></div></header>
  <div className="agent-heading"><div className="palace-marquee"><span className="palace-star" aria-hidden="true"/><div><h1>Agent Arcade</h1><p>Pick your rival.</p></div><span className="palace-star" aria-hidden="true"/></div>{account&&<span>{short(account)}</span>}</div>
  {!enabled?<section className="agent-empty"><h2>Qualification in progress</h2><p>The independent arenas are being tested before opening.</p></section>:<>
   {config?.releaseStage==='testnet-preview'&&<p className="agent-preview-notice" role="status">Preview · No entry fees or prizes.</p>}
   <nav className="agent-tabs" aria-label="Agent Arcade"><button aria-pressed={view==='play'} onClick={()=>setView('play')}>Play an agent</button><button aria-pressed={view==='watch'} onClick={()=>setView('watch')}>Watch agents</button>{tournaments&&<Link href="/agents/tournaments">Tournaments</Link>}</nav>
   <div className="agent-toolbar" role="group" aria-label="Game mode">{view==='watch'&&<button aria-pressed={watchMode==='all'} onClick={()=>setWatchMode('all')}>All live matches</button>}{([0,1] as const).map(n=><button key={n} aria-pressed={(view==='watch'?watchMode:mode)===n} onClick={()=>view==='watch'?setWatchMode(n):setMode(n)} disabled={view==='play'&&(busy||!!request)}>{n===0?'Classic':'Chaos'}</button>)}</div>
   {visibleError&&<div className="tournament-error" role="alert"><p>{visibleError}</p><button onClick={()=>setRetry(n=>n+1)}>Retry</button></div>}
   {busy&&<p role="status">Confirming your action…</p>}
   {request&&<section className="agent-wait" aria-live="polite"><h2>{request.ref?'Your arena is ready':request.waitReason==='tournament'?'Your rival is in a tournament':request.waitReason==='match'?'Your rival is finishing a match':'Waiting for an available arena'}</h2><p>{person(request.agent)?.name??short(request.agent)} · {request.mode===0?'Classic':'Chaos'} · Friendly</p>
    {!request.ref&&request.waitReason==='tournament'&&<p>This bot is reserved until the tournament ends. <Link href="/agents/tournaments">Watch tournament</Link> or cancel your challenge.</p>}
    {request.ref?<Link className="rooms-button" href={matchHref(request.ref)}>Enter arena</Link>:<button disabled={busy||request.status!==1} onClick={()=>void cancel()}>Cancel challenge</button>}</section>}
   {view==='play'?<><div className="agent-grid">{people.filter(p=>p.modes.includes(mode)).map(p=><article className="agent-card" key={p.agent} data-selected={selected.toLowerCase()===p.agent.toLowerCase()}>
    <span className="agent-badge">{p.official?'PONGIT BOT':'COMMUNITY AGENT'}</span><div className="agent-identity"><Avatar index={p.avatar}/><div><h2>{p.name}</h2><p>{p.difficulty}</p></div></div>
    <p className="agent-creator">Creator {p.official?'PONGIT':short(p.creator)}</p><span className="agent-status" data-online={p.available&&p.qualification[mode]}>{!p.qualification[mode]?'Qualifying':!p.available?'Unavailable':p.waiting?'Busy, next duel can be reserved':'Available'}</span>
    <button className="primary" disabled={busy||!!request||!p.available||!p.qualification[mode]} onClick={()=>choose(p.agent)}>Challenge {p.name}</button></article>)}</div>
    {!people.length&&!error&&<p role="status">Reading the agent catalogue…</p>}<div className="agent-toolbar">{offset!=='0'&&<button onClick={()=>setOffset('0')}>First page</button>}{next&&<button onClick={()=>setOffset(next)}>More agents</button>}</div></>:<div className="agent-grid">
    {live.filter(g=>watchMode==='all'||g.mode===watchMode).map(g=><article className="agent-card" key={matchHref(g.ref)}><span className="agent-badge">{g.lane.toUpperCase()} · {g.mode===0?'CLASSIC':'CHAOS'}</span><h2>{person(g.a)?.name??short(g.a)} vs {person(g.b)?.name??short(g.b)}</h2><Link className="rooms-button" href={matchHref(g.ref)}>Open arena ↗</Link></article>)}
    {!live.some(g=>watchMode==='all'||g.mode===watchMode)&&<section className="agent-empty"><h2>No arena is playing right now</h2><p>The next match will appear here when it is assigned.</p></section>}</div>}
   <p>Human challenges are friendly. No bets, entry fees or prizes.</p>
  </>}
  {connectOpen&&<Dialog label="Connect to challenge an agent" onClose={()=>{if(!busy){setConnectOpen(false);intent.current=null;}}}><IconButton aria-label="Close connection" onClick={()=>{if(!busy){setConnectOpen(false);intent.current=null;}}}/><h2>{renewing?'Keep playing':'Your next rival is ready'}</h2><p>{renewing?'Your session ends soon. Confirm once to keep playing.':'Sign in to continue.'}</p><div className="button-row"><button className="primary" disabled={busy} onClick={()=>void login()}>{renewing?'Continue':'Connect & play'}</button>{!renewing&&<button disabled={busy} onClick={()=>void login(true)}>Create account</button>}</div>{error&&<p role="alert">{error}</p>}</Dialog>}
  <footer className="rooms-footer"><MusicCredit/><EngineCredit/></footer>
 </main>;
}
