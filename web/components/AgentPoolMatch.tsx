'use client';
import {poolUserError} from '../../shared/agent-pool-error';
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {zeroAddress,type Address} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import type {AgentMatchRef} from '../../shared/agents';
import type {AgentPoolManifest,PoolMatchView} from '../../shared/agent-pool';
import {createPoolObserver} from '../../shared/agent-pool-observer';
import {createPoolPlayer} from '../../shared/agent-pool-player';
import {loadPoolFamily,preparePoolFamily} from '../../shared/agent-pool-family';
import {preparePoolChallenge} from '../../shared/agent-pool-client';
import type {EngineState} from '../../shared/engine-stream';
import {engineReadRetryMs} from '../../shared/engine-read';
import {API,short} from '../lib/api';
import {eventHud} from '../lib/chaos-presentation';
import {Court} from './Court';
import {AgentScoreboard} from './AgentScoreboard';
import {ChaosEffectsHud} from './ChaosEffectsHud';
import {poolBase,poolBrowserSponsor,finishPoolSponsor} from '../lib/agent-pool';
import {connect,rememberedAccount} from '../lib/wallet';
import {arcadeAudio} from '../lib/audio';
import {ArcadeAmbience} from './ArcadeAmbience';
import {Outcome} from './Outcome';
import {Dialog} from './Dialog';
import {IconButton} from './IconButton';
import {AgentReplay} from './AgentReplay';
import {ArenaCountdown} from './MatchCountdown';

