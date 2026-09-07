"use client";
import {useEffect,useRef,useState} from "react";
import {createWalletClient,http,isAddress,toHex,zeroAddress,zeroHash,type Address} from "viem";
import {monadTestnet} from "viem/chains";
import {Court} from "./Court";
import {ArcadeAmbience,MusicCredit} from "./ArcadeAmbience";
import {Dialog} from "./Dialog";
import {IconButton} from "./IconButton";
import {connect,rememberedAccount,type Identity} from "../lib/wallet";
import {arcadeAudio} from "../lib/audio";
import {createLabClient,labManifest,labScope,labAccountKey,labSnapshot,labSide,labDelegation,LabLane,type LabClient,type LabSnapshot,type LabSession} from "../lib/interlude-lab";

const short=(a:string)=>`${a.slice(0,6)}…${a.slice(-4)}`;
const quiet=()=>{};
async function ownTab(account:string):Promise<()=>void>{
 if(!navigator.locks)throw new Error("This browser cannot protect the session across tabs. Use a current Chrome, Edge, Firefox or Safari.");
 return new Promise((resolve,reject)=>{void navigator.locks.request(`pongit:interlude:${labManifest.app}:${account.toLowerCase()}`,{ifAvailable:true},async lock=>{
  if(!lock){reject(new Error("This account is controlling the lab in another tab. Close that lab tab, then reconnect."));return;}
  await new Promise<void>(release=>resolve(release));
 }).catch(reject);});
}

