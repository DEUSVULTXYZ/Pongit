"use client";
import {useEffect,useMemo,useRef,useState,useCallback} from 'react';
import {isAddress,zeroAddress,maxUint256,type Address} from 'viem';
import {Court} from './Court';
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
import {arcadeAudio} from '../lib/audio';
import {connect,rememberedAccount,forgetAccount} from '../lib/wallet';
import {gameTabLock} from '../lib/game-tab-lock';
import {LabLane,labSide,type LabSnapshot} from '../lib/interlude-lab';
import {TickPilot} from '../../shared/engine-feed';
import {engineReadRetryMs} from '../../shared/engine-read';
import {publicationUnavailable} from '../../shared/service-error';
import {ArenaRecovery} from '../../shared/independent-recovery';
import {reportIndependentDiagnostics} from '../lib/independent';
import {readIndependentLobby,readIndependentRanking,independentReader} from '../../shared/independent-read';
import {publicIndependentManifest,arenaReference,parseRoomReference,roomReference,type IndependentManifest} from '../../shared/independent';
import {independentApi,independentBase,loadFamily,openFamily,renewIndependentControl,validateFamily,resumeSponsored,lobbyCommand,saveIndependentProfile,disconnectFamily,eraseFamilyLocal,createIndependentArena,type FamilySession} from '../lib/independent';

