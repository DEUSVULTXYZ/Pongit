'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {zeroAddress} from 'viem';
import type {AgentMatchRef} from '../../shared/agents';
import type {AgentPoolManifest,PoolMatchView} from '../../shared/agent-pool';
import {createPoolObserver} from '../../shared/agent-pool-observer';
import type {EngineState} from '../../shared/engine-stream';
import {engineReadRetryMs} from '../../shared/engine-read';
import {API,short} from '../lib/api';
import {eventHud} from '../lib/chaos-presentation';
import {Court} from './Court';
import {Avatar} from './Avatar';
import {ChaosEffectsHud} from './ChaosEffectsHud';

type Identity={agent:string;name:string;avatar:number};
const quiet=()=>{};
export function AgentPoolMatch({enabled,reference}:{enabled:boolean;reference:AgentMatchRef}){
 const [view,setView]=useState<PoolMatchView|null>(null),[snapshot,setSnapshot]=useState<EngineState|null>(null),[people,setPeople]=useState<Identity[]>([]);
 const [error,setError]=useState(''),[connection,setConnection]=useState('Connecting'),[retry,setRetry]=useState(0),[copied,setCopied]=useState('');
 const refKey=`${reference.app}:${reference.epoch}:${reference.id}`;
 const name=(address:string)=>people.find(p=>p.agent.toLowerCase()===address.toLowerCase())?.name??short(address);
 const avatar=(address:string)=>people.find(p=>p.agent.toLowerCase()===address.toLowerCase())?.avatar??9;
 useEffect(()=>{
  if(!enabled)return;let cancelled=false,timer:ReturnType<typeof setTimeout>,observer:Awaited<ReturnType<typeof createPoolObserver>>|undefined;
  setView(null);setSnapshot(null);setError('');setConnection('Connecting');
  let config:AgentPoolManifest|undefined,current:PoolMatchView|undefined,nextPublished=0,wasHidden=false;
  const controller=new AbortController();
  const get=async<T,>(path:string):Promise<T>=>{
   const response=await fetch(`${API}/agents${path}`,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(10000)])});
   if(!response.ok)throw Error(response.status===404?'This match reference does not exist.':'Agent Arcade is synchronizing. Please retry shortly.');return response.json();
  };
  const publish=(s:EngineState)=>{if(!cancelled){setSnapshot(s);setConnection(s.phase>=3?'Result on engine, publication pending':'Live engine state');}};
  const poll=async()=>{
   let delay=500;
   try{
    if(document.hidden){observer?.close();observer=undefined;wasHidden=true;delay=2000;return;}
    if(!config){config=await get<AgentPoolManifest>('/config');if(!config.enabled)throw Error('Agent Arcade qualification is still in progress');
     const catalog=await get<{items:Identity[]}>('/catalog?limit=32');if(cancelled)return;setPeople(catalog.items);}
    if(performance.now()>=nextPublished||wasHidden){
     current=await get<PoolMatchView>(`/matches/${reference.app}/${reference.epoch}/${reference.id}`);if(cancelled)return;
     if(current.ref.app.toLowerCase()!==reference.app.toLowerCase()||current.ref.epoch!==reference.epoch||current.ref.id!==reference.id)throw Error('Match reference changed unexpectedly');
     setView(current);nextPublished=performance.now()+5000;
    }
    if(!current)return;
    if(current.result){observer?.close();observer=undefined;setConnection(current.result.finality?'Final result':'Published, still contestable');setError('');delay=10000;return;}
    if(!current.node){observer?.close();observer=undefined;setConnection('Waiting for the published result');delay=2000;return;}
    if(!observer){
     const created=await createPoolObserver(config,current,u=>new WebSocket(u));
     if(cancelled){created.close();return;}observer=created;observer.watch(publish);
    }
    const state=await observer.read(wasHidden);wasHidden=false;if(cancelled)return;publish(state);setError('');
   }catch(e){if(cancelled)return;setError((e as Error).message);setConnection('Synchronizing');delay=Math.max(2000,engineReadRetryMs(e));}
   finally{if(!cancelled)timer=setTimeout(poll,Math.min(30000,delay));}
  };
  void poll();return()=>{cancelled=true;controller.abort();clearTimeout(timer);observer?.close();};
 },[enabled,refKey,retry]);
 const result=view?.result,engineDone=!!snapshot&&snapshot.phase>=3,scoreA=result?.scoreA??snapshot?.state.scoreA??0,scoreB=result?.scoreB??snapshot?.state.scoreB??0;
 const elapsed=Number(snapshot?.state.t??0n)/1_000_000,overtime=!!view?.overtimeSeconds&&elapsed>=300;
 const seconds=Math.max(0,Math.ceil((overtime?360:300)-elapsed));
 const player=(address:string)=><div className="agent-score-name"><Avatar index={avatar(address)}/><span>{name(address)}</span></div>;
 return <main className={`rooms-shell agents-shell pool-match-shell ${snapshot?.phase===2&&!result?'rooms-playing':''}`}>
  <header className="rooms-header"><Link href="/" className="brand" aria-label="PONGIT home"><img className="brand-mark" src="/brand/opposing-orbits.webp" width="40" height="40" alt=""/><span className="brand-word">PONGIT</span></Link>
   <div className="rooms-header-actions"><Link href="/agents/tournaments">Tournaments</Link><Link href="/agents">Agent Arcade</Link></div></header>
  {!enabled?<section className="agent-empty"><h1>Qualification in progress</h1><p>Independent agent arenas are not open yet.</p></section>:<>
   <div className="pool-match-toolbar"><span>{view?.mode===1?'CHAOS':'CLASSIC'} · {connection}</span><button onClick={()=>void navigator.clipboard.writeText(location.href).then(()=>setCopied('Link copied')).catch(()=>setCopied('Copy failed'))}>Copy arena link</button><span role="status">{copied}</span></div>
   {error&&<div className="pool-match-error" role="alert"><p>{error}</p><button onClick={()=>setRetry(n=>n+1)}>Retry</button></div>}
   {!view&&!error&&<p role="status">Reading the match reference…</p>}
   {view&&<section className="agent-court" aria-label="Agent arena">
    <div className="agent-scoreboard"><div>{player(view.a)}</div><div className="agent-score"><b>{String(scoreA).padStart(2,'0')}</b><small>:</small><b>{String(scoreB).padStart(2,'0')}</b></div><div>{player(view.b)}</div></div>
    {result?<div className="pool-published-result"><h1>{result.status===4?'Match cancelled':result.winner===zeroAddress?'Draw':`${name(result.winner)} wins`}</h1>
     <p>{result.finality?'Final published result':'Published on Monad, still contestable'}</p>
     {view.tournament!=='0'&&<Link href={`/agents/tournaments?id=${view.tournament}`}>View tournament</Link>}
     <p className="pool-match-reference">Arena {short(reference.app)} · Epoch {reference.epoch} · Match {reference.id}</p></div>:snapshot?<>
     <div className="agent-clock">{engineDone?'Waiting for publication':`${overtime?'Sudden death':'Time remaining'} ${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`}</div>
     {snapshot.chaos&&<ChaosEffectsHud effects={eventHud(snapshot.chaos.physics)} gameMs={Number(snapshot.state.t)/1000} players={[name(view.a),name(view.b)]}/>}
     <div className="pool-canvas-slot"><Court state={snapshot.state} chaos={snapshot.chaos} rulesVersion={10} clock={snapshot.clock>BigInt(view.overtimeSeconds?360_000_000:300_000_000)?BigInt(view.overtimeSeconds?360_000_000:300_000_000):snapshot.clock}
      observedAt={snapshot.observedAt} direction={0} side={-1} replay={false} matchId={refKey} controllable={false} pending={false} liveEngine onStats={quiet}/></div>
    </>:<div className="agent-empty"><p>Waiting for this arena to become ready.</p></div>}
   </section>}
  </>}
 </main>;
}
