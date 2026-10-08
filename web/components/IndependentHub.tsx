"use client";
import {TouchControls} from "./TouchControls";
import {isReusableHumanRules} from '../../shared/independent-rules-version';
import {ParticipantInputs,type ParticipantPresentationClock} from '../lib/participant-inputs';
import {ArcadeHeader} from './ArcadeChrome';
import {ArcadeProgress} from './ArcadeProgress';
import {sponsorStage,type ArcadeStage} from '../../shared/arcade-progress';
import type {ChainOperation} from '../../shared/independent';
import {readArenaLaunch} from '../../shared/arena-launch';
import {useEffect,useMemo,useRef,useState,useCallback} from 'react';
import {isAddress,zeroAddress,maxUint256,type Address} from 'viem';
import {Court,type CourtPlayback} from './Court';
import {ArenaCountdown} from './MatchCountdown';
import {ChaosEffectsHud} from './ChaosEffectsHud';
import {eventHud} from '../lib/chaos-presentation';
import {useLobbyClock,useQueueElapsed} from '../lib/use-lobby-clock';
import {Avatar,AvatarPicker} from './Avatar';
import {PixelPalaceArt} from './PixelPalaceArt';
import {ArcadeAmbience,MusicCredit} from './ArcadeAmbience';
import {EngineCredit} from './EngineCredit';
import {Dialog} from './Dialog';
import {IconButton} from './IconButton';
import {Outcome} from './Outcome';
import {IndependentPrivate} from './IndependentPrivate';
import {IndependentMarket} from './IndependentMarket';
import {IndependentHistory} from './IndependentHistory';
import {IndependentArchive} from './IndependentArchive';
import {arcadeAudio} from '../lib/audio';
import {connect,rememberedAccount,forgetAccount} from '../lib/wallet';
import {gameTabLock} from '../lib/game-tab-lock';
import {LabLane,labSide,type LabSnapshot} from '../lib/interlude-lab';
import {TickPilot} from '../../shared/engine-feed';
import {engineReadRetryMs} from '../../shared/engine-read';
import {publicationUnavailable} from '../../shared/service-error';
import {ArenaRecovery,maintainQueuePresence} from '../../shared/independent-recovery';
import {poolUserError} from '../../shared/agent-pool-error';
import {reportIndependentDiagnostics} from '../lib/independent';
import {readIndependentLobby,readIndependentRanking,independentReader} from '../../shared/independent-read';
import {publicIndependentManifest,arenaReference,parseRoomReference,roomReference,type IndependentManifest} from '../../shared/independent';
import {independentApi,independentBase,loadFamily,renewIndependentControl,validateFamily,resumeSponsored,lobbyCommand,saveIndependentProfile,disconnectFamily,eraseFamilyLocal,createIndependentArena,type FamilySession} from '../lib/independent';
import {openArcadeAccess} from '../lib/arcade-access';
import {observeSponsored,SponsorPending} from '../lib/independent';
import {independentControlArgs} from '../../shared/independent-rules';
import {SESSION_RENEW_MARGIN} from '../../shared/agent-pool-family';
import {arenaOutage,arenaWaitStatus,preparingArena} from '../lib/arena-wait';
import {WarmupRally} from './WarmupRally';

