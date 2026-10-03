'use client';
import {ParticipantInputs} from '../lib/participant-inputs';
import {queuedDirections} from '../../shared/agent-synchronization';
import {ArcadeProgress} from './ArcadeProgress';
import {ArcadeHeader} from './ArcadeChrome';
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
import {agentHeartbeatLoop} from '../../shared/agent-heartbeat-loop';
import {loadPoolFamily,preparePoolFamily,familyExpiresSoon,SESSION_RENEW_MARGIN} from '../../shared/agent-pool-family';
import {preparePoolChallenge} from '../../shared/agent-pool-client';
import type {EngineState} from '../../shared/engine-stream';
import {engineReadRetryMs} from '../../shared/engine-read';
import {API,short} from '../lib/api';
import {eventHud} from '../lib/chaos-presentation';
import {Court,type CourtPlayback} from './Court';
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
import replayStyles from './AgentReplay.module.css';
import {ArenaCountdown} from './MatchCountdown';
import {quietFailure} from '../lib/quiet-failure';
import {preparingArena,arenaEntryRetryMs} from '../lib/arena-wait';
import {useCourtFit} from '../lib/use-court-fit';

type Identity={agent:string;name:string;avatar:number};
const quiet=()=>{};
export function AgentPoolMatch({enabled,reference}:{enabled:boolean;reference:AgentMatchRef}){
 const [view,setView]=useState<PoolMatchView|null>(null),[snapshot,setSnapshot]=useState<EngineState|null>(null),[people,setPeople]=useState<Identity[]>([]);
 const [error,setError]=useState(''),[connection,setConnection]=useState('Connecting'),[retry,setRetry]=useState(0),[copied,setCopied]=useState(''),[replay,setReplay]=useState(false);
 const [streamPaused,setStreamPaused]=useState(false);
 const [painted,setPainted]=useState<CourtPlayback>();
 const paintedAt=useRef(0);
 const [account,setAccount]=useState<Address>(),[ready,setReady]=useState(false),[direction,setDirection]=useState<-1|0|1>(0),[pending,setPending]=useState(false),[tools,setTools]=useState(false),[busy,setBusy]=useState(false),[controlError,setControlError]=useState('');
 const playerClient=useRef<ReturnType<typeof createPoolPlayer>|null>(null),manifest=useRef<AgentPoolManifest|null>(null),lastRef=useRef(''),commandVersion=useRef(0),actionBusy=useRef(false),router=useRouter();
 const recoveryVersion=useRef(0);
 const inputTimeline=useRef(new ParticipantInputs()),latestSnapshot=useRef<EngineState|null>(null);
 const [,inputRevision]=useState(0);latestSnapshot.current=snapshot;
 const [countdown,setCountdown]=useState<{id:string;deadline:number;clock:number;observedAt:number}>();
 const side=view&&account?view.a.toLowerCase()===account.toLowerCase()?0:view.b.toLowerCase()===account.toLowerCase()?1:-1:-1;
 const controllable=ready&&side>=0&&snapshot?.phase===2&&!view?.result&&!tools&&(snapshot.sync?.pause.status??0)<2;
 const control=useRef(false);control.current=controllable;
 const heartbeatEnabled=useRef(false);heartbeatEnabled.current=ready&&side>=0&&snapshot?.phase===2&&!view?.result&&!tools;
 const heartbeatLoop=useRef<ReturnType<typeof agentHeartbeatLoop>|null>(null);
 const acceptIntent=useRef(false);acceptIntent.current=side>=0&&snapshot?.phase===2&&!view?.result&&!tools;
 const refKey=`${reference.app}:${reference.epoch}:${reference.id}`;
 const name=(address:string)=>people.find(p=>p.agent.toLowerCase()===address.toLowerCase())?.name??short(address);
 const avatar=(address:string)=>people.find(p=>p.agent.toLowerCase()===address.toLowerCase())?.avatar??9;
 const courtObserved=!!snapshot||!!view?.result;
 // The catalogue shares the Monad RPC budget with admission. Start cosmetic
 // reads only after the court or published result arrives, so a large registry
 // cannot delay authorization, F5 recovery or the initial countdown.
 useEffect(()=>{
  if(!enabled||!courtObserved)return;const abort=new AbortController();let cancelled=false,timer:ReturnType<typeof setTimeout>;
  const load=async()=>{
   try{
    const response=await fetch(`${API}/agents/catalog?limit=32`,{signal:AbortSignal.any([abort.signal,AbortSignal.timeout(10000)])});
    if(!response.ok)throw Error('Catalogue unavailable');const catalog:{items:Identity[]}=await response.json();
    if(!cancelled)setPeople(catalog.items);
   }catch{if(!cancelled)timer=setTimeout(load,30000);}
  };
  void load();return()=>{cancelled=true;abort.abort();clearTimeout(timer);};
 },[enabled,refKey,courtObserved]);
 useEffect(()=>{
  if(!enabled)return;let cancelled=false,timer:ReturnType<typeof setTimeout>,observer:Awaited<ReturnType<typeof createPoolObserver>>|ReturnType<typeof createPoolPlayer>|undefined,release:(()=>void)|undefined;
  if(lastRef.current!==refKey){lastRef.current=refKey;inputTimeline.current.reset();setView(null);setSnapshot(null);setDirection(0);}setError('');setConnection('Connecting');setReady(false);
  let config:AgentPoolManifest|undefined,current:PoolMatchView|undefined,nextPublished=0,nextRecovery=0,retryRecoveryAt=0,recoveredVersion=-1,wasHidden=false;
  let entryStarted=0,firstState=false;
  let publishedRequest:Promise<void>|undefined;
  const controller=new AbortController(),quiet=quietFailure();
  const get=async<T,>(path:string):Promise<T>=>{
   const response=await fetch(`${API}/agents${path}`,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(30000)])});
   if(!response.ok)throw Error(response.status===404?'This match reference does not exist.':'The arcade is reconnecting. One moment.');return response.json();
  };
  const publish=(s:EngineState)=>{if(!cancelled){firstState=true;setSnapshot(s);setConnection(s.phase>=3?'Match over':'Live');}};
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
     // Admission gates do not revoke an existing match. Keep its verified
     // observer/player and published result available while new games pause.
     acceptView(value);config=loaded;manifest.current=config;
     const saved=rememberedAccount();if(saved)setAccount(saved.address);
    }
    if(performance.now()>=nextPublished||wasHidden){
     refreshPublished();
    }
    if(!current)return;
    if(current.result){observer?.close();observer=undefined;playerClient.current=null;setReady(false);setControlError('');setConnection(current.result.finality?'Final result':'Result recorded');setError('');delay=10000;return;}
    if(!current.node){observer?.close();observer=undefined;playerClient.current=null;setReady(false);setConnection('Getting the arena ready');delay=2000;return;}
    if(!observer){
     if(!entryStarted)entryStarted=performance.now();
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
      const controlled=createPoolPlayer(config,current,saved,{base:poolBase(),storage:sessionStorage,socket:u=>new WebSocket(u),onInput:input=>{
       const state=latestSnapshot.current;if(cancelled||!state)return;
       inputTimeline.current.notice(input,state.clock,state.observedAt);inputRevision(n=>n+1);
      },onReconciled:state=>{if(!cancelled){inputTimeline.current.reset();latestSnapshot.current=state;publish(state);}}});created=controlled;playerClient.current=controlled;
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
     catch(e){
      if(cancelled)return;
      const valid=playerClient.current?.controlsAvailable()??false;setReady(valid);
      // Before the engine admits the match its binding is simply not there yet:
      // that is preparation, not a failure, and it is checked again within a second.
      if(valid)setControlError('');else if(preparingArena(e)){setControlError('');setConnection('Preparing your arena');}else setControlError(poolUserError(e));
      retryRecoveryAt=performance.now()+arenaEntryRetryMs(e,!firstState,performance.now()-entryStarted,1000);nextRecovery=retryRecoveryAt;
      // An absent binding also makes the following snapshot read premature.
      // Its unrelated revert used to replace the entry retry with a two-second
      // generic backoff. Wait for the verified binding before asking for state.
      if(!valid&&preparingArena(e)){delay=Math.max(0,retryRecoveryAt-performance.now());return;}
     }
    }
    const state=await observer.read(wasHidden);wasHidden=false;if(cancelled)return;publish(state);quiet.recovered();setError('');
    if(config.version>=4&&state.phase===1){
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
   }catch(e){if(cancelled)return;setError(quiet.failed(poolUserError(e)));setConnection('Reconnecting');delay=arenaEntryRetryMs(e,!firstState,entryStarted?performance.now()-entryStarted:Infinity);}
   finally{if(!cancelled)timer=setTimeout(poll,Math.min(30000,delay));}
  };
  void poll();return()=>{cancelled=true;controller.abort();clearTimeout(timer);observer?.close();playerClient.current=null;release?.();};
 },[enabled,refKey,retry]);
 async function move(dir:-1|0|1){
  const client=playerClient.current;if(!client||!acceptIntent.current&&dir!==0)return;const version=++commandVersion.current;setDirection(dir);setPending(true);
  try{await client.move(dir);setControlError('');}catch(e){recoveryVersion.current++;setControlError(poolUserError(e));setReady(false);}finally{if(commandVersion.current===version)setPending(false);}
 }
 useEffect(()=>{
  let active=true;
  const loop=agentHeartbeatLoop(async()=>{
   const client=playerClient.current;if(!client)return;
   const state=await client.heartbeat(true);if(active)setSnapshot(state);
  },()=>!!playerClient.current&&!document.hidden&&performance.now()-paintedAt.current<=500&&heartbeatEnabled.current&&manifest.current?.friendlyPause==='heartbeat-v1',error=>{
   if(active){recoveryVersion.current++;setControlError(poolUserError(error));setReady(false);}
  });heartbeatLoop.current=loop;
  return()=>{active=false;if(heartbeatLoop.current===loop)heartbeatLoop.current=null;void loop.stop();};
 },[refKey]);
 // The first confirmed playing frame must not wait another timer period before
 // renewing its initial 500ms credit. The same loop still checks fresh paint.
 useEffect(()=>{heartbeatLoop.current?.poke();},[refKey,ready,snapshot?.phase,tools,!!view?.result]);
 useEffect(()=>{
  const keys=new Set<string>();const key=(e:KeyboardEvent)=>{if(!['ArrowUp','ArrowDown','KeyW','KeyS'].includes(e.code))return;
   if(e.type==='keyup')keys.delete(e.code);
   if(!acceptIntent.current||(e.target as HTMLElement)?.closest('input,textarea,select,[contenteditable=true],[role=dialog]')){if(e.type==='keyup'){keys.clear();void move(0);}return;}
   e.preventDefault();if(e.type==='keydown')keys.add(e.code);else keys.delete(e.code);const up=keys.has('ArrowUp')||keys.has('KeyW'),down=keys.has('ArrowDown')||keys.has('KeyS');void move(up===down?0:up?-1:1);};
  const stop=()=>{keys.clear();void move(0);};const visibility=()=>{if(document.hidden)stop();};
  window.addEventListener('keydown',key);window.addEventListener('keyup',key);window.addEventListener('blur',stop);document.addEventListener('visibilitychange',visibility);
  return()=>{window.removeEventListener('keydown',key);window.removeEventListener('keyup',key);window.removeEventListener('blur',stop);document.removeEventListener('visibilitychange',visibility);};
 },[]);
 useEffect(()=>{arcadeAudio.setGameplay(snapshot?.phase===2&&(snapshot.sync?.pause.status??0)<2&&!view?.result);return()=>arcadeAudio.setGameplay(false);},[snapshot?.phase,snapshot?.sync?.pause.status,!!view?.result]);
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
 async function rematch(){const m=manifest.current;if(!m||!view||!account)throw Error('Your arcade session is unavailable');let s=loadPoolFamily(m,account,sessionStorage);if(!s)throw Error('Renew your arcade session');
  const sponsor=poolBrowserSponsor(m,account);await finishPoolSponsor(sponsor);const agent=side===0?view.b:view.a;
  // The rematch starts from the result screen: renew here, never mid-match.
  if(familyExpiresSoon(s,(await poolBase().getBlock()).timestamp)){
   const identity=await connect();
   try{
    if(identity.account.address.toLowerCase()!==account.toLowerCase())throw Error('Use the passkey for this player');
    const prepared=await preparePoolFamily(poolBase(),m,identity.account,sessionStorage,{renewWithin:SESSION_RENEW_MARGIN});
    if(prepared.call)await finishPoolSponsor(sponsor,prepared.call);s=prepared.session;
   }finally{identity.end();}
  }
  await finishPoolSponsor(sponsor,await preparePoolChallenge(poolBase(),m,privateKeyToAccount(s.key),account,{agent,mode:view.mode}));router.push(`/agents?mode=${view.mode}`);
 }
 const result=view?.result,engineDone=!!snapshot&&snapshot.phase>=3;
 // A terminal engine snapshot stays on the court until the confirmed buffer
 // reaches it. Published history without a live terminal snapshot is shown
 // directly; it must not strand a spectator waiting for a retired engine.
 const playout=painted?.matchId===refKey?painted:null;
 const draining=!!playout&&snapshot?.phase===3&&snapshot.state.finished&&!playout.finished&&result?.status!==4;
 const displayedResult=draining?undefined:result;
 const displayDone=engineDone&&!draining;
 const scoreA=displayedResult?.scoreA??playout?.scoreA??snapshot?.state.scoreA??0,scoreB=displayedResult?.scoreB??playout?.scoreB??snapshot?.state.scoreB??0;
 const elapsed=playout?playout.gameMs/1000:Number(snapshot?.state.t??0n)/1_000_000,overtime=!!view?.overtimeSeconds&&elapsed>=300;
 const seconds=Math.max(0,Math.ceil((overtime?360:300)-elapsed));
 const playing=!!snapshot&&!displayedResult;
 const paused=snapshot?.phase===2&&(snapshot.sync?.pause.status??0)>=2;
 const resume=paused&&snapshot?.sync?.pause.status===3?snapshot.sync.pause.resumeBlock:undefined;
 const courtRoot=useCourtFit(playing,`${refKey}:${view?.mode??0}`);
 return <main ref={courtRoot} data-mode={view?.mode===1?'chaos':'classic'} className={`cabinet-ui rooms-shell agents-shell pool-match-shell ${playing?'rooms-playing':''}`}>
  <ArcadeHeader><ArcadeAmbience onSound={quiet}/><Link href="/agents/tournaments">Tournaments</Link><Link href="/agents">Agent Arcade</Link>{side>=0&&<button onClick={()=>{void move(0);setTools(true);}}>Tools</button>}</ArcadeHeader>
  {!enabled?<section className="agent-empty"><h1>Qualification in progress</h1><p>Independent agent arenas are not open yet.</p></section>:<>
   <div className="pool-match-toolbar"><Link className="pool-compact-back" href="/agents">Back</Link><span>{view?.mode===1?'CHAOS':'CLASSIC'} · {side<0&&streamPaused&&snapshot?.phase===2&&!result?'Reconnecting':connection}<span className="pool-compact-clock"> · {overtime?'Overtime · ':''}{Math.floor(seconds/60)}:{String(seconds%60).padStart(2,'0')}</span></span><button onClick={()=>void navigator.clipboard.writeText(location.href).then(()=>setCopied('Link copied')).catch(()=>setCopied('Copy failed'))}>Copy arena link</button>{side>=0&&<button className="pool-compact-tools" onClick={()=>{void move(0);setTools(true);}}>Tools</button>}<span role="status">{copied}</span></div>
   {error&&!playing&&<ArcadeProgress stage="error" detail={error} actions={<button onClick={()=>setRetry(n=>n+1)}>Retry</button>} compact/>}
   {controlError&&!tools&&!error&&!playing&&<ArcadeProgress stage="error" detail={controlError} actions={<button onClick={()=>{void move(0);setTools(true);}}>Account</button>} compact/>}
   {!view&&!error&&<ArcadeProgress stage="loading" title="Opening your arena"/>}
   {view&&<section className="rooms-court court-card agent-court" aria-label="Agent arena">
    <AgentScoreboard players={[{name:name(view.a),avatar:avatar(view.a)},{name:name(view.b),avatar:avatar(view.b)}]} scores={[scoreA,scoreB]} caption={displayDone?'MATCH OVER':`${overtime?'SUDDEN DEATH':'FIRST TO SEVEN'} · ${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`}/>
    {displayedResult&&result?<div className="pool-published-result"><h1>{result.status===4?'Match cancelled':result.winner===zeroAddress?'Draw':`${name(result.winner)} wins`}</h1>
     <p>{result.finality?'Final result':'Result recorded'}</p>
     {result.status===3&&<button onClick={()=>setReplay(true)}>Watch replay</button>}
     {view.tournament!=='0'&&<Link href={`/agents/tournaments?id=${view.tournament}`}>View tournament</Link>}
     <details className="pool-match-reference"><summary>Match details</summary><p>{result.finality?"Recorded on Monad and final.":"Recorded on Monad. It can still be challenged until it is final."}</p><p>Arena {short(reference.app)} · Epoch {reference.epoch} · Match {reference.id}</p></details></div>:snapshot?<>
     {snapshot.chaos&&<ChaosEffectsHud effects={playout?.effects??eventHud(snapshot.chaos.physics)} gameMs={playout?playout.gameMs:Number(snapshot.state.t)/1000} players={[name(view.a),name(view.b)]}/>}
     <div className="pool-canvas-slot"><Court state={snapshot.state} chaos={snapshot.chaos} rulesVersion={manifest.current?.rulesVersion??10}
      housePrediction={snapshot.sync?{...snapshot.sync,progressive:manifest.current?.housePolicy==='progressive-v1'}:undefined}
      coherentControls={side>=0?[...queuedDirections(snapshot.sync?.pendingControls??0n),...inputTimeline.current.controls(side as 0|1,snapshot.state.t)]:undefined}
      progressionLimit={snapshot.phase!==2?snapshot.state.t:snapshot.sync?.pause.human?snapshot.sync.pause.limitUs:undefined}
      clock={snapshot.clock>BigInt(view.overtimeSeconds?360_000_000:300_000_000)?BigInt(view.overtimeSeconds?360_000_000:300_000_000):snapshot.clock}
      observedAt={snapshot.observedAt} direction={direction} side={side} replay={false} matchId={refKey} controllable={controllable} pending={pending} confirmedNonce={side===0?snapshot.nonceA:snapshot.nonceB} liveEngine bufferedSpectator onPlayback={frame=>{paintedAt.current=performance.now();setPainted(frame);}} onStats={(_fps,_predicted,waiting)=>setStreamPaused(waiting)}/>{paused?<>{resume!==undefined?<ArenaCountdown id={`${refKey}:resume:${resume}`} deadline={Number(resume)*10} clock={Number(snapshot.head)*10} observedAt={performance.now()-Math.max(0,Date.now()-snapshot.observedAt)}/>:<ArcadeProgress stage="synchronizing" title="Match paused" detail="Reconnecting controls. The match resumes with a countdown." compact overlay/>}</>:error?<ArcadeProgress stage="error" detail={error} actions={<button onClick={()=>setRetry(n=>n+1)}>Retry</button>} compact overlay/>:controlError&&!tools?<ArcadeProgress stage="error" detail={controlError} actions={<button onClick={()=>{void move(0);setTools(true);}}>Account</button>} compact overlay/>:streamPaused&&snapshot.phase===2&&!result?<ArcadeProgress stage="synchronizing" compact overlay/>:null}{(manifest.current?.version??0)>=4&&snapshot.phase===1&&<ArenaCountdown id={refKey} deadline={countdown?.id===refKey?countdown.deadline:undefined} clock={countdown?.clock} observedAt={countdown?.observedAt}/>}</div>
     <div className="rooms-court-controls"><span>{side>=0?'W / S · ↑ / ↓':'SPECTATING'}</span>{side>=0&&<div className="touch-controls">{([-1,1] as const).map(dir=><IconButton key={dir} icon={dir===-1?'up':'down'} aria-label={dir===-1?'Move up':'Move down'} disabled={!controllable} onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);void move(dir);}} onPointerUp={()=>void move(0)} onPointerCancel={()=>void move(0)} onLostPointerCapture={()=>void move(0)}/>)}</div>}</div>
    </>:<ArcadeProgress stage={error?'unavailable':'preparing'}/>}
   </section>}
  </>}
  {tools&&<Dialog label="Arena tools" onClose={()=>setTools(false)}><IconButton aria-label="Close arena tools" onClick={()=>setTools(false)}/><h2>Arena tools</h2>{controlError&&<p role="alert">{controlError}</p>}
   <button disabled={busy} onClick={()=>void renew()}>Sign in again</button><button disabled={busy||!playerClient.current} onClick={()=>void revoke()}>Sign out of this match</button><button disabled={busy||!playerClient.current} onClick={()=>void action(async()=>{await playerClient.current!.concede();setTools(false);})}>Concede match</button></Dialog>}
  <Outcome id={refKey} defer={draining} match={snapshot?{playerA:snapshot.a,playerB:snapshot.b,winner:result?.winner??snapshot.winner,status:result?.status??snapshot.phase,state:{...snapshot.state,scoreA,scoreB},ranked:false,mode:view?.mode??0,draw:(result?.status??snapshot.phase)===3&&(result?.winner??snapshot.winner)===zeroAddress}:null}
   account={account??''} rating={null} sound={arcadeAudio.settings.enabled} replay={false} confirmation="engine" rematch={rematch} watch={()=>setReplay(true)} again={()=>router.push('/agents')} againLabel="Choose another agent"/>
  {replay&&<Dialog label="Match replay" className={`rooms-dialog ${replayStyles.modal}`} onClose={()=>setReplay(false)}><header className={replayStyles.heading}><IconButton aria-label="Close replay" onClick={()=>setReplay(false)}/><h2>Match replay</h2></header><AgentReplay reference={reference} players={view?[{name:name(view.a),avatar:avatar(view.a)},{name:name(view.b),avatar:avatar(view.b)}]:undefined}/></Dialog>}
 </main>;
}
