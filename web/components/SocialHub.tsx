"use client";
import { useEffect, useRef, useState } from "react";
import { appApi as requestApp, WS, short, type Config } from "../lib/api";
import { arcadeAudio } from "../lib/audio";
import {ProfileEditor} from "./PublicProfile";
import {Avatar} from "./Avatar";
import { Notebook } from "./Notebook";
import type { Identity } from "../lib/wallet";

type Props={ready:boolean;mode:number;account:string;config:Config|null;visible:boolean;target:string;authenticate:()=>Promise<void>;identity:()=>Identity|null;open:()=>void;enter:(c:any)=>void;matchRef?:string;atUs?:string;applyPreferences:(settings:{preferredMode:number;sound:boolean})=>void};
export function SocialHub(p:Props) {
  const appApi=(path:string,method="GET",body?:unknown)=>requestApp(path,method,body,p.account);
  const [authenticated,setAuthenticated]=useState(false),[profile,setProfile]=useState<any>(null),[people,setPeople]=useState<any[]>([]),[inbox,setInbox]=useState<any[]>([]),[blocked,setBlocked]=useState<string[]>([]);
  const [profileRevision,setProfileRevision]=useState(0),[search,setSearch]=useState(""),[target,setTarget]=useState(""),[mode,setMode]=useState(0),[ranked,setRanked]=useState(false),[link,setLink]=useState(""),[message,setMessage]=useState(""),[busy,setBusy]=useState(false),[linked,setLinked]=useState<any>(null);
  const locked=useRef(false),generation=useRef(0),entered=useRef(new Set<string>());
  useEffect(()=>{generation.current++;setAuthenticated(false);setInbox([]);setBlocked([]);setProfile(null);setLinked(null);setMessage("");},[p.account]);
  useEffect(()=>setMode(p.mode),[p.mode]);
  useEffect(()=>{const changed=()=>{setProfileRevision(n=>n+1);setProfile(null);};window.addEventListener("pongit:profile",changed);return()=>window.removeEventListener("pongit:profile",changed);},[]);
  useEffect(()=>{if(p.target)setTarget(p.target);},[p.target]);
  async function auth(){await p.authenticate();setAuthenticated(true);}
  async function refresh(){const g=generation.current;const [a,b]=await Promise.all([appApi("/challenges"),appApi("/blocks")]);if(g===generation.current){setInbox(a.challenges.filter((c:any)=>!b.blocked.includes(c.creator)));setBlocked(b.blocked);}}
  async function run(fn:()=>Promise<void>){if(locked.current)return;locked.current=true;setBusy(true);setMessage("");try{await fn();}catch(e){setMessage((e as Error).message);}finally{locked.current=false;setBusy(false);}}
  useEffect(()=>{if(!p.ready || !p.account || (p.config?.version||1)<3)return;let stopped=false;const unlock=()=>void p.authenticate().then(()=>{if(!stopped)setAuthenticated(true);}).catch(()=>{});unlock();const timer=setInterval(unlock,5000);return()=>{stopped=true;clearInterval(timer);};},[p.account,p.config?.version,p.ready]);
  useEffect(()=>{if(!authenticated)return;let stop=false,socket:WebSocket|undefined,timer:ReturnType<typeof setTimeout>;
    const refreshInbox=()=>void refresh().catch(()=>{});
    const open=()=>{if(stop)return;socket=new WebSocket(WS);socket.onopen=()=>{socket!.send(JSON.stringify({type:"subscribe-social",player:p.account}));refreshInbox();};socket.onmessage=event=>{try{const m=JSON.parse(event.data);if(m.type==="inbox" && m.player===p.account.toLowerCase())refreshInbox();if(m.type==="social-expired"){setAuthenticated(false);socket?.close();}}catch{}};socket.onclose=()=>{if(!stop)timer=setTimeout(open,2000);};};open();window.addEventListener("pongit:inbox",refreshInbox);return()=>{stop=true;clearTimeout(timer);socket?.close();window.removeEventListener("pongit:inbox",refreshInbox);};
  },[authenticated,p.account]);
  useEffect(()=>{if(!authenticated)return;const timer=setInterval(()=>void refresh().catch(()=>setAuthenticated(false)),5000);void refresh().catch(()=>setAuthenticated(false));return()=>clearInterval(timer);},[authenticated,p.account]);
  useEffect(()=>{if(!p.visible)return;let stop=false;const timer=setTimeout(()=>void appApi(`/profiles?search=${encodeURIComponent(search)}`).then(d=>{if(!stop)setPeople(d.profiles);}).catch(e=>setMessage(e.message)),250);return()=>{stop=true;clearTimeout(timer);};},[search,p.visible,profileRevision]);
  useEffect(()=>{const id=new URL(location.href).searchParams.get("challenge");if(id){setLink(id);p.open();}},[]);
  const incoming=inbox.filter(c=>c.creator!==p.account.toLowerCase() && c.status==="pending");
  useEffect(()=>{for(const c of incoming)arcadeAudio.play("invite",`invite:${c.id}`);},[inbox]);
  const accepted=inbox.filter(c=>c.status==="accepted" && c.room_id && !c.match_id && Number(c.room_expires)>Date.now()/1000);
  useEffect(()=>{const ready=accepted[0];if(ready && !entered.current.has(ready.room_id)){entered.current.add(ready.room_id);p.enter(ready);}},[inbox]);
  async function action(c:any,action:string){await auth();const result=await appApi(`/challenges/${c.id}/${action}`,"POST",{});if(action==="accept"){setLinked(null);entered.current.add(result.room_id);p.enter(result);await refresh();}else await refresh();}
  async function create(open=false){await auth();const c=await appApi("/challenges","POST",{recipient:open?null:target.trim(),mode,ranked});setLink(`${location.origin}/?challenge=${c.id}`);await refresh();setMessage(open?"Open link ready. Share it with a friend; the first acceptance reserves the match.":"Challenge sent. Your opponent receives an Accept / Decline notification.");}
  async function inspect(address:string){const [profile,stats]=await Promise.all([appApi(`/profiles/${address}`),appApi(`/player/${address}`)]);setProfile({...profile,...stats,address});setTarget(address);}
  const invitation=(c:any)=><article className="invitation" key={c.id}><div><span className="eyebrow">{c.mode===1?"CHAOS":"CLASSIC"} · {c.ranked?"RANKED":"FRIENDLY"}</span><p>{short(c.creator)} → {c.recipient?short(c.recipient):"Open challenge"}</p><small>{c.status.toUpperCase()} · expires {new Date(Number(c.expires)*1000).toLocaleTimeString()}</small></div><div className="button-row">
    {c.status==="pending" && (c.creator===p.account.toLowerCase()?<button disabled={!p.ready || busy} onClick={()=>void run(()=>action(c,"cancel"))}>Cancel invitation</button>:<><button disabled={!p.ready || busy} onClick={()=>void run(()=>action(c,"accept"))}>Accept {c.ranked?"ranked":"friendly"}</button>{c.recipient&&<button disabled={!p.ready || busy} onClick={()=>void run(()=>action(c,"decline"))}>Decline</button>}<button disabled={!p.ready || busy} onClick={()=>void run(async()=>{await appApi("/blocks","POST",{player:c.creator});await refresh();})}>Block</button></>)}
    {c.status==="accepted" && !c.match_id && Number(c.room_expires)>Date.now()/1000 && <small>Starting match automatically…</small>}
    {c.job_id && <small>{c.match_id?`Match ${c.match_id}`:"Match creation submitted — awaiting confirmation"}</small>}
    {c.creator===p.account.toLowerCase() && c.status==="pending" && <button onClick={()=>void run(async()=>{await navigator.clipboard.writeText(`${location.origin}/?challenge=${c.id}`);setMessage("Invitation link copied.");})}>Copy link</button>}
  </div></article>;
  return <>{!p.visible && incoming.length>0 && <aside className="duel-notifications" aria-live="polite">{incoming.map(invitation)}{message && <p role="status">{message}</p>}</aside>}
  <div className="social-layout" hidden={!p.visible}>
    <section className="side-card"><p className="eyebrow">PLAYER NETWORK</p><h2>Pick your rival.</h2><p>Pick a player and send an invitation. Friendly by default.</p>
      {!authenticated && <button disabled={!p.ready || busy || !p.account} onClick={()=>void run(auth)}>Unlock invitations & profile</button>}
      <label>Find a public profile<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search a username or address"/></label>
      <div className="profile-results">{people.map(player=><button key={player.player} onClick={()=>void run(()=>inspect(player.player))}><Avatar index={player.avatar}/><span>{player.handle}<small>{short(player.player)}</small></span></button>)}</div>
      {profile && <article className="public-profile"><Avatar index={profile.avatar}/><h3>{profile.handle || "Anonymous player"}</h3><a target="_blank" rel="noreferrer" href={`https://testnet.monadscan.com/address/${profile.address}`}>{profile.address} ↗</a><p>Classic {profile.rating?.elo || 1000} · Chaos {profile.chaosRating?.elo || 1000}</p><p>{profile.rating?.played || 0} Classic games · {profile.chaosRating?.played || 0} Chaos games</p></article>}
      <label>Opponent address<input value={target} onChange={e=>setTarget(e.target.value)} placeholder="Paste a player’s 0x address"/></label>
      <details><summary>Match options · {mode===1?"Chaos":"Classic"} / {ranked?"Ranked":"Friendly"}</summary><div className="split"><label>Mode<select aria-label="Challenge mode" value={mode} onChange={e=>setMode(Number(e.target.value))}><option value="0">Classic</option><option value="1">Chaos</option></select></label><label>Competition<select aria-label="Competition" value={String(ranked)} onChange={e=>setRanked(e.target.value==="true")}><option value="false">Friendly · no ELO</option><option value="true">Ranked · affects ELO</option></select></label></div></details>
      <button className="primary" disabled={!p.ready || busy || !p.account || !/^0x[\da-fA-F]{40}$/.test(target.trim()) || target.toLowerCase()===p.account.toLowerCase()} onClick={()=>void run(()=>create())}>Send challenge ↗</button>
      <details><summary>Shareable links</summary><button disabled={!p.ready || busy || !p.account} onClick={()=>void run(()=>create(true))}>Create open challenge link</button><label>Share or open an invitation<input value={link} onChange={e=>setLink(e.target.value)} placeholder="Challenge link or ID"/></label><div className="split"><button disabled={!p.ready || !link || busy} onClick={()=>void run(async()=>{await navigator.clipboard.writeText(link);setMessage("Link copied.");})}>Copy</button><button disabled={!p.ready || !link || busy} onClick={()=>void run(async()=>{await auth();const id=/^0x[\da-f]{64}$/.test(link)?link:new URL(link).searchParams.get("challenge");setLinked(await appApi(`/challenges/${id}`));})}>Open invitation</button></div>
      </details>{linked && invitation(linked)}
      <h3>Inbox</h3>{inbox.map(invitation)}{authenticated && !inbox.length && <p>No invitations yet.</p>}
      {!!blocked.length && <><h3>Blocked players</h3>{blocked.map(address=><button key={address} onClick={()=>void run(async()=>{await appApi("/blocks","DELETE",{player:address});await refresh();})}>Unblock {short(address)}</button>)}</>}
      {message && <p role="status" className="notice">{message}</p>}
    </section>
    <div><details className="profile-editor"><summary>Your public profile</summary><ProfileEditor account={p.account} ready={p.ready} authenticate={auth}/></details><Notebook disabled={!p.ready} account={p.account} authenticate={auth} identity={p.identity} matchRef={p.matchRef} atUs={p.atUs} applyPreferences={p.applyPreferences}/></div>
  </div></>;
}
