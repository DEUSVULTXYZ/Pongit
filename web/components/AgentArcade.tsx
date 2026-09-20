'use client';
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {createWalletClient,http,isAddress,type Address} from 'viem';
import {monadTestnet} from 'viem/chains';
import {webStorageStore,decodeSession,storageKey} from '@interludelayer-sdk/sdk';
import {createAgentClient,type AgentClient} from '../../shared/agent-client';
import {agentMatchKey,houseBots,type AgentManifest,type AgentMode,type AgentProfile} from '../../shared/agents';
import {agentArcadeAbi} from '../../shared/abi-PongAgentArcade';
import type {EngineState} from '../../shared/engine-stream';
import {engineReadRetryMs} from '../../shared/engine-read';
import {connect,rememberedAccount} from '../lib/wallet';
import {API,short} from '../lib/api';
import {arcadeAudio} from '../lib/audio';
import {eventHud} from '../lib/chaos-presentation';
import {ArcadeAmbience,MusicCredit} from './ArcadeAmbience';
import {Avatar} from './Avatar';
import {Court} from './Court';
import {ChaosEffectsHud} from './ChaosEffectsHud';
import {Outcome} from './Outcome';
import {Dialog} from './Dialog';
import {IconButton} from './IconButton';
import {EngineCredit} from './EngineCredit';
import {AgentReplay} from './AgentReplay';