type Identity={agent:string;name:string;avatar:number};
const quiet=()=>{};
export function AgentPoolMatch({enabled,reference}:{enabled:boolean;reference:AgentMatchRef}){
 const [view,setView]=useState<PoolMatchView|null>(null),[snapshot,setSnapshot]=useState<EngineState|null>(null),[people,setPeople]=useState<Identity[]>([]);
 const [error,setError]=useState(''),[connection,setConnection]=useState('Connecting'),[retry,setRetry]=useState(0),[copied,setCopied]=useState(''),[replay,setReplay]=useState(false);
 const [account,setAccount]=useState<Address>(),[ready,setReady]=useState(false),[direction,setDirection]=useState<-1|0|1>(0),[pending,setPending]=useState(false),[tools,setTools]=useState(false),[busy,setBusy]=useState(false),[controlError,setControlError]=useState('');
 const playerClient=useRef<ReturnType<typeof createPoolPlayer>|null>(null),manifest=useRef<AgentPoolManifest|null>(null),lastRef=useRef(''),commandVersion=useRef(0),actionBusy=useRef(false),router=useRouter();
 const recoveryVersion=useRef(0);
 const [countdown,setCountdown]=useState<{id:string;deadline:number;clock:number;observedAt:number}>();
 const side=view&&account?view.a.toLowerCase()===account.toLowerCase()?0:view.b.toLowerCase()===account.toLowerCase()?1:-1:-1;
 const controllable=ready&&side>=0&&snapshot?.phase===2&&!view?.result&&!tools;
 const control=useRef(false);control.current=controllable;
 const refKey=`${reference.app}:${reference.epoch}:${reference.id}`;
 const name=(address:string)=>people.find(p=>p.agent.toLowerCase()===address.toLowerCase())?.name??short(address);
 const avatar=(address:string)=>people.find(p=>p.agent.toLowerCase()===address.toLowerCase())?.avatar??9;
 // Names and portraits must not gate authorization, F5 recovery or observation.
 // A slow catalogue leaves address labels in place while the arena connects.
 useEffect(()=>{
  if(!enabled)return;const abort=new AbortController();let cancelled=false,timer:ReturnType<typeof setTimeout>;
  const load=async()=>{
   try{
    const response=await fetch(`${API}/agents/catalog?limit=32`,{signal:AbortSignal.any([abort.signal,AbortSignal.timeout(10000)])});
    if(!response.ok)throw Error('Catalogue unavailable');const catalog:{items:Identity[]}=await response.json();
    if(!cancelled)setPeople(catalog.items);
   }catch{if(!cancelled)timer=setTimeout(load,30000);}
  };
  void load();return()=>{cancelled=true;abort.abort();clearTimeout(timer);};
 },[enabled,refKey]);
 useEffect(()=>{
  if(!enabled)return;let cancelled=false,timer:ReturnType<typeof setTimeout>,observer:Awaited<ReturnType<typeof createPoolObserver>>|ReturnType<typeof createPoolPlayer>|undefined,release:(()=>void)|undefined;
  if(lastRef.current!==refKey){lastRef.current=refKey;setView(null);setSnapshot(null);setDirection(0);}setError('');setConnection('Connecting');setReady(false);
  let config:AgentPoolManifest|undefined,current:PoolMatchView|undefined,nextPublished=0,nextRecovery=0,retryRecoveryAt=0,recoveredVersion=-1,wasHidden=false;
  let publishedRequest:Promise<void>|undefined;
  const controller=new AbortController();
  const get=async<T,>(path:string):Promise<T>=>{
   const response=await fetch(`${API}/agents${path}`,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(30000)])});
   if(!response.ok)throw Error(response.status===404?'This match reference does not exist.':'Agent Arcade is synchronizing. Please retry shortly.');return response.json();
  };
  const publish=(s:EngineState)=>{if(!cancelled){setSnapshot(s);setConnection(s.phase>=3?'Result on engine, publication pending':'Live engine state');}};
  const matchPath=`/matches/${reference.app}/${reference.epoch}/${reference.id}`;
  const acceptView=(value:PoolMatchView)=>{
   if(value.ref.app.toLowerCase()!==reference.app.toLowerCase()||value.ref.epoch!==reference.epoch||value.ref.id!==reference.id)throw Error('Match reference changed unexpectedly');
   current=value;setView(value);nextPublished=performance.now()+5000;
  };
  const refreshPublished=()=>{
   if(publishedRequest)return;
   nextPublished=performance.now()+5000;
   // Canonical result verification may be slow. Keep observing the engine while
   // this single request runs; its result remains authoritative when it arrives.
   publishedRequest=get<PoolMatchView>(matchPath).then(value=>{if(!cancelled)acceptView(value);})
    .catch(()=>{if(!cancelled)nextPublished=performance.now()+5000;})
    .finally(()=>{publishedRequest=undefined;});
  };
  const poll=async()=>{
   let delay=500;
   try{
    if(document.hidden){wasHidden=true;delay=2000;return;}
    if(!config){
     const [loaded,value]=await Promise.all([get<AgentPoolManifest>('/config'),get<PoolMatchView>(matchPath)]);if(cancelled)return;
     if(!loaded.enabled)throw Error('Agent Arcade qualification is still in progress');
     acceptView(value);config=loaded;manifest.current=config;
     const saved=rememberedAccount();if(saved)setAccount(saved.address);
    }
    if(performance.now()>=nextPublished||wasHidden){
     refreshPublished();
    }
    if(!current)return;
    if(current.result){observer?.close();observer=undefined;playerClient.current=null;setReady(false);setControlError('');setConnection(current.result.finality?'Final result':'Published, still contestable');setError('');delay=10000;return;}
    if(!current.node){observer?.close();observer=undefined;playerClient.current=null;setReady(false);setConnection('Waiting for arena synchronization');delay=2000;return;}
    if(!observer){
     const remembered=rememberedAccount(),saved=remembered?loadPoolFamily(config,remembered.address,sessionStorage):null;
     const participant=saved&&[current.a,current.b].some(a=>a.toLowerCase()===saved.grant.player.toLowerCase());
     let created:Awaited<ReturnType<typeof createPoolObserver>>|ReturnType<typeof createPoolPlayer>;
     if(participant){
      if(!release){
       if(!navigator.locks)throw Error('Use a browser with arcade session protection');
       release=await new Promise<()=>void>((resolve,reject)=>{void navigator.locks.request(`pongit:agent-pool:${config!.pool}:${saved.grant.player}`,{ifAvailable:true},async token=>{
        if(!token){reject(Error('This account is already controlling an arena in another tab'));return;}await new Promise<void>(done=>resolve(done));
       }).catch(reject);});
      }
      if(cancelled){release?.();return;}
      const controlled=createPoolPlayer(config,current,saved,{base:poolBase(),storage:sessionStorage,socket:u=>new WebSocket(u)});created=controlled;playerClient.current=controlled;
     }else created=await createPoolObserver(config,current,u=>new WebSocket(u));
     if(cancelled){created.close();return;}observer=created;observer.watch(publish);
    }
    if(playerClient.current&&performance.now()>=retryRecoveryAt&&(wasHidden||performance.now()>=nextRecovery||recoveredVersion!==recoveryVersion.current)){
     nextRecovery=performance.now()+10000;
     const version=recoveryVersion.current;
     try{
      if(recoveredVersion!==version)await playerClient.current.recover();else await playerClient.current.synchronize();
      if(cancelled)return;recoveredVersion=version;retryRecoveryAt=0;
      if(recoveryVersion.current===version){setReady(true);setControlError('');}
     }
     catch(e){if(cancelled)return;setReady(false);setControlError(poolUserError(e));retryRecoveryAt=performance.now()+Math.max(1000,engineReadRetryMs(e));nextRecovery=retryRecoveryAt;}
    }
    const state=await observer.read(wasHidden);wasHidden=false;if(cancelled)return;publish(state);setError('');
    if(config.version===4&&state.phase===1){
     // The human seat acknowledges an actually painted court. A hidden tab
     // cannot start a countdown it has never shown to its player.
     const controlled=playerClient.current;
     if(controlled&&recoveredVersion===recoveryVersion.current){
      await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
      if(cancelled||document.hidden||playerClient.current!==controlled)return;
      publish(await controlled.ready());
     }
     const launch=await observer.launch();if(!cancelled&&launch)setCountdown({id:refKey,...launch});
    }
   }catch(e){if(cancelled)return;setError(poolUserError(e));setConnection('Synchronizing');delay=Math.max(2000,engineReadRetryMs(e));}
   finally{if(!cancelled)timer=setTimeout(poll,Math.min(30000,delay));}
  };
  void poll();return()=>{cancelled=true;controller.abort();clearTimeout(timer);observer?.close();playerClient.current=null;release?.();};
 },[enabled,refKey,retry]);
 async function move(dir:-1|0|1){
  const client=playerClient.current;if(!client||!control.current&&dir!==0)return;const version=++commandVersion.current;setDirection(dir);setPending(true);
  try{await client.move(dir);setControlError('');}catch(e){recoveryVersion.current++;setControlError(poolUserError(e));setReady(false);}finally{if(commandVersion.current===version)setPending(false);}
 }
 useEffect(()=>{
  const keys=new Set<string>();const key=(e:KeyboardEvent)=>{if(!['ArrowUp','ArrowDown','KeyW','KeyS'].includes(e.code))return;
   if(e.type==='keyup')keys.delete(e.code);
   if(!control.current||(e.target as HTMLElement)?.closest('input,textarea,select,[contenteditable=true],[role=dialog]')){if(e.type==='keyup'){keys.clear();void move(0);}return;}
   e.preventDefault();if(e.type==='keydown')keys.add(e.code);else keys.delete(e.code);const up=keys.has('ArrowUp')||keys.has('KeyW'),down=keys.has('ArrowDown')||keys.has('KeyS');void move(up===down?0:up?-1:1);};
  const stop=()=>{keys.clear();void move(0);};const visibility=()=>{if(document.hidden)stop();};
  window.addEventListener('keydown',key);window.addEventListener('keyup',key);window.addEventListener('blur',stop);document.addEventListener('visibilitychange',visibility);
  return()=>{window.removeEventListener('keydown',key);window.removeEventListener('keyup',key);window.removeEventListener('blur',stop);document.removeEventListener('visibilitychange',visibility);};
 },[]);
 useEffect(()=>{arcadeAudio.setGameplay(snapshot?.phase===2&&!view?.result);return()=>arcadeAudio.setGameplay(false);},[snapshot?.phase,!!view?.result]);
 async function action(fn:()=>Promise<void>){if(actionBusy.current)return;actionBusy.current=true;setBusy(true);try{await fn();setControlError('');}catch(e){setControlError(poolUserError(e));}finally{actionBusy.current=false;setBusy(false);}}
 async function renew(){await action(async()=>{
  const m=manifest.current;if(!m||!view||!account)throw Error('Read this arena before renewing');
  const identity=await connect();try{
   if(identity.account.address.toLowerCase()!==account.toLowerCase())throw Error('Use the passkey for this player');
   const sponsor=poolBrowserSponsor(m,account);await finishPoolSponsor(sponsor);const prepared=await preparePoolFamily(poolBase(),m,identity.account,sessionStorage);
   if(prepared.call)await finishPoolSponsor(sponsor,prepared.call);
   // The observation loop owns the sole node connection. Stop it before the
   // temporary owner operation; the following retry restores normal watching.
   playerClient.current?.close();playerClient.current=null;setReady(false);
   const candidate=createPoolPlayer(m,view,prepared.session,{base:poolBase(),storage:sessionStorage,socket:u=>new WebSocket(u)});
   try{await candidate.renew(identity.account);}finally{candidate.close();setRetry(n=>n+1);}setTools(false);
  }finally{identity.end();}
 });}
 async function revoke(){await action(async()=>{
  const client=playerClient.current;if(!client||!account)throw Error('Read this arena before revoking');
  const identity=await connect();try{
   if(identity.account.address.toLowerCase()!==account.toLowerCase())throw Error('Use the passkey for this player');
   await client.revoke(identity.account);setReady(false);setTools(false);setRetry(n=>n+1);
  }finally{identity.end();}
 });}
 async function rematch(){const m=manifest.current;if(!m||!view||!account)throw Error('Your arcade session is unavailable');const s=loadPoolFamily(m,account,sessionStorage);if(!s)throw Error('Renew your arcade session');
  const sponsor=poolBrowserSponsor(m,account);await finishPoolSponsor(sponsor);const agent=side===0?view.b:view.a;
  await finishPoolSponsor(sponsor,await preparePoolChallenge(poolBase(),m,privateKeyToAccount(s.key),account,{agent,mode:view.mode}));router.push(`/agents?mode=${view.mode}`);
 }
 const result=view?.result,engineDone=!!snapshot&&snapshot.phase>=3,scoreA=result?.scoreA??snapshot?.state.scoreA??0,scoreB=result?.scoreB??snapshot?.state.scoreB??0;
 const elapsed=Number(snapshot?.state.t??0n)/1_000_000,overtime=!!view?.overtimeSeconds&&elapsed>=300;
 const seconds=Math.max(0,Math.ceil((overtime?360:300)-elapsed));
 return <main className={`cabinet-ui rooms-shell agents-shell pool-match-shell ${snapshot?.phase===2&&!result?'rooms-playing':''}`}>
  <header className="rooms-header"><Link href="/" className="brand" aria-label="PONGIT home"><img className="brand-mark" src="/brand/opposing-orbits.webp" width="40" height="40" alt=""/><span className="brand-word">PONGIT</span></Link>
   <div className="rooms-header-actions"><ArcadeAmbience onSound={quiet}/><Link href="/agents/tournaments">Tournaments</Link><Link href="/agents">Agent Arcade</Link>{side>=0&&<button onClick={()=>{void move(0);setTools(true);}}>Tools</button>}</div></header>
  {!enabled?<section className="agent-empty"><h1>Qualification in progress</h1><p>Independent agent arenas are not open yet.</p></section>:<>
   <div className="pool-match-toolbar"><span>{view?.mode===1?'CHAOS':'CLASSIC'} · {connection}</span><button onClick={()=>void navigator.clipboard.writeText(location.href).then(()=>setCopied('Link copied')).catch(()=>setCopied('Copy failed'))}>Copy arena link</button><span role="status">{copied}</span></div>
   {error&&<div className="pool-match-error" role="alert"><p>{error}</p><button onClick={()=>setRetry(n=>n+1)}>Retry</button></div>}
   {controlError&&!tools&&<div className="pool-match-error" role="status"><p>{controlError}</p><button onClick={()=>{void move(0);setTools(true);}}>Session tools</button></div>}
   {!view&&!error&&<p role="status">Reading the match reference…</p>}
   {view&&<section className="rooms-court court-card agent-court" aria-label="Agent arena">
    <AgentScoreboard players={[{name:name(view.a),avatar:avatar(view.a)},{name:name(view.b),avatar:avatar(view.b)}]} scores={[scoreA,scoreB]} caption={engineDone?'RESULT ON ENGINE':`${overtime?'SUDDEN DEATH':'FIRST TO SEVEN'} · ${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`}/>
    {result?<div className="pool-published-result"><h1>{result.status===4?'Match cancelled':result.winner===zeroAddress?'Draw':`${name(result.winner)} wins`}</h1>
     <p>{result.finality?'Final published result':'Published on Monad, still contestable'}</p>
     {result.status===3&&<button onClick={()=>setReplay(true)}>Watch replay</button>}
     {view.tournament!=='0'&&<Link href={`/agents/tournaments?id=${view.tournament}`}>View tournament</Link>}
     <p className="pool-match-reference">Arena {short(reference.app)} · Epoch {reference.epoch} · Match {reference.id}</p></div>:snapshot?<>
     {snapshot.chaos&&<ChaosEffectsHud effects={eventHud(snapshot.chaos.physics)} gameMs={Number(snapshot.state.t)/1000} players={[name(view.a),name(view.b)]}/>}
     <div className="pool-canvas-slot"><Court state={snapshot.state} chaos={snapshot.chaos} rulesVersion={manifest.current?.rulesVersion??10} clock={snapshot.clock>BigInt(view.overtimeSeconds?360_000_000:300_000_000)?BigInt(view.overtimeSeconds?360_000_000:300_000_000):snapshot.clock}
      observedAt={snapshot.observedAt} direction={direction} side={side} replay={false} matchId={refKey} controllable={controllable} pending={pending} confirmedNonce={side===0?snapshot.nonceA:snapshot.nonceB} liveEngine bufferedSpectator onStats={quiet}/>{manifest.current?.version===4&&snapshot.phase===1&&<ArenaCountdown id={refKey} deadline={countdown?.id===refKey?countdown.deadline:undefined} clock={countdown?.clock} observedAt={countdown?.observedAt}/>}</div>
     <div className="rooms-court-controls"><span>{side>=0?'W / S · ↑ / ↓':'SPECTATING'}</span>{side>=0&&<div className="touch-controls">{([-1,1] as const).map(dir=><IconButton key={dir} icon={dir===-1?'up':'down'} aria-label={dir===-1?'Move up':'Move down'} disabled={!controllable} onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);void move(dir);}} onPointerUp={()=>void move(0)} onPointerCancel={()=>void move(0)} onLostPointerCapture={()=>void move(0)}/>)}</div>}</div>
    </>:<div className="agent-empty"><p>Waiting for this arena to become ready.</p></div>}
   </section>}
  </>}
  {tools&&<Dialog label="Arena tools" onClose={()=>setTools(false)}><IconButton aria-label="Close arena tools" onClick={()=>setTools(false)}/><h2>Arena tools</h2>{controlError&&<p role="alert">{controlError}</p>}
   <button disabled={busy} onClick={()=>void renew()}>Renew arcade session</button><button disabled={busy||!playerClient.current} onClick={()=>void revoke()}>Revoke this arena session</button><button disabled={busy||!playerClient.current} onClick={()=>void action(async()=>{await playerClient.current!.concede();setTools(false);})}>Concede match</button></Dialog>}
  <Outcome id={refKey} match={snapshot?{playerA:snapshot.a,playerB:snapshot.b,winner:result?.winner??snapshot.winner,status:result?.status??snapshot.phase,state:{...snapshot.state,scoreA,scoreB},ranked:false,mode:view?.mode??0,draw:(result?.status??snapshot.phase)===3&&(result?.winner??snapshot.winner)===zeroAddress}:null}
   account={account??''} rating={null} sound={arcadeAudio.settings.enabled} replay={false} confirmation="engine" rematch={rematch} watch={()=>setReplay(true)} again={()=>router.push('/agents')} againLabel="Choose another agent"/>
  {replay&&<Dialog label="Match replay" onClose={()=>setReplay(false)}><IconButton className="modal-close" aria-label="Close replay" onClick={()=>setReplay(false)}/><h2>Match replay</h2><AgentReplay reference={reference}/></Dialog>}
 </main>;
}