export function InterludeLab(){
 const [snapshot,setSnapshot]=useState<LabSnapshot|null>(null),[account,setAccount]=useState<Address>(),[saved,setSaved]=useState<Address>();
 const [online,setOnline]=useState(false),[sessionReady,setSessionReady]=useState(false),[busy,setBusy]=useState(false),[connecting,setConnecting]=useState(false);
 const [notice,setNotice]=useState("Connecting to the Interlude engine…"),[error,setError]=useState(""),[direction,setDirection]=useState(0),[latency,setLatency]=useState(0),[fps,setFps]=useState(0);
 const [showConnect,setShowConnect]=useState(false),[target,setTarget]=useState(""),[inviteId,setInviteId]=useState<string|null>(null),[expires,setExpires]=useState<Date>();
 const [committed,setCommitted]=useState<LabSnapshot|null>(null),[matchedHash,setMatchedHash]=useState(false),[baseError,setBaseError]=useState(false);
 const client=useRef<LabClient|null>(null),lane=useRef<LabLane|null>(null),session=useRef<LabSession|null>(null),state=useRef<LabSnapshot|null>(null),release=useRef<(()=>void)|null>(null);
 const alive=useRef(false),actionBusy=useRef(false),authBusy=useRef(false),identityVersion=useRef(0),accountRef=useRef<Address|undefined>(undefined),wanted=useRef(0),failed=useRef(false);
 const side=labSide(snapshot,account),playable=online&&sessionReady&&side>=0&&snapshot?.phase===2&&!busy&&!showConnect;
 const controllable=useRef(false);controllable.current=playable;
 const setIntent=(d:number)=>{if(d!==0&&!controllable.current)return;wanted.current=d;lane.current?.intent(d);setDirection(d);if(lane.current&&!lane.current.stopped)void lane.current.pump(false);};
 const acceptSnapshot=(s:LabSnapshot,ms?:number)=>{
  if(!alive.current)return;
  const before=state.current;
  if(before && (s.id<before.id || s.id===before.id&&(s.revision<before.revision||s.head<before.head)))return;
  if(before?.id!==s.id)setMatchedHash(false);
  state.current=s;setSnapshot(s);if(ms!==undefined)setLatency(Math.round(ms));
  if(s.phase!==2){wanted.current=0;lane.current?.intent(0);setDirection(0);}
 };
 const fail=(reason:unknown)=>{
  failed.current=true;lane.current?.stop();wanted.current=0;
  if(alive.current){setDirection(0);setSessionReady(false);setError("The engine could not confirm this action. Read the current arena, then use Reconnect lab session. No action will be replayed automatically.");}
 };
 async function read(){return labSnapshot(await client.current!.read("getSnapshot") as readonly unknown[]);}
 async function install(account:Address,next:LabSession){
  session.current=next;accountRef.current=account;failed.current=false;
  const writer=new LabLane(read,next,account,acceptSnapshot,fail);writer.intent(0);lane.current=writer;
  sessionStorage.setItem(labAccountKey,account);setAccount(account);setExpires(next.expiresAt);setSessionReady(true);setError("");setNotice("Lab session ready. Your main arcade session and balances are separate.");
 }
 useEffect(()=>{
  alive.current=true;const c=createLabClient();client.current=c;let done=false,pollTimer:ReturnType<typeof setTimeout>,baseTimer:ReturnType<typeof setTimeout>,guardTimer:ReturnType<typeof setTimeout>;
  let pinned:number|undefined,lastHead=0,guardPassed=false;
  setSaved(rememberedAccount()?.address);setInviteId(new URLSearchParams(location.search).get("match"));
  const guard=async()=>{
   try{
    const [status,delegation]=await Promise.all([c.status(),labDelegation(c)]);
    if(delegation.status!==1||delegation.expiresAt<=BigInt(Math.floor(Date.now()/1000)+15)||delegation.epoch!==BigInt(status.epoch))throw new Error("The delegation is no longer active.");
    if(status.app.toLowerCase()!==labManifest.app||status.chainId!==4242||pinned!==undefined&&(status.baseBlock!==pinned||status.ephemeralBlock<lastHead))throw new Error("Engine identity or clock changed.");
    pinned=status.baseBlock;lastHead=status.ephemeralBlock;guardPassed=true;
    if(!done)setOnline(true);
    if(session.current){if(session.current.isExpired()||await c.epochOf(session.current.granter)!==session.current.grant.epoch){lane.current?.stop();session.current.discard();session.current=null;if(!done){setSessionReady(false);setNotice("Your lab session expired or was revoked. Renew it when you are ready.");}}}
   }catch{guardPassed=false;if(!done){setOnline(false);if(session.current)fail(null);else setNotice("Interlude is unavailable. The main arcade remains available.");}}
   if(!done)guardTimer=setTimeout(guard,10000);
  };
  const poll=async()=>{
   try{const s=await read();if(!done){acceptSnapshot(s);if(!session.current&&guardPassed)setNotice("One Classic friendly arena, powered by Interlude. Join or watch below.");}}
   catch{if(!done){setOnline(false);if(session.current)fail(null);}}
   if(!done)pollTimer=setTimeout(poll,document.hidden?2000:session.current?250:400);
  };
  const basePoll=async()=>{
   try{
    const s=labSnapshot(await c.readSettled("getSnapshot") as readonly unknown[]),live=state.current;
    let same=false;
    if(live&&live.phase>=3){const id=live.id;const [a,b]=await Promise.all([c.read("resultHashes",[id]),c.readSettled("resultHashes",[id])]);same=a!==zeroHash&&a===b;}
    if(!done){setCommitted(s);setMatchedHash(same&&state.current?.id===live?.id);setBaseError(false);}
   }catch{if(!done)setBaseError(true);}
   if(!done)baseTimer=setTimeout(basePoll,document.hidden?15000:5000);
  };
  void (async()=>{
   await guard();if(done)return;void poll();void basePoll();
   const previous=sessionStorage.getItem(labAccountKey);
   if(!previous||!isAddress(previous)||!guardPassed)return;
   const version=identityVersion.current;
   try{release.current=await ownTab(previous);const restored=await c.restoreSession(previous,{scope:labScope});
    if(done||version!==identityVersion.current){release.current?.();release.current=null;return;}
    if(restored)await install(previous,restored);else{release.current?.();release.current=null;setAccount(previous);accountRef.current=previous;setNotice("Renew your lab session to continue playing.");}
   }catch(e){if(!done)setError((e as Error).message);}
  })();
  const pump=setInterval(()=>{
   const s=state.current,w=lane.current;if(done||!guardPassed||!w||failed.current||w.stopped||!s||s.phase!==2||document.hidden)return;
   const left=labSide(s,accountRef.current)===0;
   // Player one drives idle physics; player two takes over when its snapshot falls behind.
   void w.pump(left||s.clock-s.state.t>300000n);
  },100);
  return()=>{done=true;alive.current=false;identityVersion.current++;clearTimeout(pollTimer);clearTimeout(baseTimer);clearTimeout(guardTimer);clearInterval(pump);lane.current?.stop();release.current?.();release.current=null;};
 },[]);
 useEffect(()=>{arcadeAudio.setGameplay(!!playable);return()=>arcadeAudio.setGameplay(false);},[playable]);
 useEffect(()=>{
  const pressed=new Set<string>();
  const stop=()=>{pressed.clear();setIntent(0);if(lane.current&&!lane.current.stopped)void lane.current.pump(false);};
  const key=(e:KeyboardEvent)=>{
   if(!["w","s","ArrowUp","ArrowDown"].includes(e.key)||!controllable.current||document.querySelector('[role="dialog"]')||(e.target as HTMLElement).closest('input,textarea,select,[contenteditable="true"]'))return;
   e.preventDefault();if(e.type==="keydown")pressed.add(e.key);else pressed.delete(e.key);
   setIntent(pressed.has("w")||pressed.has("ArrowUp")?-1:pressed.has("s")||pressed.has("ArrowDown")?1:0);
  };
  window.addEventListener("keydown",key);window.addEventListener("keyup",key);window.addEventListener("blur",stop);window.addEventListener("pongit:overlay",stop);
  const visibility=()=>{if(document.hidden)stop();};document.addEventListener("visibilitychange",visibility);
  return()=>{window.removeEventListener("keydown",key);window.removeEventListener("keyup",key);window.removeEventListener("blur",stop);window.removeEventListener("pongit:overlay",stop);document.removeEventListener("visibilitychange",visibility);};
 },[]);
 async function login(create=false,another=false){
  if(authBusy.current||!online)return;authBusy.current=true;setConnecting(true);setError("");identityVersion.current++;
  let identity:Identity|undefined;
  try{
   lane.current?.stop();release.current?.();release.current=null;
   identity=await connect(create,another);const a=identity.account.address;
   release.current=await ownTab(a);
   const next=await client.current!.openSession({wallet:createWalletClient({account:identity.account,chain:monadTestnet,transport:http()}),scope:labScope,expirySeconds:1800,assertDigest:true});
   await install(a,next);setSaved(a);setShowConnect(false);
  }catch(e){release.current?.();release.current=null;setError((e as Error).name==="NotAllowedError"?"Passkey cancelled. Nothing was sent.":(e as Error).message.split("\n")[0]);setSessionReady(false);}
  finally{identity?.end();authBusy.current=false;setConnecting(false);}
 }
 async function recover(){
  if(authBusy.current||!account)return;authBusy.current=true;setConnecting(true);lane.current?.stop();
  try{
   if(!release.current)release.current=await ownTab(account);
   const next=await client.current!.restoreSession(account,{scope:labScope});
   if(next){await install(account,next);acceptSnapshot(await read());}
   else{release.current?.();release.current=null;setShowConnect(true);}
  }catch(e){setError((e as Error).message.split("\n")[0]);}
  finally{authBusy.current=false;setConnecting(false);}
 }
 async function action(name:string,args:readonly unknown[]=[]){
  if(actionBusy.current||!lane.current||!sessionReady)return;actionBusy.current=true;setBusy(true);setError("");setIntent(0);
  try{const s=await lane.current.action(name,args);if(name==="createMatch"){history.replaceState(null,"",`?match=${s.id}`);setInviteId(s.id.toString());setNotice("Invitation open. Share this page with your rival.");}else setNotice("Action accepted by the engine. Monad receives the committed state separately.");}
  catch(e){if(!failed.current)setError((e as Error).message.split("\n")[0]);}
  finally{actionBusy.current=false;setBusy(false);}
 }
 async function disconnect(){
  identityVersion.current++;setIntent(0);
  if(lane.current&&!lane.current.stopped)await lane.current.pump(false);
  lane.current?.stop();session.current?.discard();session.current=null;release.current?.();release.current=null;sessionStorage.removeItem(labAccountKey);
  accountRef.current=undefined;setAccount(undefined);setSessionReady(false);setNotice("Lab key removed from this tab. Its signed grant expires within 30 minutes; this does not revoke other Interlude grants.");
 }
 const staleLink=!!inviteId&&snapshot?.id.toString()!==inviteId;
 const canJoin=snapshot?.phase===1&&side<0&&!staleLink&&(snapshot.target===zeroAddress||snapshot.target.toLowerCase()===account?.toLowerCase());
 return <main className="cabinet-ui interlude-lab"><header className="lab-header"><a className="brand" href="/" target="_blank" rel="noreferrer"><img className="brand-mark" src="/brand/opposing-orbits.webp" width="48" height="48" alt=""/><span className="brand-word">PONGIT</span></a><span className="lab-badge">INTERLUDE LAB</span><ArcadeAmbience onSound={quiet}/><a href="/docs" target="_blank" rel="noreferrer">Docs ↗</a></header>
  <section className="lab-intro"><div><p className="eyebrow">CLASSIC · FRIENDLY · MONAD TESTNET</p><h1>Same rivals. Faster rallies.</h1><p>A dedicated Interlude engine runs this experimental arena. Results commit back to Monad.</p></div><a className="lab-main-link" href="/" target="_blank" rel="noreferrer">Main arcade, rankings & betting ↗</a></section>
  <div className="lab-status" role="status"><span className={online?"dot":""}/>{online?"Engine online":"Engine unavailable"}{latency>0&&<span>{latency} ms last engine call</span>}<span>Classic friendly only</span></div>
  <section className="lab-account"><div>{account?<><strong>{short(account)}</strong><small title={account}>{account}</small>{sessionReady&&expires&&<small>Lab session until {expires.toLocaleTimeString()}</small>}</>:<p>Watch without connecting. Use your existing Mera passkey to play.</p>}</div><div className="lab-actions">{!sessionReady?<button className="primary" disabled={!online||connecting} onClick={()=>account?void recover():saved?void login():setShowConnect(true)}>{connecting?"Connecting…":account?"Reconnect lab session":saved?`Continue as ${short(saved)}`:"Connect passkey"}</button>:<button disabled={busy||connecting} onClick={()=>void disconnect()}>Disconnect lab</button>}{account&&!sessionReady&&<button disabled={connecting} onClick={()=>setShowConnect(true)}>Renew / change passkey</button>}</div></section>
  {error&&<p role="alert" className="lab-error">{error}</p>}<p className="lab-notice" role="status">{notice}</p>
  {staleLink&&<p role="status" className="lab-error">This invitation belongs to an older match. You are watching the current arena; it will not be accepted automatically.</p>}
  <section className="court-card lab-court"><div className="court-topline"><span>ARENA {snapshot?.id.toString()||"0"}</span><strong>{snapshot?.phase===2?"IN PLAY":snapshot?.phase===1?"WAITING FOR RIVAL":snapshot?.phase===3?"RESULT ON ENGINE":snapshot?.phase===4?"CANCELLED":"READY"}</strong><span>{side>=0?`YOU / ${side===0?"LEFT":"RIGHT"}`:"SPECTATOR"}</span></div><div className="scoreboard"><div className="player-label"><small>PLAYER 01</small><span>{snapshot&&snapshot.a!==zeroAddress?short(snapshot.a):"Ready?"}</span></div><div className="score"><span>{String(snapshot?.state.scoreA||0).padStart(2,"0")}</span><i>:</i><span>{String(snapshot?.state.scoreB||0).padStart(2,"0")}</span></div><div className="player-label right"><small>PLAYER 02</small><span>{snapshot&&snapshot.b!==zeroAddress?short(snapshot.b):"Bring a rival"}</span></div></div>
   <Court state={snapshot?.state||null} clock={snapshot?.clock||0n} observedAt={snapshot?.observedAt||0} direction={direction} side={side} replay={snapshot?.phase!==2} matchId={`interlude:${labManifest.app}:${snapshot?.id||0}`} controllable={!!playable} pending={!!lane.current?.busy} confirmedNonce={side===0?snapshot?.nonceA:snapshot?.nonceB} onStats={(f)=>setFps(f)}/>
   <div className="court-footer"><span>FIRST TO 07</span><span>LIVE ENGINE STATE</span><span>{fps} FPS</span></div>
   {snapshot?.phase===2&&side>=0&&<div className="controls"><span>W / S or ↑ / ↓ to move</span><div className="touch-controls">{([-1,1] as const).map(d=><IconButton key={d} icon={d===-1?"up":"down"} aria-label={d===-1?"Move up":"Move down"} disabled={!playable} onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);setIntent(d);}} onPointerUp={()=>setIntent(0)} onPointerCancel={()=>setIntent(0)} onLostPointerCapture={()=>setIntent(0)}/>)}</div></div>}
  </section>
  <section className="lab-panel"><h2>{snapshot?.phase===3?side<0?"Match complete":snapshot.winner.toLowerCase()===account?.toLowerCase()?"VICTORY":"DEFEAT":snapshot?.phase===1?"Your rival is up next.":snapshot?.phase===2?"Keep the rally alive.":"Bring a rival."}</h2>
   {snapshot?.phase===3&&<p>Winner: {short(snapshot.winner)}. No ELO or MON prize is awarded in the lab.</p>}
   {snapshot?.phase===1&&<p>{snapshot.target===zeroAddress?"Open invitation. The first other account to accept takes player two.":`Reserved for ${short(snapshot.target)}.`} Expires {new Date(Number(snapshot.deadline)*1000).toLocaleTimeString()}.</p>}
   <div className="lab-actions">{snapshot&&![1,2].includes(snapshot.phase)&&sessionReady&&<><label>Rival address (optional)<input value={target} placeholder="0x… or leave empty for an open invitation" onChange={e=>setTarget(e.target.value)} autoComplete="off"/></label><button className="primary" disabled={busy||!!target&&!isAddress(target)||target.toLowerCase()===account?.toLowerCase()} onClick={()=>void action("createMatch",[target||zeroAddress,toHex(crypto.getRandomValues(new Uint8Array(32)))])}>Create friendly match</button></>}
   {snapshot?.phase===1&&<><button onClick={()=>{void navigator.clipboard.writeText(`${location.origin}/labs/interlude?match=${snapshot.id}`).then(()=>setNotice("Invitation link copied."),()=>setError("Copy the page address to share this invitation."));}}>Copy invitation</button>{canJoin&&<button className="primary" disabled={!sessionReady||busy||!online} onClick={()=>void action("acceptMatch",[snapshot.id])}>Accept & play</button>}{(side===0||Date.now()/1000>Number(snapshot.deadline))&&<button disabled={!sessionReady||busy} onClick={()=>void action("cancelMatch",[snapshot.id])}>Cancel invitation</button>}</>}
   {snapshot?.phase===2&&side>=0&&<button disabled={!sessionReady||busy} onClick={()=>void action("concede",[snapshot.id])}>Concede</button>}</div>
  </section>
  <section className="lab-panel lab-commit"><h2>Live here. Committed on Monad.</h2><p role="status">{baseError?"Monad read unavailable. Commitment has not been verified.":matchedHash?"Result hash matches the value committed on Monad.":snapshot&&snapshot.phase>=3?"Waiting for this result to be committed on Monad…":`Latest Monad snapshot: match ${committed?.id||0}, ${committed?.state.scoreA||0} : ${committed?.state.scoreB||0}.`}</p><p>An engine receipt is not a Monad transaction confirmation. Committed batches remain subject to Interlude's challenge window. This lab has no financial settlement.</p><details><summary>Deployment details</summary><p>Game: <a href={`https://testnet.monadscan.com/address/${labManifest.app}`} target="_blank" rel="noreferrer">{labManifest.app}</a></p><p>Engine: <a href={labManifest.node} target="_blank" rel="noreferrer">Dedicated Interlude node ↗</a></p><p>Session keys authorize game calls for 30 minutes. Wallet keys remain in memory and are closed after signing. Reloading this tab restores an unexpired lab grant. Do not share this tab with untrusted scripts.</p></details></section>
  <footer><MusicCredit/><a href="/" target="_blank" rel="noreferrer">Back to the main arcade ↗</a></footer>
  {showConnect&&<Dialog label="Connect to Interlude lab" onClose={()=>{if(!connecting)setShowConnect(false);}}><IconButton className="modal-close" aria-label="Close lab connection" disabled={connecting} onClick={()=>setShowConnect(false)}/><p className="eyebrow">YOUR EXISTING PONGIT IDENTITY</p><h2>Join the fast lane.</h2><p>Approve a separate, scoped game session for this contract. No funds, bets or wallet permissions are included.</p><button className="primary" disabled={connecting||!online} onClick={()=>void login()}>{saved?`Continue as ${short(saved)}`:"Use a passkey"}</button><button disabled={connecting||!online} onClick={()=>void login(false,true)}>Use another passkey</button><button disabled={connecting||!online} onClick={()=>void login(true)}>Create a passkey</button>{error&&<p role="alert">{error}</p>}</Dialog>}
 </main>;
}