type Panel='account'|'ranking'|'invite'|'create'|'members'|'tools'|'more'|'connect'|'private'|'market'|'history'|null;
const short=(a:string)=>`${a.slice(0,6)}…${a.slice(-4)}`;
const equal=(a?:string,b?:string)=>!!a&&!!b&&a.toLowerCase()===b.toLowerCase();
const recoveryDelay=(e:unknown)=>Math.max(engineReadRetryMs(e),publicationUnavailable(e)?30000:3000);
const empty={room:null,proposal:null,queue:null,invitations:[],profiles:{},binding:null,app:null,published:null,occupancy:0n,active:0n,now:0n};
export function IndependentHub({roomId}:{roomId?:string}){
 const base=useMemo(independentBase,[]);
 const [manifest,setManifest]=useState<IndependentManifest>(),[config,setConfig]=useState<any>();
 const [family,setFamily]=useState<FamilySession|null>(null),[saved,setSaved]=useState<Address>(),[ready,setReady]=useState(false);
 const [view,setView]=useState<any>(empty),[snapshot,setSnapshot]=useState<LabSnapshot|null>(null),[mode,setMode]=useState<0|1>(0);
 const [panel,setPanel]=useState<Panel>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[sync,setSync]=useState('');
 const [lobbySync,setLobbySync]=useState('');
 const {now,clock:lobbyClock}=useLobbyClock();
 const [sound,setSound]=useState(false),[direction,setDirection]=useState(0),[fps,setFps]=useState(0),[controlled,setControlled]=useState(false);
 const [handle,setHandle]=useState(''),[avatar,setAvatar]=useState(0),[target,setTarget]=useState(''),[ranking,setRanking]=useState<any>(),[showResult,setShowResult]=useState(0),[settled,setSettled]=useState<any>(null);
 const [frequent,setFrequent]=useState<any[]>([]),[replayId,setReplayId]=useState<bigint>();
 const pendingAction=useRef<((s:FamilySession)=>Promise<void>)|null>(null),working=useRef(false),refreshing=useRef(false);
 const scoreSeen=useRef<{id:bigint;score:number;at:number}|null>(null);
 const current=useRef({family,view,panel,ready});current.current={family,view,panel,ready};
 const lane=useRef<LabLane|null>(null),arena=useRef<ReturnType<typeof createIndependentArena>|null>(null),lock=useRef<(()=>void)|null>(null);
 const bindingRef=useRef<any>(null),lastGame=useRef<{app:Address;binding:any}|null>(null);
 const player=family?.grant.player??saved;
 const profile=(a:string)=>view.profiles[a.toLowerCase()];
 const name=(a:string)=>profile(a)?.handle||short(a);
 const ownRoom=view.room&&player&&view.room.members.some((m:any)=>equal(m.player,player));
 const room=ownRoom?view.room:null,offer=room?view.proposal:null;
 const recoveringArena=!!(view.binding?.epoch&&view.delegation&&view.delegation.status!==1);
 const side=labSide(snapshot,player),active=snapshot?.phase===2,canPlay=!!(active&&!recoveringArena&&side>=0&&controlled&&!panel);
 const mine=room?.members.find((m:any)=>equal(m.player,player));
 const offerSide=offer&&player?(equal(offer.a,player)?0:equal(offer.b,player)?1:-1):-1;
 const canAccept=offer?.status===1&&offerSide>=0;
 const queueSeconds=useQueueElapsed(view.queue?`${player}:${view.queue[0]}:${view.queue[1]}`:undefined);
 const resultId=snapshot&&lastGame.current?arenaReference(lastGame.current.app,lastGame.current.binding.epoch,snapshot.id):null;
 const resultEntry=snapshot&&settled?.entry.first.id===snapshot.id?settled.entry:snapshot&&view.published?.first.id===snapshot.id?view.published:null;
 const ratingDelta=snapshot&&settled?.entry.first.id===snapshot.id&&side>=0?Number(settled.change[side+2])-Number(settled.change[side]):undefined;
 const outcome=snapshot?{playerA:snapshot.a,playerB:snapshot.b,winner:snapshot.winner,status:snapshot.phase,state:snapshot.state,mode:lastGame.current?.binding.mode,ranked:lastGame.current?.binding.ranked,ratingFinalized:!!resultEntry}:null;
 const refresh=useCallback(async()=>{
  if(!manifest||refreshing.current)return;refreshing.current=true;
  try{
   const s=current.current.family,requested=roomId?parseRoomReference(roomId,manifest.lobby):undefined;
   let last:undefined|{app:Address;id:bigint;epoch:bigint};
   try{const v=JSON.parse(sessionStorage.getItem(`pongit:last-arena:${manifest.lobby}:${s?.grant.player}`)||'null');if(v&&manifest.arenas.some(a=>equal(a.app,v.app)))last={app:v.app,id:BigInt(v.id),epoch:BigInt(v.epoch)};}catch{}
   const next=await readIndependentLobby(base,manifest,s?.grant.player,requested,last);lobbyClock.observe(Number(next.now)*1000);setView(next);setLobbySync('');
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
  const load=()=>void independentApi('config').then(c=>{if(!alive)return;const m=publicIndependentManifest(c.manifest);setManifest(m);setConfig(c);setFamily(loadFamily(m));setSaved(rememberedAccount()?.address as Address|undefined);setError('');}).catch(()=>{if(alive){setError('Game services are temporarily unavailable. Retrying automatically.');retry=setTimeout(load,5000);}});
  load();return()=>{alive=false;clearTimeout(retry);};
 },[]);
 useEffect(()=>{
  if(!manifest)return;let stopped=false;let timer:ReturnType<typeof setTimeout>;
  const poll=async()=>{try{await refresh();}catch(e){if(!stopped)setLobbySync('Synchronizing the lobby. Your session is still saved.');}finally{if(!stopped)timer=setTimeout(poll,3000);}};
  void poll();const t=setInterval(()=>{void independentApi('config').then(setConfig).catch(()=>{});},10000);
  return()=>{stopped=true;clearTimeout(timer);clearInterval(t);};
 },[manifest,refresh]);
 useEffect(()=>{
  if(!manifest||!family)return;
  void resumeSponsored(manifest).then(refresh).catch(e=>setNotice(e.message));
 },[manifest,family?.grant.key,refresh]);
 useEffect(()=>{
  if(!manifest||!family)return;let sending=false;const instance=crypto.randomUUID();
  const timer=setInterval(()=>{if(sending)return;sending=true;void reportIndependentDiagnostics(manifest,family,instance).catch(()=>{}).finally(()=>{sending=false;});},10000);
  return()=>clearInterval(timer);
 },[manifest,family?.grant.key]);
 async function run(fn:()=>Promise<void>){
  if(working.current)return;working.current=true;setBusy(true);setError('');
  try{await fn();}catch(e){setError((e as Error).message);}finally{working.current=false;setBusy(false);}
 }
 const progress=(op:{status:string})=>setNotice(op.status==='queued'?'Waiting for sponsorship':op.status==='pending'?'Waiting for Monad confirmation':'');
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
   const identity=await connect(create,another);try{
    const s=await openFamily(manifest,identity,progress);await renewIndependentControl(manifest,identity,s);setFamily(s);current.current.family=s;setSaved(s.grant.player);setReady(true);setPanel(null);setSync('');
    const action=pendingAction.current;pendingAction.current=null;if(action)await action(s);await refresh();
   }finally{identity.end();}
  });
 }
 async function copy(text:string){try{await navigator.clipboard.writeText(text);setNotice('Copied');setTimeout(()=>setNotice(''),2000);}catch{setError('Copy failed. Select the address or link and copy it manually.');}}
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
  if(!manifest||!bound?.epoch||!view.app||recoveringArena)return;
  const binding=bound,app=view.app as Address;
  bindingRef.current=binding;lastGame.current={app,binding};
  if(family)sessionStorage.setItem(`pongit:last-arena:${manifest.lobby}:${family.grant.player}`,JSON.stringify({app,id:String(binding.id),epoch:String(binding.epoch)}));
  const instance=createIndependentArena(manifest,app);arena.current=instance;
  let stopped=false,retryAt=0,opening=false;let play:LabLane|null=null;const pilot=new TickPilot(),recovery=new ArenaRecovery();
  const id=BigInt(binding.id),receive=(s:LabSnapshot,latency?:number)=>{
   if(stopped)return;setSnapshot(s);pilot.observe(s,performance.now());play?.ingest(s);setSync(recovery.observed(s.phase>=3,latency!==undefined));
   const before=scoreSeen.current,total=s.state.scoreA+s.state.scoreB;
   if(before?.id===s.id&&total===before.score+1&&Date.now()-before.at<3000)arcadeAudio.play('point',`${app}:${binding.epoch}:${s.id}:score:${total}`);
   scoreSeen.current={id:s.id,score:total,at:Date.now()};
   if(s.phase>=3){play?.intent(0);setDirection(0);setControlled(false);arcadeAudio.setGameplay(false);void refresh().catch(()=>{if(!stopped)setLobbySync('Synchronizing the lobby. Your session is still saved.');});}
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
    play=new LabLane(fresh=>instance.feed.read(id,fresh),session,s.grant.player,receive,e=>{setControlled(false);setSync(recovery.failure(e));retryAt=Date.now()+recoveryDelay(e);},e=>setSync(recovery.failure(e)),{readMs:500,tickMs:300},{receipt:(result,name,args)=>instance.feed.receipt(id,result,name,args,s.grant.player),sending:value=>pilot.sending(value)});
    const known=instance.feed.peek(id);if(known)play.ingest(known);lane.current=play;setControlled(true);
   }catch(e){retryAt=Date.now()+recoveryDelay(e);if(!stopped)setSync(recovery.failure(e));}finally{opening=false;}
  };
  void observe();void restore();
  const timer=setInterval(()=>{
   const s=instance.feed.peek(id);if(s?.phase&&s.phase>=3)return;
   if(play&&!play.stopped){void play.pump(!!s&&pilot.due(labSide(s,current.current.family?.grant.player),s,performance.now()));}
   else{void observe();void restore();}
  },100);
  return()=>{stopped=true;clearInterval(timer);stop();play?.stop();if(lane.current===play)lane.current=null;setControlled(false);lock.current?.();lock.current=null;};
 },[manifest,view.app,bound?.id,bound?.epoch,family?.grant.key,refresh,recoveringArena]);
 const move=useCallback((d:number)=>{const blocked=current.current.panel||document.querySelector('[aria-modal="true"]');const value=blocked?0:d;lane.current?.intent(value);setDirection(value);},[]);
 useEffect(()=>{
  const keys=new Set<string>(),up=new Set(['w','arrowup']),down=new Set(['s','arrowdown']);
  const release=()=>{keys.clear();move(0);};
  const key=(e:KeyboardEvent,on:boolean)=>{
   const k=e.key.toLowerCase();if(!up.has(k)&&!down.has(k))return;
   if(!canPlay||(e.target as HTMLElement).closest('input,textarea,select,[contenteditable=true]'))return;
   e.preventDefault();if(on)keys.add(k);else keys.delete(k);move([...keys].some(x=>up.has(x))?-1:[...keys].some(x=>down.has(x))?1:0);
  };
  const kd=(e:KeyboardEvent)=>key(e,true),ku=(e:KeyboardEvent)=>key(e,false);
  const observer=new MutationObserver(()=>{if(document.querySelector('[aria-modal="true"]'))release();});observer.observe(document.body,{childList:true,subtree:true});
  window.addEventListener('keydown',kd);window.addEventListener('keyup',ku);window.addEventListener('blur',release);document.addEventListener('visibilitychange',release);
  return()=>{observer.disconnect();window.removeEventListener('keydown',kd);window.removeEventListener('keyup',ku);window.removeEventListener('blur',release);document.removeEventListener('visibilitychange',release);release();};
 },[canPlay,move]);
 useEffect(()=>{arcadeAudio.setGameplay(!!active);return()=>arcadeAudio.setGameplay(false);},[active]);
 useEffect(()=>{
  if(!manifest||!family||!view.queue)return;const t=setInterval(()=>{if(!working.current)void run(()=>act(family,'queueHeartbeat'));},10000);return()=>clearInterval(t);
 },[manifest,family?.grant.key,!!view.queue]);
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
 const modalTitle=panel==='account'?'Your account':panel==='ranking'?'Ranking':panel==='invite'?'Invite someone':panel==='create'?'Create room':panel==='members'?'Room members':panel==='tools'?'Cabinet tools':panel==='connect'?'Connect to play':panel==='private'?'Private notebook':panel==='market'?'Wallet and betting':panel==='history'?'Match history':'More';
 const arenaHealth=config?.arenas.find((a:any)=>equal(a.app,lastGame.current?.app)&&String(a.epoch)===String(lastGame.current?.binding.epoch));
 const networkMessage=recoveringArena||active&&['publication-paused','recovering','closing','review'].includes(arenaHealth?.stage)?'This arena is recovering. Your arcade session is still saved.':sync||lobbySync;
 const pauseLabel=recoveringArena?'Recovering this arena':snapshot&&arenaHealth?.rally?.id===String(snapshot.id)&&arenaHealth.rally.rally===snapshot.state.scoreA+snapshot.state.scoreB&&arenaHealth.rally.resumeAt===String(snapshot.state.resumeAt)?arenaHealth.rally.label:'Waiting for confirmed Chaos bets on Monad';
 return <main className={`cabinet-ui rooms-shell ${active?'rooms-playing':''}`}>
  <header className="rooms-header"><a className="brand" href="/" aria-label="PONGIT home"><img className="brand-mark" src="/brand/opposing-orbits.webp" alt="" width="40" height="40"/><span className="brand-word">PONGIT</span></a><div className="rooms-header-actions">
   <ArcadeAmbience onSound={setSound}/><a className="rooms-button" href="/docs" target="_blank" rel="noreferrer">Docs ↗</a><button onClick={()=>setPanel('ranking')}>Ranking</button><button onClick={()=>setPanel('more')}>More</button>
   <button disabled={busy||!manifest} onClick={()=>ready?setPanel('account'):void ensure(async()=>{})}>{ready&&player?name(player):family&&view.grant?'Renew arcade session':saved?'Continue as '+short(saved):'Connect'}</button>
  </div></header>
  {notice&&<p className="rooms-notice" role="status">{notice}</p>}{error&&!panel&&<p className="rooms-error" role="alert">{error}</p>}{networkMessage&&<p className="rooms-notice" role="status">{networkMessage}</p>}
  {view.invitations[0]&&<aside className="rooms-invitation"><Avatar index={profile(view.invitations[0].sender)?.avatar}/><strong>{name(view.invitations[0].sender)}</strong><button className="primary" disabled={busy} onClick={()=>void ensure(s=>act(s,'answerInvitation',[view.invitations[0].id,true]))}>Accept</button><button disabled={busy} onClick={()=>void ensure(s=>act(s,'answerInvitation',[view.invitations[0].id,false]))}>Back</button></aside>}
  {roomId&&!ownRoom?<section className="rooms-entry"><h1>{view.room?name(view.room.host):'PONGIT room'}</h1><div className="rooms-button-row"><button className="primary" disabled={busy||!manifest} onClick={()=>void ensure(s=>act(s,'joinRoom',[parseRoomReference(roomId,manifest!.lobby)]))}>Accept</button><a className="rooms-button" href="/">Back</a></div></section>
  :!room&&!view.queue?<section className="rooms-home"><div className="palace-marquee"><span className="palace-star" aria-hidden="true"/><h1><span>Pong is back</span><span>Bring a rival</span></h1><span className="palace-star" aria-hidden="true"/></div><div className="rooms-choices">
   {(['match','invite','room'] as const).map((kind,i)=><button key={kind} className={`rooms-choice rooms-choice-${kind}`} disabled={busy||!manifest} onClick={()=>void ensure(async s=>{if(kind==='match')await startQueue(s);else setPanel(kind==='invite'?'invite':'create');})}><span className="rooms-choice-stage"><PixelPalaceArt kind={kind}/></span><strong>{['Matchmaking','Invite someone','Create room'][i]}</strong><span>{[`${mode?'Chaos':'Classic'} · Ranked`,'Your next rival','8 friends · Winner stays'][i]}</span><i className="palace-key" aria-hidden="true">↗</i></button>)}
  </div><div className="control-segments rooms-mode-choice" role="group" aria-label="Game mode"><button aria-pressed={mode===0} onClick={()=>setMode(0)}>Classic</button><button aria-pressed={mode===1} onClick={()=>setMode(1)}>Chaos</button></div><p className="rooms-caption">Free to play · Monad Testnet</p>{ready&&player&&!profile(player)?.handle&&<button className="rooms-profile-prompt" onClick={()=>setPanel('account')}>Choose your username ↗</button>}</section>
  :view.queue?<section className="rooms-entry"><h1>Finding your rival</h1><p className="rooms-timer">{Math.floor(queueSeconds/60)}:{String(queueSeconds%60).padStart(2,'0')}</p><span>{view.queue[0]?'Chaos':'Classic'} · Ranked</span><button disabled={busy} onClick={()=>void ensure(s=>act(s,'cancelQueue'))}>Cancel</button></section>
  :room?<><div className="rooms-room-bar"><span>{room.mode?'CHAOS':'CLASSIC'} / {room.ranked?'RANKED':'WINNER STAYS'}</span><div><button onClick={()=>void copy(`${location.origin}/rooms/${roomReference(manifest!.lobby,room.id)}`)}>Copy room link</button><button onClick={()=>setPanel('members')}>Members {room.members.length}</button>{room.mode===1&&<button onClick={()=>setPanel('market')}>Betting</button>}<button onClick={()=>setPanel('tools')}>Tools</button></div></div>
   {canAccept?<section className="rooms-entry rooms-duel"><div className="rooms-versus"><span>{name(offer.a)}</span><b>VS</b><span>{name(offer.b)}</span></div><small>{Math.max(0,Math.ceil(Number(offer.expires)-now/1000))}s</small><div className="rooms-button-row"><button className="primary" disabled={busy||!!(offer.accepted&(1<<offerSide))||Number(offer.expires)*1000<now} onClick={()=>void ensure(s=>act(s,'acceptProposal',[offer.id]))}>{offer.accepted&(1<<offerSide)?'Waiting…':'Accept'}</button><button disabled={busy} onClick={()=>void ensure(s=>act(s,'declineProposal',[offer.id]))}>Back</button></div></section>
   :snapshot&&(!offer||offer.id===snapshot.id)?<section className="rooms-court court-card"><div className="scoreboard">{[snapshot.a,snapshot.b].map((p,i)=><div className={`player-label ${i?'right':''}`} style={i?{gridColumn:3}:undefined} key={p}><Avatar index={profile(p)?.avatar}/><small>PLAYER 0{i+1}</small><span>{name(p)}</span><div className="arena-rounds" aria-hidden="true">{Array.from({length:7},(_,n)=><b key={n} data-won={n<(i?snapshot.state.scoreB:snapshot.state.scoreA)}/>)}</div></div>)}<div className="arena-score-module" style={{gridColumn:2,gridRow:1}}><small>FIRST TO SEVEN</small><div className="score"><span>{String(snapshot.state.scoreA).padStart(2,'0')}</span><i>:</i><span>{String(snapshot.state.scoreB).padStart(2,'0')}</span></div></div></div>
    <div className="rooms-canvas">{snapshot.state.awaitingServe&&<div className="rooms-serve-status" role="status">{pauseLabel}</div>}<Court liveEngine externalIntermission state={snapshot.state} clock={snapshot.clock} observedAt={snapshot.observedAt} direction={direction} side={side} replay={!active||recoveringArena} matchId={resultId!} controllable={canPlay} pending={!!lane.current?.inputPending} confirmedNonce={side===0?snapshot.nonceA:snapshot.nonceB} onStats={setFps}/></div>
    <div className="rooms-court-controls"><span>{side>=0?'W / S · ↑ / ↓':`YOUR TURN ${Math.max(1,room.members.filter((m:any)=>!m.away).sort((a:any,b:any)=>Number(a.position-b.position)).findIndex((m:any)=>equal(m.player,player))+1)}`}</span>{active&&side>=0?<div className="touch-controls">{([-1,1] as const).map(d=><IconButton key={d} icon={d<0?'up':'down'} aria-label={d<0?'Move up':'Move down'} disabled={!canPlay} onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);move(d);}} onPointerUp={()=>move(0)} onPointerCancel={()=>move(0)} onLostPointerCapture={()=>move(0)}/>)}</div>:snapshot.phase>=3?<button onClick={()=>setShowResult(n=>n+1)}>View result</button>:null}</div></section>
   :<section className="rooms-entry"><h1>{recoveringArena?'Recovering this arena':offer?.status===2?'Waiting for an available arena':mine?.away?'Take your next turn':'Bring a rival'}</h1><div className="rooms-member-strip">{room.members.map((m:any)=><span key={m.player}><Avatar index={profile(m.player)?.avatar}/>{name(m.player)}</span>)}</div><div className="rooms-button-row">{mine?.away?<button className="primary" disabled={busy} onClick={()=>void ensure(s=>act(s,'rejoinQueue',[room.id]))}>Rejoin queue</button>:<button className="primary" onClick={()=>setPanel('invite')}>Invite someone</button>}<button disabled={busy} onClick={()=>void ensure(s=>act(s,offer?.status===2?'cancelAdmission':'leaveRoom',offer?.status===2?[offer.id]:[]))}>Back</button></div></section>}
  </>:null}
  {!active&&<footer className="rooms-footer"><MusicCredit/><EngineCredit/><a href="/?deployment=v4">Previous arenas</a></footer>}
  <Outcome id={resultId} match={outcome} account={player||''} rating={null} ratingDelta={ratingDelta} sound={sound} replay={false} confirmation={resultEntry?'monad':'engine'} showResultKey={showResult} watch={()=>{setReplayId(snapshot?.id);setPanel('history');}} rematch={async()=>{if(!family||!snapshot)throw Error('Connect to request a rematch');await act(family,'rematch',[snapshot.id]);setNotice('Waiting for your rival');}} again={()=>void ensure(startQueue)}/>
  {panel&&<Dialog label={modalTitle} className="rooms-dialog" onClose={()=>{if(busy)return;if(panel==='connect')pendingAction.current=null;setPanel(null);setError('');}}><IconButton className="modal-close" aria-label={`Close ${modalTitle}`} disabled={busy} onClick={()=>{if(panel==='connect')pendingAction.current=null;setPanel(null);setError('');}}/><h2>{modalTitle}</h2>
   {panel==='account'&&family&&manifest&&<div className="rooms-button-row"><button onClick={()=>setPanel('private')}>Private notebook</button><button onClick={()=>setPanel('market')}>Wallet and payments</button><button disabled={busy} onClick={()=>void run(async()=>{let pending=true;try{const result=await disconnectFamily(manifest,family,active&&lastGame.current?lastGame.current:undefined);pending=result.revocationPending;}finally{lane.current?.stop();eraseFamilyLocal(manifest);setFamily(null);current.current.family=null;setReady(false);setControlled(false);lock.current?.();lock.current=null;setPanel(null);setNotice(pending?'Disconnected locally. Network revocation remains to be confirmed.':'Disconnected. Arcade authorization revoked.');}})}>Disconnect</button><button disabled={busy} onClick={()=>{forgetAccount();setSaved(undefined);setNotice('Remembered passkey forgotten. Disconnect to revoke your active arcade session.');}}>Forget this account</button></div>}
   {panel==='private'&&manifest&&player&&<IndependentPrivate manifest={manifest} player={player} kind="notebook" matchRef={resultId??undefined} atUs={snapshot?.clock}/>}
   {panel==='market'&&manifest&&player&&<IndependentMarket manifest={manifest} player={player} id={snapshot?.state.mode===1?snapshot.id:undefined} onBusy={v=>{working.current=v;setBusy(v);}}/>}
   {panel==='history'&&player&&<IndependentHistory player={player} matchId={replayId}/>}
   {(panel==='invite'||panel==='create')&&manifest&&player&&<IndependentPrivate manifest={manifest} player={player} kind="contacts" onChallenge={p=>setTarget(p)}/>}
   {(panel==='invite'||panel==='create')&&frequent.length>0&&<section><h3>Recent rivals</h3>{frequent.map(row=><button key={row.player} onClick={()=>setTarget(row.player)}>{name(row.player)} · {row.count} matches</button>)}</section>}
   {panel==='connect'&&<><button className="primary" disabled={busy} onClick={()=>void login(false)}>Use a passkey</button><button disabled={busy} onClick={()=>void login(true)}>Create a passkey</button></>}
   {panel==='account'&&player&&<><p className="rooms-address">{player}</p><button onClick={()=>void copy(player)}>Copy address</button><label>Username<input value={handle} onChange={e=>setHandle(e.target.value)} maxLength={20} autoComplete="nickname"/></label><AvatarPicker value={avatar} disabled={busy} onChange={setAvatar}/><button className="primary" disabled={busy||!manifest} onClick={()=>void run(async()=>{await saveIndependentProfile(manifest!,player,handle.trim(),avatar);await refresh();setPanel(null);setNotice('Profile saved');})}>Save profile</button><button disabled={busy} onClick={()=>void login(false,true)}>Use another passkey</button><a className="rooms-button" href="/?deployment=v4">Wallet, payments and previous arenas</a></>}
   {(panel==='invite'||panel==='create')&&<><label>Username or address<input value={target} onChange={e=>setTarget(e.target.value)} placeholder={panel==='create'?'Optional rival':'Your rival'} autoComplete="off"/></label><button className="primary" disabled={busy||panel==='invite'&&!target.trim()} onClick={()=>void ensure(async s=>{if(panel==='create'){await act(s,'createRoom',[mode]);if(target.trim()){const id=await independentReader(base,manifest!).lobby('occupancy',[s.grant.player]);await act(s,'inviteToRoom',[id,await resolveTarget()]);}}else{const address=await resolveTarget();await act(s,room?'inviteToRoom':'inviteSomeone',room?[room.id,address]:[address,mode]);}setPanel(null);setTarget('');})}>{panel==='create'?'Create room':'Send challenge'}</button></>}
   {panel==='members'&&room&&<><div className="rooms-member-list">{room.members.map((member:any)=><div className="rooms-contact" key={member.player}><Avatar index={profile(member.player)?.avatar}/><strong>{name(member.player)}</strong><span>{member.away?'Away':equal(member.player,room.host)?'Host':'In queue'}</span><button onClick={()=>void copy(member.player)}>Copy address</button></div>)}</div><button onClick={()=>setPanel('invite')}>Invite someone</button></>}
   {panel==='tools'&&<><p>{fps} FPS</p><p>{networkMessage||'Connected'}</p><p className="rooms-address">{resultId}</p><button onClick={()=>void copy(player||'')}>Copy address</button>{active&&side>=0&&<button disabled={busy} onClick={()=>void run(async()=>{await lane.current?.action('concede',[snapshot!.id]);})}>Concede</button>}{!active&&room&&<button disabled={busy} onClick={()=>void ensure(s=>act(s,'leaveRoom'))}>Leave room</button>}</>}
   {panel==='ranking'&&<><div className="control-segments"><button aria-pressed={mode===0} onClick={()=>setMode(0)}>Classic</button><button aria-pressed={mode===1} onClick={()=>setMode(1)}>Chaos</button></div><p>Published on Monad. Recent results may still be challenged.</p>{ranking?.rebuilding>0n&&<p>Recalculating corrected results</p>}<div className="rooms-ranking">{ranking?.rows.map((row:any,i:number)=><div className="rooms-contact" key={row.player}><span>{i+1}</span><Avatar index={row.profile.avatar}/><strong>{row.profile.handle||short(row.player)}</strong><b>{row.elo} ELO</b><button disabled={busy||equal(row.player,player)} onClick={()=>void ensure(async s=>{await act(s,'inviteSomeone',[row.player,mode]);setPanel(null);})}>Challenge</button></div>)}{ranking&&!ranking.rows.length&&<p>No ranked matches yet.</p>}</div></>}
   {panel==='more'&&<>{player&&<button onClick={()=>{setReplayId(undefined);setPanel('history');}}>My recent matches</button>}<a className="rooms-button" href="/?deployment=v4">Previous arenas · Chaos, tournaments, payments and replays</a><a className="rooms-button" href="/docs" target="_blank" rel="noreferrer">Documentation ↗</a></>}
   {error&&<p className="rooms-error" role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  </Dialog>}
 </main>;
}