const quiet=()=>{};
export function AgentArcade({enabled,initialMode,initialView,initialAgent,initialMatch}:{enabled:boolean;initialMode:AgentMode;initialView:'play'|'watch';initialAgent?:string;initialMatch?:{id:string;app:string;epoch:string}}){
 const [mode,setMode]=useState(initialMode),[view,setView]=useState(initialView),[profiles,setProfiles]=useState<AgentProfile[]>([]),[live,setLive]=useState<any[]>([]);
 const [config,setConfig]=useState<AgentManifest|null>(null),[selected,setSelected]=useState(initialAgent||''),[account,setAccount]=useState<Address>(),[ready,setReady]=useState(false),[busy,setBusy]=useState(false);
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[panel,setPanel]=useState<'connect'|'account'|'rankings'|'history'|null>(null),[ranking,setRanking]=useState<any[]>([]),[history,setHistory]=useState<any[]>([]),[replay,setReplay]=useState<any>(null);
 const [match,setMatch]=useState<any>(null),[watchId,setWatchId]=useState(initialMatch?.id),[snapshot,setSnapshot]=useState<EngineState|null>(null),[request,setRequest]=useState<any>(null),[direction,setDirection]=useState<-1|0|1>(0),[pending,setPending]=useState(false),[now,setNow]=useState(0);
 const client=useRef<AgentClient|null>(null),release=useRef<(()=>void)|null>(null),intent=useRef<(()=>Promise<void>)|null>(null),busyRef=useRef(false),alive=useRef(true),operation=useRef<{key:string;id:string}|undefined>(undefined),control=useRef({allowed:false,id:0n});
 const autoWatch=useRef(initialView==='watch'&&!initialMatch);
 const resumedControl=useRef<string|undefined>(undefined);
 const dismissedMatches=useRef(new Set<string>());
 const [resultKey,setResultKey]=useState(0);
 const lockOwner=useRef<string|undefined>(undefined);
 const accountKey=(m:AgentManifest)=>`pongit:agents:${m.app}:account`;
 const profile=(p:string)=>profiles.find(x=>x.agent.toLowerCase()===p.toLowerCase());
 const name=(p:string)=>profile(p)?.name||short(p);
 const id=match?.id||watchId;
 const side=snapshot&&account?snapshot.a.toLowerCase()===account.toLowerCase()?0:snapshot.b.toLowerCase()===account.toLowerCase()?1:-1:-1;
 const playing=snapshot?.phase===2,controllable=!!playing&&side>=0&&ready&&!panel;
 control.current={allowed:controllable,id:BigInt(id||0)};
 async function api(path:string,body?:unknown){if(!client.current)throw Error('Agent Arcade is connecting');return client.current.api(path,body);}
 async function run(fn:()=>Promise<void>){if(busyRef.current)return;busyRef.current=true;setBusy(true);setError('');try{await fn();}catch(e){if(alive.current)setError((e as Error).message);}finally{busyRef.current=false;if(alive.current)setBusy(false);}}
 async function lock(player:Address){
  if(release.current&&lockOwner.current===player.toLowerCase())return;
  if(release.current){release.current();release.current=null;}
  if(!navigator.locks)throw Error('Use a browser with arcade session protection');
  release.current=await new Promise<()=>void>((resolve,reject)=>{
   void navigator.locks.request(`pongit:rooms:${client.current!.manifest.app}:${player.toLowerCase()}`,{ifAvailable:true},async token=>{
    if(!token){reject(Error('This account is already playing in another tab'));return;}lockOwner.current=player.toLowerCase();await new Promise<void>(done=>resolve(done));
   }).catch(reject);
  });
 }
 async function resume(player:Address){await lock(player);await client.current!.resume(player);setAccount(player);setReady(true);await refreshMe();}
 async function refreshMe(){const result=await api('/me');if(!alive.current)return;
  setRequest(result.request??null);
  // Keep a finished match visible while its result modal is open. The server
  // may already have released the player's occupancy for their next duel.
  if(result.match&&!dismissedMatches.current.has(String(result.match.id)))setMatch(result.match);
 }
 useEffect(()=>{
  alive.current=true;if(!enabled)return;let cancelled=false;
  void(async()=>{
   const response=await fetch(`${API}/agents/config`,{signal:AbortSignal.timeout(12000)});if(!response.ok)throw Error('Agent Arcade is temporarily unavailable');const m=await response.json() as AgentManifest;
   if(!m.enabled||!m.qualified)throw Error('Agent Arcade qualification is still in progress');
   if(initialMatch&&(initialMatch.app.toLowerCase()!==m.app.toLowerCase()||initialMatch.epoch!==m.epoch))throw Error('This link belongs to an archived agent arena. It cannot join a different match.');
   if(cancelled)return;client.current=createAgentClient({manifest:m,abi:agentArcadeAbi,apiUrl:`${API}/agents`,store:webStorageStore(sessionStorage),commandStore:sessionStorage});setConfig(m);
   const result=await client.current.api('/catalog');if(cancelled)return;setProfiles(result.agents);
   const saved=sessionStorage.getItem(accountKey(m));if(saved&&isAddress(saved)){setAccount(saved);const grant=decodeSession(sessionStorage.getItem(storageKey(m.app,10143,saved)));
    if(grant&&grant.grant.expiry>BigInt(Math.floor(Date.now()/1000)))try{await resume(saved);}catch(e){setError((e as Error).message);}
   }
  })().catch(e=>{if(!cancelled)setError(e.message);});
  return()=>{cancelled=true;alive.current=false;client.current?.stop();release.current?.();release.current=null;};
 },[enabled]);
 useEffect(()=>{
  if(!config)return;let done=false,timer:ReturnType<typeof setTimeout>,lastPublic=0,lastHeartbeat=0;
  const poll=async()=>{let delay=2000;try{
   if(Date.now()-lastPublic>=10000){lastPublic=Date.now();const [catalog,live]=await Promise.all([api('/catalog'),api('/live')]);if(!done){setProfiles(catalog.agents);setLive(live.matches);}}
   if(ready){if(Date.now()-lastHeartbeat>=10000){lastHeartbeat=Date.now();await api('/heartbeat',{});}await refreshMe();}
  }catch(e){delay=Math.max(2000,engineReadRetryMs(e));if(!done){setNotice((e as Error).message);if(['AGENT_SESSION_EXPIRED','AGENT_SESSION_REVOKED'].includes((e as any).code))setReady(false);}}finally{if(!done)timer=setTimeout(poll,delay);}};void poll();
  return()=>{done=true;clearTimeout(timer);};
 },[config,ready]);
 useEffect(()=>{if(!config||id||view!=='watch'||!autoWatch.current)return;const game=live.find(g=>g.mode===mode&&g.status==='active');if(game){autoWatch.current=false;watch(game);}},[config,id,view,mode,live]);
 useEffect(()=>{
  if(!config||!id||!client.current)return;let done=false,timer:ReturnType<typeof setTimeout>;setSnapshot(null);
  const c=client.current,stop=c.watch(BigInt(id),s=>{if(!done)setSnapshot(s);});
  const read=async()=>{let delay=300;try{const s=await c.read(BigInt(id));if(!done){setSnapshot(s);setNotice('');}if(s.phase===2&&ready)await c.tickIfNeeded(BigInt(id),performance.now());}
   catch(e){delay=Math.max(1000,engineReadRetryMs(e));if(!done)setNotice((e as Error).message);try{if(ready)await c.recover();}catch{}}
   finally{if(!done)timer=setTimeout(read,delay);}};void read();
  return()=>{done=true;clearTimeout(timer);stop();};
 },[id,config,ready]);
 useEffect(()=>{
  if(!ready||!config||!snapshot||snapshot.phase!==2||side<0)return;
  const key=`${config.app}:${config.epoch}:${snapshot.id}:${account}`;if(resumedControl.current===key)return;resumedControl.current=key;
  setDirection(0);void client.current!.move(snapshot.id,0).catch(e=>setNotice(e.message));
 },[ready,config,snapshot?.id,snapshot?.phase,side,account]);
 useEffect(()=>{const t=setInterval(()=>setNow(performance.now()),100);return()=>clearInterval(t);},[]);
 async function move(dir:-1|0|1){
  const current=control.current;if(!current.id||!client.current||(!current.allowed&&dir!==0))return;setDirection(dir);setPending(true);
  try{await client.current.move(current.id,dir);}catch(e){setNotice((e as Error).message);try{await client.current.recover();await client.current.move(current.id,dir);}catch{}}
  finally{if(alive.current)setPending(false);}
 }
 useEffect(()=>{
  const keys=new Set<string>();const key=(e:KeyboardEvent)=>{
   if(!control.current.allowed||!(e.code==='ArrowUp'||e.code==='ArrowDown'||e.code==='KeyW'||e.code==='KeyS')||(e.target as HTMLElement)?.closest('input,textarea,select,[contenteditable=true],[role=dialog]'))return;
   e.preventDefault();if(e.type==='keydown')keys.add(e.code);else keys.delete(e.code);
   const up=keys.has('ArrowUp')||keys.has('KeyW'),down=keys.has('ArrowDown')||keys.has('KeyS');void move(up===down?0:up?-1:1);
  };
  const stop=()=>{keys.clear();void move(0);};window.addEventListener('keydown',key);window.addEventListener('keyup',key);window.addEventListener('blur',stop);
  return()=>{window.removeEventListener('keydown',key);window.removeEventListener('keyup',key);window.removeEventListener('blur',stop);};
 },[]);
 useEffect(()=>{if(panel)void move(0);},[panel]);
 useEffect(()=>{arcadeAudio.setGameplay(!!playing);return()=>arcadeAudio.setGameplay(false);},[playing]);
 async function login(create=false){await run(async()=>{
  if(!client.current||!config)throw Error('Agent Arcade is unavailable');let identity;
  try{identity=await connect(create);await lock(identity.account.address);await client.current.connect(createWalletClient({account:identity.account,chain:monadTestnet,transport:http()}));
   sessionStorage.setItem(accountKey(config),identity.account.address);setAccount(identity.account.address);setReady(true);setPanel(null);await refreshMe();
   const action=intent.current;intent.current=null;if(action)await action();
  }finally{identity?.end();}
 });}
 async function ensure(fn:()=>Promise<void>){if(ready){await run(async()=>{
  const current=await api('/config') as AgentManifest;
  if(config&&current.epoch!==config.epoch){
   if(current.app!==config.app||current.node!==config.node||current.hub!==config.hub)throw Error('This new arena requires a separate authorization');
   client.current?.stop();client.current=createAgentClient({manifest:current,abi:agentArcadeAbi,apiUrl:`${API}/agents`,store:webStorageStore(sessionStorage),commandStore:sessionStorage});
   await client.current.resume(account!);setConfig(current);setSnapshot(null);setMatch(null);setWatchId(undefined);
  }
  await fn();
 });return;}intent.current=fn;setPanel('connect');}
 async function challenge(p:Address){
  const key=`${p.toLowerCase()}:${mode}`;if(operation.current?.key!==key)operation.current={key,id:crypto.randomUUID()};const r=await api('/challenges',{agent:p,mode,operation:operation.current.id});if(id&&snapshot&&snapshot.phase>=3)dismissedMatches.current.add(String(id));setRequest(r);setMatch(null);setWatchId(undefined);setSnapshot(null);setNotice('Challenge reserved. Your agent will finish its current match first.');operation.current=undefined;
 }
 function select(p:AgentProfile){setSelected(p.agent);historyReplace({agent:p.agent,mode:String(mode)});void ensure(()=>challenge(p.agent));}
 function historyReplace(values:Record<string,string>){window.history.replaceState(null,'',`/agents?${new URLSearchParams(values)}`);}
 function watch(game:any){if(!config)return;setMode(game.mode);setView('watch');setWatchId(game.id);setMatch(null);historyReplace({match:game.id,app:config.app,epoch:config.epoch,view:'watch',mode:String(game.mode)});}
 async function copy(){if(!config||!id)return;try{await navigator.clipboard.writeText(`${location.origin}/agents?${new URLSearchParams({match:String(id),app:config.app,epoch:config.epoch,view:'watch',mode:String(snapshot?.state.mode??mode)})}`);setNotice('Match link copied');}catch{setNotice('Copy failed. Copy this page address instead.');}}
 const elapsed=snapshot?Math.min(300,Number(snapshot.state.t)/1e6+(!playing?0:Math.min(.6,Math.max(0,(Date.now()-snapshot.observedAt)/1000)))):0;
 const seconds=Math.max(0,Math.ceil(300-elapsed));void now;
 const outcome=snapshot?{playerA:snapshot.a,playerB:snapshot.b,winner:snapshot.winner,status:snapshot.phase,state:snapshot.state,ranked:false,mode:snapshot.state.mode,draw:snapshot.phase===3&&BigInt(snapshot.winner)===0n}:null;
 const opponent=snapshot&&side>=0?profile(side===0?snapshot.b:snapshot.a):undefined;
 return <main className={`cabinet-ui rooms-shell agents-shell ${playing?'rooms-playing':''}`}>
  <header className="rooms-header"><Link href="/" className="brand" aria-label="PONGIT home"><img className="brand-mark" src="/brand/opposing-orbits.webp" width="40" height="40" alt=""/><span className="brand-word">PONGIT</span></Link>
   <div className="rooms-header-actions"><ArcadeAmbience onSound={quiet}/><a href="/docs" target="_blank" rel="noreferrer">Docs ↗</a><button disabled={!config} onClick={()=>void run(async()=>{const r=await api(`/rankings?mode=${mode}`);setRanking(r.entries);setPanel('rankings');})}>Agent ranking</button><button disabled={busy||!config} onClick={()=>setPanel(ready?'account':'connect')}>{account?ready?short(account):'Renew session':'Connect'}</button></div>
  </header>
  {(error||notice)&&<div className="rooms-notice" role={error?'alert':'status'}>{error||notice}</div>}
  {!enabled?<section className="agent-empty"><h1>Agent Arcade</h1><p>The dedicated arena is being qualified. Public agent matches are not open yet.</p><Link className="rooms-button" href="/">Back to arcade</Link></section>:<>
  {!id&&<><div className="agent-heading"><div><h1>Agent Arcade</h1><p>House bots. Community rivals. One more game.</p></div><div className="control-segments" role="group" aria-label="Agent game mode"><button aria-pressed={mode===0} onClick={()=>setMode(0)}>Classic</button><button aria-pressed={mode===1} onClick={()=>setMode(1)}>Chaos</button></div></div>
   <nav className="agent-tabs" aria-label="Agent Arcade"><button aria-pressed={view==='play'} onClick={()=>setView('play')}>Play an agent</button><button aria-pressed={view==='watch'} onClick={()=>setView('watch')}>Watch agents</button><Link href="/">Play a person ↗</Link></nav>
   <p>First to seven · Five-minute limit · No bets or prizes</p></>}
  {request&&['waiting','offered'].includes(request.status)&&!id&&<section className="agent-wait"><h2>Your next duel</h2><p>{name(request.agent)} · {mode===1?'Chaos':'Classic'}</p><p>Waiting for an available arena</p><button disabled={busy} onClick={()=>void run(async()=>{await api('/challenges/cancel',{id:request.id});setRequest(null);})}>Cancel challenge</button></section>}
  {!id&&view==='play'&&<div className="agent-grid">{profiles.filter(p=>p.modes.includes(mode)).map(p=><article className="agent-card" data-selected={selected.toLowerCase()===p.agent.toLowerCase()} key={p.agent}>
   <span className="agent-badge">{p.kind==='pongit'?'PONGIT BOT':p.kind==='strategy'?'ON-CHAIN STRATEGY':'COMMUNITY AGENT'}</span><div className="agent-identity"><Avatar index={p.avatar}/><div><h2>{p.name}</h2><p>{p.kind==='pongit'?houseBots.find(b=>b.name===p.name)?.difficulty:p.kind==='strategy'?'Plays from its own contract':'Community rival'}</p></div></div>
   <span className="agent-creator">Created by <a href={`https://testnet.monadexplorer.com/address/${p.creator}`} target="_blank" rel="noreferrer">{short(p.creator)}</a></span><span className="agent-status" data-online={p.available}>{p.qualification[mode]!=='qualified'?'Qualifying':!p.available?'Offline':p.playing?'Playing · next duel available':'Available'}</span>
   <button className="primary" disabled={busy||!p.available||p.qualification[mode]!=='qualified'||!!request&&['waiting','offered','active'].includes(request.status)} onClick={()=>select(p)}>Challenge this agent</button>
  </article>)}</div>}
  {!id&&view==='watch'&&(live.length?<div className="agent-grid">{live.filter(g=>g.mode===mode).map(g=><article className="agent-card" key={g.id}><span className="agent-badge">{g.status==='active'?'LIVE MATCH':'RESULT PUBLICATION'}</span><h2>{name(g.a)}<br/>vs {name(g.b)}</h2><p>{g.mode===1?'Chaos':'Classic'} · {g.ranked?'Agent ranked':'Friendly'}</p><button onClick={()=>watch(g)}>Watch match</button></article>)}</div>:<section className="agent-empty"><h2>No live agent match</h2><p>The arena will show a real match when the service is available.</p></section>)}
  {id&&<><div className="agent-toolbar"><Link href="/agents">Agent Arcade</Link><span>{snapshot?.state.mode===1?'Chaos':'Classic'} · {side>=0?'Friendly match':'Agent match'}</span><button onClick={()=>void copy()}>Copy match link</button>{snapshot&&snapshot.phase>=3&&<button onClick={()=>setResultKey(x=>x+1)}>View result</button>}{side>=0&&playing&&<button disabled={busy} onClick={()=>void run(async()=>{await client.current!.send('concede',[BigInt(id)]);})}>Concede</button>}</div>
   {match?.offer&&snapshot?.phase!==2&&snapshot?.phase!==3&&snapshot?.phase!==4&&<section className="agent-wait"><h2>{name(match.a)} vs {name(match.b)}</h2><div className="rooms-button-row"><button className="primary" disabled={busy||!ready} onClick={()=>void run(async()=>{await client.current!.accept(match.offer);await refreshMe();})}>Accept</button><button disabled={busy} onClick={()=>void run(async()=>{const s=await client.current!.read(BigInt(id),true);if(s.phase===1)await client.current!.send('cancelMatch',[BigInt(id)]);else if(s.phase===2)throw Error('This match has started. Use Concede to leave.');setMatch(null);setWatchId(undefined);})}>Back</button></div></section>}
   {snapshot&&snapshot.phase>=2&&<section className="agent-court"><div className="agent-scoreboard"><div><div className="agent-score-name"><Avatar index={profile(snapshot.a)?.avatar}/><span>{name(snapshot.a)}</span></div></div><div><div className="agent-clock">{Math.floor(seconds/60)}:{String(seconds%60).padStart(2,'0')}</div><div className="agent-score"><b>{snapshot.state.scoreA}</b><small>:</small><b>{snapshot.state.scoreB}</b></div></div><div><div className="agent-score-name"><Avatar index={profile(snapshot.b)?.avatar}/><span>{name(snapshot.b)}</span></div></div></div>
    {snapshot.chaos&&<ChaosEffectsHud effects={eventHud(snapshot.chaos.physics)} gameMs={Number(snapshot.state.t)/1000} players={[name(snapshot.a),name(snapshot.b)]}/>}
    <Court state={snapshot.state} chaos={snapshot.chaos} rulesVersion={config?.rulesVersion} clock={snapshot.clock>300000000n?300000000n:snapshot.clock} observedAt={snapshot.observedAt} direction={direction} side={side} replay={false} matchId={config?agentMatchKey({...config,id:String(id),epoch:config.epoch}):String(id)} controllable={controllable} pending={pending} confirmedNonce={side===0?snapshot.nonceA:snapshot.nonceB} liveEngine onStats={quiet}/>
    {side>=0&&<div className="agent-controls"><small>W / S · ↑ / ↓</small><div>{([-1,1] as const).map(dir=><button aria-label={dir===-1?'Move up':'Move down'} disabled={!controllable} key={dir} onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);void move(dir);}} onPointerUp={()=>void move(0)} onPointerCancel={()=>void move(0)} onLostPointerCapture={()=>void move(0)}>{dir===-1?'↑':'↓'}</button>)}</div></div>}
   </section>}
   {side<0&&snapshot&&<div className="agent-match-actions">{[snapshot.a,snapshot.b].map(p=>{const agent=profile(p);return agent?<button key={p} disabled={busy||!agent.available||agent.qualification[mode]!=='qualified'} onClick={()=>select(agent)}>Challenge {agent.name}</button>:null;})}<button onClick={()=>void run(async()=>{const r=await api(`/history?player=${snapshot.a}`);setHistory(r.matches);setPanel('history');})}>Recent matches</button></div>}
  </>}
  </>}
  {!playing&&<footer className="rooms-footer"><MusicCredit/><EngineCredit/></footer>}
  {panel==='connect'&&<Dialog label="Authorize Agent Arcade" onClose={()=>{intent.current=null;setPanel(null);}}><IconButton className="modal-close" aria-label="Close connection" onClick={()=>{intent.current=null;setPanel(null);}}/><h2>Authorize Agent Arcade</h2><p>Use your Mera passkey to authorize this separate arena for two hours. Your address stays the same. This session cannot spend funds.</p><button className="primary" disabled={busy} onClick={()=>void login(false)}>{busy?'Connecting…':rememberedAccount()?`Continue as ${short(rememberedAccount()!.address)}`:'Use a passkey'}</button><button disabled={busy} onClick={()=>void login(true)}>Create a passkey</button>{error&&<p role="alert">{error}</p>}</Dialog>}
  {panel==='account'&&<Dialog label="Agent Arcade account" onClose={()=>setPanel(null)}><IconButton className="modal-close" aria-label="Close account" onClick={()=>setPanel(null)}/><h2>Your arcade session</h2><p>{account}</p><button onClick={()=>void navigator.clipboard.writeText(account!).then(()=>setNotice('Address copied')).catch(()=>setNotice('Copy failed'))}>Copy address</button><p>Human-agent challenges are friendly. Your human ELO and balances are unchanged.</p><button disabled={busy||!!playing} onClick={()=>void run(async()=>{const result=await client.current!.disconnect();if(config)sessionStorage.removeItem(accountKey(config));release.current?.();release.current=null;setAccount(undefined);setReady(false);setPanel(null);setNotice(result.revocationPending?'Disconnected. Onchain revocation remains pending.':'Disconnected from Agent Arcade');})}>Disconnect Agent Arcade</button></Dialog>}
  {panel==='rankings'&&<Dialog label="Agent ranking" onClose={()=>setPanel(null)}><IconButton className="modal-close" aria-label="Close ranking" onClick={()=>setPanel(null)}/><h2>{mode===1?'Chaos':'Classic'} agent ranking</h2><p>Live ratings and their published Monad copy. Publications may still be challenged.</p><table><thead><tr><th>Agent</th><th>Live ELO</th><th>Published</th></tr></thead><tbody>{ranking.map(r=><tr key={r.agent}><td>{r.name}</td><td>{r.live?.elo??'Unavailable'}</td><td>{r.published?.elo??'Unavailable'}</td></tr>)}</tbody></table>{!ranking.length&&<p>No qualified agents yet.</p>}</Dialog>}
  {panel==='history'&&<Dialog label="Recent agent matches" onClose={()=>{setPanel(null);setReplay(null);}}><IconButton className="modal-close" aria-label="Close history" onClick={()=>{setPanel(null);setReplay(null);}}/><h2>Recent matches</h2><ul className="agent-results-list">{history.map(h=><li key={h.id}><span>{name(h.a)} vs {name(h.b)}</span><strong>{h.result?.scoreA} : {h.result?.scoreB}</strong>{h.replayAvailable?<button onClick={()=>setReplay(h.ref)}>Watch replay</button>:<span>Summary retained</span>}</li>)}</ul>{replay&&<AgentReplay reference={replay}/>}</Dialog>}
  <Outcome id={id&&config?agentMatchKey({...config,id:String(id),epoch:config.epoch}):null} match={outcome} account={account||''} rating={null} sound={arcadeAudio.settings.enabled} replay={false} confirmation="engine" showResultKey={resultKey} rematch={async()=>{if(opponent)await ensure(()=>challenge(opponent.agent));}} watch={()=>void run(async()=>{const r=await api(`/history?player=${account||snapshot!.a}`);setHistory(r.matches);setReplay(null);setPanel('history');})} again={()=>{if(id)dismissedMatches.current.add(String(id));setMatch(null);setWatchId(undefined);setSnapshot(null);setRequest(null);historyReplace({mode:String(mode)});}} againLabel="Choose another agent"/>
 </main>;
}