type Panel='account'|'ranking'|'invite'|'create'|'members'|'tools'|'more'|'connect'|'private'|'market'|'history'|null;
const short=(a:string)=>`${a.slice(0,6)}…${a.slice(-4)}`;
const equal=(a?:string,b?:string)=>!!a&&!!b&&a.toLowerCase()===b.toLowerCase();
// Before admission, look again within a second so the match starts once bound.
const recoveryDelay=(e:unknown)=>Math.max(engineReadRetryMs(e),publicationUnavailable(e)?30000:preparingArena(e)?1000:3000);
const empty={room:null,proposal:null,queue:null,invitations:[],profiles:{},binding:null,app:null,published:null,occupancy:0n,active:0n,now:0n};
export function IndependentHub({roomId,agentArcade=false}:{roomId?:string;agentArcade?:boolean}){
 const base=useMemo(independentBase,[]);
 const [manifest,setManifest]=useState<IndependentManifest>(),[config,setConfig]=useState<any>();
 const [archive,setArchive]=useState<IndependentManifest>();
 const [family,setFamily]=useState<FamilySession|null>(null),[saved,setSaved]=useState<Address>(),[ready,setReady]=useState(false);
 const [view,setView]=useState<any>(empty),[snapshot,setSnapshot]=useState<LabSnapshot|null>(null),[mode,setMode]=useState<0|1>(0);
 const [panel,setPanel]=useState<Panel>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[sync,setSync]=useState('');
 const [lobbySync,setLobbySync]=useState('');
 const [actionStage,setActionStage]=useState<ArcadeStage>('preparing'),[cancelQueued,setCancelQueued]=useState<string|null>(null);
 const [pendingSponsor,setPendingSponsor]=useState<ChainOperation|null>(null);
 const pendingProfile=useRef<{id:string;player:string}|null>(null);
 const [spectatorRoom,setSpectatorRoom]=useState<string>();
 const [painted,setPainted]=useState<CourtPlayback>();
 const [countdown,setCountdown]=useState<{id:string;deadline:number;clock:number;observedAt:number}>();
 const {now,clock:lobbyClock}=useLobbyClock();
 const [sound,setSound]=useState(false),[direction,setDirection]=useState(0),[fps,setFps]=useState(0),[controlled,setControlled]=useState(false);
 const [handle,setHandle]=useState(''),[avatar,setAvatar]=useState(0),[target,setTarget]=useState(''),[ranking,setRanking]=useState<any>(),[showResult,setShowResult]=useState(0),[settled,setSettled]=useState<any>(null);
 const [frequent,setFrequent]=useState<any[]>([]),[replayId,setReplayId]=useState<bigint>();
 const pendingAction=useRef<((s:FamilySession)=>Promise<void>)|null>(null),working=useRef(false),refreshing=useRef(false);
 const heartbeat=useRef<Promise<void>>(Promise.resolve()),autoAccepted=useRef('');
 const [warmup,setWarmup]=useState(false);
 const scoreSeen=useRef<{id:bigint;score:number;at:number}|null>(null);
 const current=useRef({family,view,panel,ready});current.current={family,view,panel,ready};
 const inputClock=useRef<{matchId:string;frame:ParticipantPresentationClock}|null>(null);
 const participantInputs=useRef(new ParticipantInputs()),latestLive=useRef<LabSnapshot|null>(null);const [,inputRevision]=useState(0);
 const immediateDirection=useRef<-1|0|1>(0);
 const lane=useRef<LabLane|null>(null),arena=useRef<ReturnType<typeof createIndependentArena>|null>(null),lock=useRef<(()=>void)|null>(null);
 const bindingRef=useRef<any>(null),lastGame=useRef<{app:Address;binding:any}|null>(null);
 const player=family?.grant.player??saved;
 const profile=(a:string)=>view.profiles[a.toLowerCase()];
 const name=(a:string)=>profile(a)?.handle||short(a);
 const ownRoom=view.room&&player&&view.room.members.some((m:any)=>equal(m.player,player));
 const spectating=!!(roomId&&spectatorRoom===roomId&&view.room?.ranked&&!ownRoom);
 const room=ownRoom||spectating?view.room:null,offer=room?view.proposal:null;
 useEffect(()=>{setSpectatorRoom(roomId&&sessionStorage.getItem(`pongit:spectate:${roomId}`)==='1'?roomId:undefined);},[roomId]);
 const recoveringArena=!!(view.binding?.epoch&&view.delegation&&view.delegation.status!==1);
 const side=labSide(snapshot,player),active=snapshot?.phase===2,canPlay=!!(active&&!recoveringArena&&side>=0&&controlled&&!panel);
 const mine=room?.members.find((m:any)=>equal(m.player,player));
 const offerSide=offer&&player?(equal(offer.a,player)?0:equal(offer.b,player)?1:-1):-1;
 const canAccept=offer?.status===1&&offerSide>=0;
 const queueKey=view.queue?`${player}:${view.queue[0]}:${view.queue[1]}`:undefined;
 const queueSeconds=useQueueElapsed(queueKey);
 const resultId=snapshot&&lastGame.current?arenaReference(lastGame.current.app,lastGame.current.binding.epoch,snapshot.id):null;
 const resultEntry=snapshot&&settled?.entry.first.id===snapshot.id?settled.entry:snapshot&&view.published?.first.id===snapshot.id?view.published:null;
 const ratingDelta=snapshot&&settled?.entry.first.id===snapshot.id&&side>=0?Number(settled.change[side+2])-Number(settled.change[side]):undefined;
 const playout=painted?.matchId===resultId?painted:undefined;
 const scoreA=playout?.scoreA??snapshot?.state.scoreA??0,scoreB=playout?.scoreB??snapshot?.state.scoreB??0;
 const draining=!!playout&&!playout.finished&&snapshot?.phase===3&&snapshot.state.finished&&!recoveringArena&&!!room&&!canAccept&&(!offer||offer.id===snapshot.id);
 const outcome=snapshot?{playerA:snapshot.a,playerB:snapshot.b,winner:snapshot.winner,status:snapshot.phase,state:snapshot.state,mode:lastGame.current?.binding.mode,ranked:lastGame.current?.binding.ranked,ratingFinalized:!!resultEntry}:null;
 const refresh=useCallback(async()=>{
  if(!manifest||refreshing.current)return;refreshing.current=true;
  try{
   const s=current.current.family,requested=roomId?parseRoomReference(roomId,manifest.lobby):undefined;
   let last:undefined|{app:Address;id:bigint;epoch:bigint;room?:bigint};
   try{const v=JSON.parse(sessionStorage.getItem(`pongit:last-arena:${manifest.lobby}:${s?.grant.player}`)||'null');if(v&&manifest.arenas.some(a=>equal(a.app,v.app)))last={app:v.app,id:BigInt(v.id),epoch:BigInt(v.epoch),room:v.room?BigInt(v.room):undefined};}catch{}
   const next=await readIndependentLobby(base,manifest,s?.grant.player,requested,last,proposal=>{
    if(!s||!equal(current.current.family?.grant.player,s.grant.player))return;
    lobbyClock.observe(Number(proposal.now)*1000);
    setView((prior:any)=>prior.block>proposal.block?prior:{...prior,...proposal});
   });lobbyClock.observe(Number(next.now)*1000);setView(next);setLobbySync('');
   if(next.recoverySnapshot){
    lastGame.current={app:next.app,binding:next.binding};
    // Keep a previously displayed live position while closing. A fresh tab starts
    // from published state; a confirmed terminal state always replaces it.
    setSnapshot(previous=>previous?.id===next.recoverySnapshot!.id&&next.recoverySnapshot!.phase<3?previous:next.recoverySnapshot);
   }
   if(next.publishedSnapshot&&last&&!next.binding){
    lastGame.current={app:last.app,binding:{...next.published.first,room:next.room?.id}};
    setSnapshot(next.publishedSnapshot);setSync('');
   }
   if(s){const g=next.grant;setReady(equal(g?.key,s.grant.key)&&g.expires===s.grant.expires&&g.revision===s.grant.revision);}
  }finally{refreshing.current=false;}
 },[manifest,base,roomId]);
 useEffect(()=>{
  let alive=true,retry:ReturnType<typeof setTimeout>;
  const load=()=>void independentApi('config'+(roomId?'?lobby='+encodeURIComponent(roomId.split(':')[0]):'')).then(c=>{if(!alive)return;const m=publicIndependentManifest(c.manifest);if(c.archived){setArchive(m);setManifest(undefined);setError('');return;}setArchive(undefined);setManifest(m);setConfig(c);setFamily(loadFamily(m));setSaved(rememberedAccount()?.address as Address|undefined);setError('');}).catch(()=>{if(alive){setError('Game services are temporarily unavailable. Retrying automatically.');retry=setTimeout(load,5000);}});
  load();return()=>{alive=false;clearTimeout(retry);};
 },[roomId]);
 useEffect(()=>{
  if(!manifest)return;let stopped=false;let timer:ReturnType<typeof setTimeout>;
  const poll=async()=>{let delay=3000;try{await refresh();if(current.current.view.binding?.epoch)delay=10000;}catch(e){delay=Math.max(3000,engineReadRetryMs(e));if(!stopped)setLobbySync('Reconnecting to the lobby. Your game is saved.');}finally{if(!stopped)timer=setTimeout(poll,delay);}};
  void poll();const t=setInterval(()=>{void independentApi('config').then(setConfig).catch(()=>{});},10000);
  return()=>{stopped=true;clearTimeout(timer);clearInterval(t);};
 },[manifest,refresh]);
 useEffect(()=>{
  if(!manifest||!family)return;
  void resumeSponsored(manifest).then(refresh).catch(e=>setNotice(poolUserError(e)));
 },[manifest,family?.grant.key,refresh]);
 useEffect(()=>{
  if(!manifest)return;let stopped=false;let timer:ReturnType<typeof setTimeout>;
  const poll=async()=>{
   try{
    // The foreground action owns its first observation window. Recovery only
    // reads the same durable operation; it never signs or submits a replacement.
    if(working.current)return;
    const op=await observeSponsored(manifest);if(stopped)return;
    if(!op){setPendingSponsor(null);return;}
    if(op.status==='queued'||op.status==='pending'){setPendingSponsor(op);setActionStage(sponsorStage(op.status));return;}
    setPendingSponsor(null);
    if(op.status==='failed'){setError(op.error||'This action reverted. Reload before retrying.');return;}
    setError('');setNotice('Action confirmed');
    if(pendingProfile.current?.id===op.id){
     if(equal(current.current.family?.grant.player,pendingProfile.current.player)&&current.current.panel==='account')setPanel(null);
     pendingProfile.current=null;setNotice('Profile saved');
    }
    await refresh();
   }catch{/* An unavailable observation preserves the pending operation. */}
   finally{if(!stopped)timer=setTimeout(poll,1500);}
  };
  void poll();return()=>{stopped=true;clearTimeout(timer);};
 },[manifest,refresh]);
 useEffect(()=>{
  if(!manifest||!family)return;let sending=false;const instance=crypto.randomUUID();
  const timer=setInterval(()=>{if(sending)return;sending=true;void reportIndependentDiagnostics(manifest,family,instance).catch(()=>{}).finally(()=>{sending=false;});},10000);
  return()=>clearInterval(timer);
 },[manifest,family?.grant.key]);
 async function run(fn:()=>Promise<void>){
  if(working.current)return;working.current=true;setBusy(true);setActionStage('preparing');setError('');
  try{await heartbeat.current;await fn();}catch(e){if(e instanceof SponsorPending){setActionStage('confirmation');setNotice('Your action is still being confirmed. You can close this window.');}else setError(poolUserError(e));}finally{working.current=false;setBusy(false);}
 }
 const progress=(op:ChainOperation)=>setActionStage(sponsorStage(op.status));
 async function act(s:FamilySession,method:string,args:readonly unknown[]=[]){if(!manifest)return;await lobbyCommand(manifest,s,method,args,progress);await refresh();}
 async function ensure(fn:(s:FamilySession)=>Promise<void>){
  if(!manifest||working.current)return;
  // A room deep link can be clicked before the first lobby snapshot arrives.
  // Unknown authorization is not expiry: verify the saved grant, and preserve it
  // on a network error instead of opening a root passkey ceremony.
  const existing=current.current.family??loadFamily(manifest);
  if(existing){
   let expired=false;
   await run(async()=>{
    await resumeSponsored(manifest,progress);
    if(!await validateFamily(manifest,existing)){expired=true;setReady(false);return;}
    setFamily(existing);current.current.family=existing;setReady(true);await fn(existing);
   });
   if(!expired)return;
  }
  pendingAction.current=fn;
  if(saved||family){await login(false);return;}
  setPanel('connect');
 }
 async function login(create:boolean,another=false){
  if(!manifest)return;
  await run(async()=>{
   setActionStage('connecting');const identity=await connect(create,another);setActionStage('preparing');try{
    const access=await openArcadeAccess(identity,{human:manifest},progress),s=access.human!;await renewIndependentControl(manifest,identity,s);setFamily(s);current.current.family=s;setSaved(s.grant.player);setReady(true);setPanel(null);setSync('');
    if(access.incomplete)setNotice('Human play is ready. Agent access could not be prepared; your saved authorization is kept.');
    const action=pendingAction.current;pendingAction.current=null;if(action)await action(s);await refresh();
   }finally{identity.end();}
  });
 }
 async function copy(text:string){try{await navigator.clipboard.writeText(text);setNotice('Copied');setTimeout(()=>setNotice(''),2000);}catch{setError('Copy failed. Select the address or link and copy it manually.');}}
 // A session that would end during the match is renewed now, at the click, with
 // the one passkey confirmation the player expects: never in the middle of a game.
 function queueUp(){
  const s=current.current.family;
  if(s&&Number(s.grant.expires-BigInt(Math.floor(Date.now()/1000)))<Number(SESSION_RENEW_MARGIN)){pendingAction.current=startQueue;void login(false);return;}
  void ensure(startQueue);
 }
 async function startQueue(s:FamilySession){
  const occupancy=await independentReader(base,manifest!).lobby('occupancy',[s.grant.player]);
  if(occupancy&&occupancy!==maxUint256)await act(s,'leaveRoom');
  if(occupancy===maxUint256)await act(s,'cancelQueue');
  setSnapshot(null);await act(s,'queue',[mode]);
 }
 async function resolveTarget(){
  const value=target.trim();if(isAddress(value))return value;
  if(!/^[a-z][a-z0-9_]{2,19}$/i.test(value))throw Error('Enter a username or wallet address');
  const r=independentReader(base,manifest!),key=await r.profiles('handleKey',[value]),address=await r.profiles('handleOwner',[key]);
  if(address===zeroAddress)throw Error('Username not found');return address as Address;
 }
 // Keep the final observed game until another actual arena binding arrives. A room
 // rotation cannot erase the seventh point or prevent the result dialog from opening.
 const bound=view.binding;
 useEffect(()=>{
  if(!manifest||![12,13,14,18].includes(manifest.rulesVersion??4)||snapshot?.phase!==1||!arena.current||!bound?.epoch)return;
  const instance=arena.current,id=snapshot.id,key=arenaReference(instance.client.app,bound.epoch,id);
  let stopped=false,timer:ReturnType<typeof setTimeout>;
  const read=async()=>{let armed=false;try{
   const sample=await readArenaLaunch(instance.client.node,instance.client.app,id,manifest.countdownClock);
   if(!stopped&&sample){armed=true;setCountdown({id:key,...sample});}
  }catch{/* The ordinary engine observer reports outages and keeps controls off. */}
  finally{if(!stopped&&!armed)timer=setTimeout(read,500);}};
  void read();return()=>{stopped=true;clearTimeout(timer);};
 },[manifest?.rulesVersion,manifest?.countdownClock,snapshot?.phase,snapshot?.id,bound?.epoch]);
 useEffect(()=>{
  if(!manifest||!bound?.epoch||!view.app||recoveringArena||!ownRoom&&!spectating)return;
  const binding=bound,app=view.app as Address;participantInputs.current.reset();inputClock.current=null;immediateDirection.current=0;setDirection(0);
  bindingRef.current=binding;lastGame.current={app,binding};
  sessionStorage.setItem(`pongit:last-arena:${manifest.lobby}:${family?.grant.player}`,JSON.stringify({app,id:String(binding.id),epoch:String(binding.epoch),room:String(binding.room)}));
  const instance=createIndependentArena(manifest,app);arena.current=instance;
  let stopped=false,retryAt=0,opening=false;let play:LabLane|null=null;const pilot=new TickPilot(),recovery=new ArenaRecovery();
  const id=BigInt(binding.id),receive=(s:LabSnapshot,latency?:number)=>{
   if(stopped)return;latestLive.current=s;setSnapshot(s);pilot.observe(s,performance.now());play?.ingest(s);setSync(recovery.observed(s.phase>=3,latency!==undefined));
   const before=scoreSeen.current,total=s.state.scoreA+s.state.scoreB;
   if(before?.id===s.id&&total>before.score&&total<=before.score+2&&Date.now()-before.at<3000)arcadeAudio.play('point',`${app}:${binding.epoch}:${s.id}:score:${total}`);
   scoreSeen.current={id:s.id,score:total,at:Date.now()};
   if(s.phase>=3){play?.intent(0);immediateDirection.current=0;setDirection(0);setControlled(false);arcadeAudio.setGameplay(false);void refresh().catch(()=>{if(!stopped)setLobbySync('Reconnecting to the lobby. Your game is saved.');});}
  };
  const stop=instance.feed.watch(id,receive);
  const observe=async()=>{
   if(stopped||Date.now()<retryAt)return;
   try{receive(await instance.feed.read(id));}catch(e){retryAt=Date.now()+Math.max(1000,engineReadRetryMs(e));if(!stopped)setSync(recovery.failure(e));}
  };
  const restore=async()=>{
   const s=current.current.family;if(!s||opening||play&&!play.stopped||stopped||Date.now()<retryAt||!([binding.a,binding.b].some((p:string)=>equal(p,s.grant.player))))return;
   opening=true;
   try{
    if(!lock.current)lock.current=await gameTabLock(s.grant.player);
    const session=await instance.session(s);if(stopped)return;
    const receiptArgs=(args:readonly unknown[])=>independentControlArgs(manifest.rulesVersion??4,BigInt(binding.epoch),args);
    if(manifest.rulesVersion===13||isReusableHumanRules(manifest.rulesVersion)){
     const initial=await instance.feed.read(id);receive(initial);
     if(initial.phase===1){
      // Let the actual court paint before acknowledging readiness. Hidden tabs
      // do not claim to be ready and never invent a delayed visual countdown.
      await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
      if(stopped)return;
      const [mask]=await instance.client.read('readiness',[id]) as readonly [number,bigint];
      const bit=equal(binding.a,s.grant.player)?1:2;
      if(!(mask&bit)){
       const receipt=await session.send('confirmReady',[id]);
       receive(await instance.feed.receipt(id,receipt,'confirmReady',receiptArgs([id]),s.grant.player),receipt.latencyMs);
      }
     }
    }
    play=new LabLane(fresh=>instance.feed.read(id,fresh),session,s.grant.player,receive,e=>{setControlled(false);setSync(recovery.failure(e));retryAt=Date.now()+recoveryDelay(e);},e=>setSync(recovery.failure(e)),{readMs:500,tickMs:300},{receipt:(result,name,args)=>instance.feed.receipt(id,result,name,receiptArgs(args),s.grant.player),sending:value=>pilot.sending(value),nextInputId:()=>participantInputs.current.allocateId(),input:notice=>{
     const s=latestLive.current;if(stopped||!s)return;participantInputs.current.notice(notice,s.clock,s.observedAt,inputClock.current?.matchId===arenaReference(app,binding.epoch,s.id)?inputClock.current.frame:undefined);inputRevision(v=>v+1);
    }});
    const known=instance.feed.peek(id);if(known)play.ingest(known);lane.current=play;setControlled(true);
   }catch(e){retryAt=Date.now()+recoveryDelay(e);if(!stopped)setSync(recovery.failure(e));}finally{opening=false;}
  };
  void observe();void restore();
  const timer=setInterval(()=>{
   const s=instance.feed.peek(id);if(s?.phase&&s.phase>=3)return;
   if(play&&!play.stopped){void play.pump(!!s&&pilot.due(labSide(s,current.current.family?.grant.player),s,performance.now()));}
   else{void observe();void restore();}
  },100);
  return()=>{stopped=true;clearInterval(timer);stop();play?.stop();(instance.client.node.transport as any)?.closeSend?.();if(lane.current===play)lane.current=null;setControlled(false);lock.current?.();lock.current=null;};
 },[manifest,view.app,bound?.id,bound?.epoch,family?.grant.key,refresh,recoveringArena,!!ownRoom,spectating]);
 const move=useCallback((d:number)=>{const blocked=current.current.panel||document.querySelector('[aria-modal="true"]');const value=blocked?0:Math.sign(d) as -1|0|1;immediateDirection.current=value;setDirection(value);void lane.current?.intent(value,true);},[]);
 useEffect(()=>{
  const keys=new Set<string>(),up=new Set(['w','arrowup']),down=new Set(['s','arrowdown']);
  const release=()=>{keys.clear();move(0);};
  const key=(e:KeyboardEvent,on:boolean)=>{
   const k=e.key.toLowerCase();if(!up.has(k)&&!down.has(k))return;
   if(!on)keys.delete(k);
   if(!canPlay||(e.target as HTMLElement).closest('input,textarea,select,[contenteditable=true]')){if(!on)move(0);return;}
   e.preventDefault();if(on)keys.add(k);else keys.delete(k);move([...keys].some(x=>up.has(x))?-1:[...keys].some(x=>down.has(x))?1:0);
  };
  const kd=(e:KeyboardEvent)=>key(e,true),ku=(e:KeyboardEvent)=>key(e,false);
  const observer=new MutationObserver(()=>{if(document.querySelector('[aria-modal="true"]'))release();});observer.observe(document.body,{childList:true,subtree:true});
  window.addEventListener('keydown',kd);window.addEventListener('keyup',ku);window.addEventListener('blur',release);document.addEventListener('visibilitychange',release);
  return()=>{observer.disconnect();window.removeEventListener('keydown',kd);window.removeEventListener('keyup',ku);window.removeEventListener('blur',release);document.removeEventListener('visibilitychange',release);release();};
 },[canPlay,move]);
 useEffect(()=>{arcadeAudio.setGameplay(!!active);return()=>arcadeAudio.setGameplay(false);},[active]);
 useEffect(()=>{
  if(!manifest||!family||!view.queue)return;let stopped=false,pulsing=false;
  const pulse=async()=>{
   if(stopped||pulsing||working.current||!current.current.view.queue||current.current.family?.grant.key!==family.grant.key)return;
   // Presence runs in the background: the queue screen and Cancel stay responsive.
   // A player action waits for this beat (see run) instead of racing it.
   pulsing=true;
   const beat=(async()=>{
    try{
     await resumeSponsored(manifest);
     await maintainQueuePresence(async()=>await independentReader(base,manifest).lobby('occupancy',[family.grant.player])===maxUint256,()=>lobbyCommand(manifest,family,'queueHeartbeat'));
     await refresh();
    }catch{if(!stopped)setLobbySync('Reconnecting to the queue. Your game is saved.');}
   })();
   heartbeat.current=beat;
   try{await beat;}finally{pulsing=false;}
  };
  const t=setInterval(()=>void pulse(),10000);return()=>{stopped=true;clearInterval(t);};
 },[manifest,family?.grant.key,!!view.queue]);
 // Matchmaking already expressed consent: accept its pairing at once. A hidden tab
 // is told through its title and accepts when the player comes back in time.
 useEffect(()=>{
  if(!canAccept||!room?.ranked||!family||!offer||busy||offer.accepted&(1<<offerSide))return;
  const key=String(offer.id);if(autoAccepted.current===key)return;
  const accept=()=>{
   if(document.visibilityState!=='visible'||autoAccepted.current===key||working.current||Number(offer.expires)*1000<Date.now())return;
   // lobbyCommand already verifies the current grant, nonce and chain time at
   // one block. Repeating family hydration here consumes the proposal window.
   // run still serializes with queue presence and owns the single signed intent.
   autoAccepted.current=key;void run(()=>act(family,'acceptProposal',[offer.id]));
  };
  if(document.visibilityState==='visible'){accept();return;}
  const title=document.title;document.title='Match found! · PONGIT';
  const back=()=>{if(document.visibilityState!=='visible')return;document.title=title;accept();};
  document.addEventListener('visibilitychange',back);
  return()=>{document.removeEventListener('visibilitychange',back);document.title=title;};
 },[canAccept,room?.ranked,offer?.id,offer?.accepted,offerSide,family?.grant.key,busy]);
 useEffect(()=>{let alive=true;if(panel==='account'&&player){const p=profile(player);setHandle(p?.handle||'');setAvatar(p?.avatar||0);if(!p?.handle)void independentApi(`profile-migration/${player}`).then(hint=>{if(alive&&hint){setHandle(hint.handle);setAvatar(hint.avatar);setNotice('Your previous username is reserved. Save profile to claim it.');}}).catch(()=>{});}return()=>{alive=false;};},[panel,player]);
 useEffect(()=>{if(panel==='ranking'&&manifest)void readIndependentRanking(base,manifest,mode).then(setRanking).catch(()=>setError('Ranking temporarily unavailable.'));},[panel,mode,manifest,base]);
 useEffect(()=>{if((panel==='invite'||panel==='create')&&player)void independentApi(`player/${player}/frequent`).then(setFrequent).catch(()=>setFrequent([]));},[panel,player]);
 useEffect(()=>{
  if(!manifest||!snapshot||snapshot.phase<3)return;let stopped=false,final=false;let timer:ReturnType<typeof setTimeout>;
  const read=async()=>{try{const r=independentReader(base,manifest);if(await r.ratings('indexOf',[snapshot.id])){
   const [entry,change]=await Promise.all([r.ratings('entry',[snapshot.id]),r.ratings('ratingChange',[snapshot.id])]);if(!stopped)setSettled({entry,change});final=entry.finality;
  }}catch{/* Publication is independently retried. */}finally{if(!stopped&&!final)timer=setTimeout(read,5000);}};
  void read();return()=>{stopped=true;clearTimeout(timer);};
 },[manifest,base,snapshot?.id,snapshot?.phase]);
 const outage=arenaOutage(config?.arenas),waitStatus=arenaWaitStatus(config?.arenas);
 const arenaWaitSeconds=useQueueElapsed(offer?.status===2?`arena:${offer.id}`:undefined);
 // The warm-up gives way the moment a real match is bound to this player.
 useEffect(()=>{if(!bound?.id||!warmup)return;setWarmup(false);setNotice('Your match is ready');const t=setTimeout(()=>setNotice(''),3000);return()=>clearTimeout(t);},[bound?.id]);
 const modalTitle=panel==='account'?'Your account':panel==='ranking'?'Ranking':panel==='invite'?'Invite someone':panel==='create'?'Create room':panel==='members'?'Room members':panel==='tools'?'Cabinet tools':panel==='connect'?'Connect to play':panel==='private'?'Private notebook':panel==='market'?'Wallet and betting':panel==='history'?'Match history':'More';
 const observedArena=view.binding?{app:view.app,binding:view.binding}:lastGame.current;
 const arenaHealth=config?.arenas.find((a:any)=>equal(a.app,observedArena?.app)&&String(a.epoch)===String(observedArena?.binding.epoch));
 const engineUnavailable=arenaHealth?.stage==='intervention';
 const networkMessage=engineUnavailable?'This arena is unavailable right now. Your game is saved.':recoveringArena||active&&['publication-paused','recovering','closing','review'].includes(arenaHealth?.stage)?'This arena is getting ready. Your game is saved.':sync||lobbySync;
 useEffect(()=>{if(!cancelQueued||busy)return;setCancelQueued(null);if(queueKey===cancelQueued)void ensure(s=>act(s,'cancelQueue'));},[cancelQueued,busy,queueKey]);
 const pauseLabel=recoveringArena?'Getting the arena ready':snapshot&&arenaHealth?.rally?.id===String(snapshot.id)&&arenaHealth.rally.rally===snapshot.state.scoreA+snapshot.state.scoreB&&arenaHealth.rally.resumeAt===String(snapshot.state.resumeAt)?arenaHealth.rally.label:'Waiting for Chaos bets to be confirmed';
 if(archive&&roomId)return <IndependentArchive manifest={archive} roomId={roomId}/>;
 return <main className={`cabinet-ui rooms-shell ${active?'rooms-playing':''}`}>
  <ArcadeHeader>
   <ArcadeAmbience onSound={setSound}/><a className="rooms-button" href="/docs" target="_blank" rel="noreferrer">Docs ↗</a><button onClick={()=>setPanel('ranking')}>Ranking</button><button onClick={()=>setPanel('more')}>More</button>
   <button disabled={busy||!manifest} onClick={()=>ready?setPanel('account'):void ensure(async()=>{})}>{ready&&player?name(player):family&&view.grant?'Renew arcade session':saved?'Continue as '+short(saved):'Connect'}</button>
  </ArcadeHeader>
  {notice&&<p className="rooms-notice" role="status">{notice}</p>}
  {!panel&&!view.queue&&offer?.status!==2&&!active&&(error?<ArcadeProgress stage="error" detail={error} compact/>:networkMessage?<ArcadeProgress stage={engineUnavailable?'unavailable':'synchronizing'} detail={networkMessage} compact/>:busy&&!view.queue&&offer?.status!==2?<ArcadeProgress stage={actionStage} compact/>:null)}
  {view.invitations[0]&&<aside className="rooms-invitation"><Avatar index={profile(view.invitations[0].sender)?.avatar}/><strong>{name(view.invitations[0].sender)}</strong><button className="primary" disabled={busy} onClick={()=>void ensure(s=>act(s,'answerInvitation',[view.invitations[0].id,true]))}>Accept</button><button disabled={busy} onClick={()=>void ensure(s=>act(s,'answerInvitation',[view.invitations[0].id,false]))}>Back</button></aside>}
  {roomId&&!ownRoom&&!spectating?<section className="rooms-entry"><h1>{view.room?name(view.room.host):'PONGIT room'}</h1><div className="rooms-button-row"><button className="primary" disabled={busy||!manifest||!view.room} onClick={()=>{if(view.room?.ranked){sessionStorage.setItem(`pongit:spectate:${roomId}`,'1');setSpectatorRoom(roomId);}else void ensure(s=>act(s,'joinRoom',[parseRoomReference(roomId,manifest!.lobby)]));}}>Accept</button><a className="rooms-button" href="/">Back</a></div></section>
  :!room&&!view.queue?<section className="rooms-home"><div className="palace-marquee"><span className="palace-star" aria-hidden="true"/><h1><span>Pong is back</span><span>Bring a rival</span></h1><span className="palace-star" aria-hidden="true"/></div><div className="rooms-choices">
   {(['match','invite','room'] as const).map((kind,i)=>agentArcade&&kind!=='match'?<a key={kind} className={`rooms-choice rooms-choice-${kind}`} href={`/agents?mode=${mode}${kind==='room'?'&view=watch':''}`}><span className="rooms-choice-stage"><PixelPalaceArt kind={kind}/></span><strong>{kind==='invite'?'Player vs Agent':'Watch agents'}</strong><span>{kind==='invite'?'Eight arcade rivals':'Live games · Tournaments'}</span><i className="palace-key" aria-hidden="true">↗</i></a>:<button key={kind} className={`rooms-choice rooms-choice-${kind}`} disabled={busy||!manifest||kind==='match'&&outage} onClick={()=>kind==='match'?queueUp():void ensure(async()=>setPanel(kind==='invite'?'invite':'create'))}><span className="rooms-choice-stage"><PixelPalaceArt kind={kind}/></span><strong>{agentArcade?'Player vs Player':['Matchmaking','Invite someone','Create room'][i]}</strong><span>{[outage?'Arenas warming up · back shortly':`${mode?'Chaos':'Classic'} · Ranked`,'Your next rival','8 friends · Winner stays'][i]}</span><i className="palace-key" aria-hidden="true">↗</i></button>)}
  </div>{agentArcade&&<div className="rooms-button-row"><button disabled={busy||!manifest} onClick={()=>void ensure(async()=>setPanel('invite'))}>Invite someone</button><button disabled={busy||!manifest} onClick={()=>void ensure(async()=>setPanel('create'))}>Create room</button><a className="rooms-button" href="/agents/tournaments">Tournaments</a></div>}
  <div className="control-segments rooms-mode-choice" role="group" aria-label="Game mode"><button aria-pressed={mode===0} onClick={()=>setMode(0)}>Classic</button><button aria-pressed={mode===1} onClick={()=>setMode(1)}>Chaos</button></div><p className="rooms-caption">Free to play · Monad Testnet</p>{outage&&(warmup?<WarmupRally onClose={()=>setWarmup(false)}/>:<button onClick={()=>setWarmup(true)}>Warm up while the arenas restart</button>)}{ready&&player&&!profile(player)?.handle&&<button className="rooms-profile-prompt" onClick={()=>setPanel('account')}>Choose your username ↗</button>}</section>
  :view.queue?<section className="rooms-entry"><ArcadeProgress stage={error?'error':outage?'unavailable':busy?actionStage:'searching'} title={cancelQueued?'Cancellation queued':undefined} elapsed={queueSeconds} detail={outage?'Arenas are restarting. Your spot is kept.':`${view.queue[0]?'Chaos':'Classic'} · Ranked`} actions={<><button disabled={!!cancelQueued} onClick={()=>setCancelQueued(queueKey??null)}>{cancelQueued?'Cancelling…':'Cancel'}</button><button onClick={()=>setWarmup(w=>!w)}>{warmup?'Hide warm-up':'Warm up'}</button></>}/>{warmup&&<WarmupRally onClose={()=>setWarmup(false)}/>}</section>
  :room?<><div className="rooms-room-bar"><span>{room.mode?'CHAOS':'CLASSIC'} / {room.ranked?'RANKED':'WINNER STAYS'}</span><div><button onClick={()=>void copy(`${location.origin}/rooms/${roomReference(manifest!.lobby,room.id)}`)}>Copy room link</button><button onClick={()=>setPanel('members')}>Members {room.members.length}</button>{room.mode===1&&<button onClick={()=>setPanel('market')}>Betting</button>}<button onClick={()=>setPanel('tools')}>Tools</button></div></div>
   {canAccept?<section className="rooms-entry rooms-duel"><div className="rooms-versus"><span>{name(offer.a)}</span><b>VS</b><span>{name(offer.b)}</span></div><small>{Math.max(0,Math.ceil(Number(offer.expires)-now/1000))}s</small><div className="rooms-button-row"><button className="primary" disabled={busy||!!(offer.accepted&(1<<offerSide))||Number(offer.expires)*1000<now} onClick={()=>void ensure(s=>act(s,'acceptProposal',[offer.id]))}>{offer.accepted&(1<<offerSide)?'Waiting…':'Accept'}</button><button disabled={busy} onClick={()=>void ensure(s=>act(s,'declineProposal',[offer.id]))}>Back</button></div></section>
   :snapshot&&(!offer||offer.id===snapshot.id)?<section className="rooms-court court-card"><div className="scoreboard">{[snapshot.a,snapshot.b].map((p,i)=><div className={`player-label ${i?'right':''}`} style={i?{gridColumn:3}:undefined} key={p}><Avatar index={profile(p)?.avatar}/><small>PLAYER 0{i+1}</small><span>{name(p)}</span><div className="arena-rounds" aria-hidden="true">{Array.from({length:7},(_,n)=><b key={n} data-won={n<(i?scoreB:scoreA)}/>)}</div></div>)}<div className="arena-score-module" style={{gridColumn:2,gridRow:1}}><small>FIRST TO SEVEN</small><div className="score"><span>{String(scoreA).padStart(2,'0')}</span><i>:</i><span>{String(scoreB).padStart(2,'0')}</span></div></div></div>
    {snapshot.chaos&&<ChaosEffectsHud effects={playout?.effects??eventHud(snapshot.chaos.physics)} gameMs={playout?.gameMs??Number(snapshot.chaos.physics.t/1000n)} effectsEnabled={arcadeAudio.settings.background} players={[name(snapshot.a),name(snapshot.b)]}/>}
    <div className="rooms-canvas">{!panel&&(error||networkMessage)?<ArcadeProgress stage={error?'error':engineUnavailable?'unavailable':'synchronizing'} detail={error||networkMessage} compact overlay/>:snapshot.state.awaitingServe?<ArcadeProgress stage="preparing" title={pauseLabel} compact overlay/>:null}<Court onInputClock={(matchId,frame)=>{inputClock.current={matchId,frame};}} readIntent={isReusableHumanRules(manifest?.rulesVersion)&&side>=0?processed=>({direction:immediateDirection.current,controls:[...(latestLive.current?.queuedControls??[]),...participantInputs.current.controls(side as 0|1,processed)],revision:participantInputs.current.revision}):undefined} confirmedInputRevision={participantInputs.current.revision} coherentControls={isReusableHumanRules(manifest?.rulesVersion)&&side>=0?[...(snapshot.queuedControls??[]),...participantInputs.current.controls(side as 0|1,snapshot.state.t)]:undefined} liveEngine externalIntermission chaos={snapshot.chaos} rulesVersion={manifest?.rulesVersion} state={snapshot.state} clock={snapshot.clock} observedAt={snapshot.observedAt} direction={direction} side={side} replay={snapshot.phase<2||recoveringArena} onPlayback={setPainted} matchId={resultId!} controllable={canPlay} pending={!!lane.current?.inputPending} confirmedNonce={side===0?snapshot.nonceA:snapshot.nonceB} onStats={setFps}/>{[12,13,14,18].includes(manifest?.rulesVersion??4)&&snapshot.phase===1&&<ArenaCountdown id={resultId!} deadline={countdown?.id===resultId?countdown.deadline:undefined} clock={countdown?.clock} observedAt={countdown?.observedAt}/>}</div>
    <div className="rooms-court-controls"><span>{side>=0?'W / S · ↑ / ↓':spectating?'SPECTATING':`YOUR TURN ${Math.max(1,room.members.filter((m:any)=>!m.away).sort((a:any,b:any)=>Number(a.position-b.position)).findIndex((m:any)=>equal(m.player,player))+1)}`}</span>{active&&side>=0?<TouchControls>{([-1,1] as const).map(d=><IconButton key={d} icon={d<0?'up':'down'} aria-label={d<0?'Move up':'Move down'} disabled={!canPlay} onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);move(d);}} onPointerUp={()=>move(0)} onPointerCancel={()=>move(0)} onLostPointerCapture={()=>move(0)}/>)}</TouchControls>:snapshot.phase>=3?<button onClick={()=>setShowResult(n=>n+1)}>View result</button>:null}</div></section>
   :<section className="rooms-entry"><h1>{engineUnavailable?'Arena temporarily unavailable':recoveringArena?'Getting the arena ready':offer?.status===2?'Preparing your arena':mine?.away?'Take your next turn':'Bring a rival'}</h1>{offer?.status===2&&<ArcadeProgress stage={error?'error':outage?'unavailable':busy?actionStage:'preparing'} elapsed={arenaWaitSeconds} detail={error||waitStatus||undefined}/>}<div className="rooms-member-strip">{room.members.map((m:any)=><span key={m.player}><Avatar index={profile(m.player)?.avatar}/>{name(m.player)}</span>)}</div><div className="rooms-button-row">{mine?.away?<button className="primary" disabled={busy} onClick={()=>void ensure(s=>act(s,'rejoinQueue',[room.id]))}>Rejoin queue</button>:ownRoom?<button className="primary" onClick={()=>setPanel('invite')}>Invite someone</button>:null}{spectating?<a className="rooms-button" href="/">Back</a>:<button disabled={busy} onClick={()=>void ensure(s=>act(s,offer?.status===2?'cancelAdmission':'leaveRoom',offer?.status===2?[offer.id]:[]))}>Back</button>}{offer?.status===2&&<button onClick={()=>setWarmup(w=>!w)}>{warmup?'Hide warm-up':'Warm up'}</button>}</div>{offer?.status===2&&warmup&&<WarmupRally onClose={()=>setWarmup(false)}/>}</section>}
  </>:null}
  {!active&&<footer className="rooms-footer"><MusicCredit/><EngineCredit/><a href="/?deployment=v4">Previous arenas</a></footer>}
  <Outcome id={resultId} match={outcome} defer={draining} account={player||''} rating={null} ratingDelta={ratingDelta} sound={sound} replay={false} confirmation={resultEntry?'monad':'engine'} showResultKey={showResult} watch={()=>{setReplayId(snapshot?.id);setPanel('history');}} rematch={async()=>{if(!family||!snapshot)throw Error('Connect to request a rematch');await act(family,'rematch',[snapshot.id]);setNotice('Waiting for your rival');}} again={queueUp}/>
  {panel&&<Dialog label={modalTitle} className="rooms-dialog" onClose={()=>{if(busy)return;if(panel==='connect')pendingAction.current=null;setPanel(null);setError('');}}><IconButton className="modal-close" aria-label={`Close ${modalTitle}`} disabled={busy} onClick={()=>{if(panel==='connect')pendingAction.current=null;setPanel(null);setError('');}}/><h2>{modalTitle}</h2>
   {panel==='account'&&family&&manifest&&<div className="rooms-button-row"><button onClick={()=>setPanel('private')}>Private notebook</button><button onClick={()=>setPanel('market')}>Wallet and payments</button><button disabled={busy} onClick={()=>void run(async()=>{let pending=true;try{const result=await disconnectFamily(manifest,family,active&&lastGame.current?lastGame.current:undefined);pending=result.revocationPending;}finally{lane.current?.stop();eraseFamilyLocal(manifest);setFamily(null);current.current.family=null;setReady(false);setControlled(false);lock.current?.();lock.current=null;setPanel(null);setNotice(pending?'Disconnected locally. Network revocation remains to be confirmed.':'Disconnected. Arcade authorization revoked.');}})}>Disconnect</button><button disabled={busy} onClick={()=>{forgetAccount();setSaved(undefined);setNotice('Remembered passkey forgotten. Disconnect to revoke your active arcade session.');}}>Forget this account</button></div>}
   {panel==='private'&&manifest&&player&&<IndependentPrivate manifest={manifest} player={player} kind="notebook" matchRef={resultId??undefined} atUs={snapshot?.clock}/>}
   {panel==='market'&&manifest&&player&&<IndependentMarket manifest={manifest} player={player} id={snapshot?.state.mode===1?snapshot.id:undefined} onBusy={v=>{working.current=v;setBusy(v);}}/>}
   {panel==='history'&&player&&<IndependentHistory player={player} matchId={replayId} rulesVersion={manifest?.rulesVersion}/>}
   {(panel==='invite'||panel==='create')&&manifest&&player&&<IndependentPrivate manifest={manifest} player={player} kind="contacts" onChallenge={p=>setTarget(p)}/>}
   {(panel==='invite'||panel==='create')&&frequent.length>0&&<section><h3>Recent rivals</h3>{frequent.map(row=><button key={row.player} onClick={()=>setTarget(row.player)}>{name(row.player)} · {row.count} matches</button>)}</section>}
   {panel==='connect'&&<><p>One confirmation for two hours of human and agent play. Wallet actions still need your approval.</p><button className="primary" disabled={busy} onClick={()=>void login(false)}>Use a passkey</button><button disabled={busy} onClick={()=>void login(true)}>Create a passkey</button></>}
   {panel==='account'&&player&&<><p className="rooms-address">{player}</p><button onClick={()=>void copy(player)}>Copy address</button><label>Username<input value={handle} onChange={e=>setHandle(e.target.value)} maxLength={20} autoComplete="nickname"/></label><AvatarPicker value={avatar} disabled={busy} onChange={setAvatar}/><button className="primary" disabled={busy||!!pendingSponsor||!manifest} onClick={()=>void run(async()=>{await saveIndependentProfile(manifest!,player,handle.trim(),avatar,op=>{progress(op);pendingProfile.current={id:op.id,player};});pendingProfile.current=null;await refresh();setPanel(null);setNotice('Profile saved');})}>Save profile</button><button disabled={busy} onClick={()=>void login(false,true)}>Use another passkey</button><a className="rooms-button" href="/?deployment=v4">Wallet, payments and previous arenas</a></>}
   {(panel==='invite'||panel==='create')&&<><label>Username or address<input value={target} onChange={e=>setTarget(e.target.value)} placeholder={panel==='create'?'Optional rival':'Your rival'} autoComplete="off"/></label><button className="primary" disabled={busy||panel==='invite'&&!target.trim()} onClick={()=>void ensure(async s=>{if(panel==='create'){await act(s,'createRoom',[mode]);if(target.trim()){const id=await independentReader(base,manifest!).lobby('occupancy',[s.grant.player]);await act(s,'inviteToRoom',[id,await resolveTarget()]);}}else{const address=await resolveTarget();await act(s,room?'inviteToRoom':'inviteSomeone',room?[room.id,address]:[address,mode]);}setPanel(null);setTarget('');})}>{panel==='create'?'Create room':'Send challenge'}</button></>}
   {panel==='members'&&room&&<><div className="rooms-member-list">{room.members.map((member:any)=><div className="rooms-contact" key={member.player}><Avatar index={profile(member.player)?.avatar}/><strong>{name(member.player)}</strong><span>{member.away?'Away':equal(member.player,room.host)?'Host':'In queue'}</span><button onClick={()=>void copy(member.player)}>Copy address</button></div>)}</div>{ownRoom&&<button onClick={()=>setPanel('invite')}>Invite someone</button>}</>}
   {panel==='tools'&&<><p>{fps} FPS</p><p>{networkMessage||'Connected'}</p><p className="rooms-address">{resultId}</p>{player&&<button onClick={()=>void copy(player)}>Copy address</button>}{active&&side>=0&&<button disabled={busy} onClick={()=>void run(async()=>{await lane.current?.action('concede',[snapshot!.id]);})}>Concede</button>}{!active&&ownRoom&&<button disabled={busy} onClick={()=>void ensure(s=>act(s,'leaveRoom'))}>Leave room</button>}</>}
   {panel==='ranking'&&<><div className="control-segments"><button aria-pressed={mode===0} onClick={()=>setMode(0)}>Classic</button><button aria-pressed={mode===1} onClick={()=>setMode(1)}>Chaos</button></div><p>Published on Monad. Recent results may still be challenged.</p>{ranking?.rebuilding>0n&&<p>Recalculating corrected results</p>}<div className="rooms-ranking">{ranking?.rows.map((row:any,i:number)=><div className="rooms-contact" key={row.player}><span>{i+1}</span><Avatar index={row.profile.avatar}/><strong>{row.profile.handle||short(row.player)}</strong><b>{row.elo} ELO</b><button disabled={busy||equal(row.player,player)} onClick={()=>void ensure(async s=>{await act(s,'inviteSomeone',[row.player,mode]);setPanel(null);})}>Challenge</button></div>)}{ranking&&!ranking.rows.length&&<p>No ranked matches yet.</p>}</div></>}
   {panel==='more'&&<>{player&&<button onClick={()=>{setReplayId(undefined);setPanel('history');}}>My recent matches</button>}<a className="rooms-button" href="/?deployment=v4">Previous arenas · Chaos, tournaments, payments and replays</a><a className="rooms-button" href="/docs" target="_blank" rel="noreferrer">Documentation ↗</a></>}
   {error?<ArcadeProgress stage="error" detail={error} compact/>:(busy||pendingSponsor)&&panel!=='market'?<ArcadeProgress stage={pendingSponsor?sponsorStage(pendingSponsor.status):actionStage} compact/>:null}{notice&&<p role="status">{notice}</p>}
  </Dialog>}
 </main>;
}
