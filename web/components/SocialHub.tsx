"use client";
import { useEffect, useRef, useState } from "react";
import { appApi as requestApp, short, type Config } from "../lib/api";
import { Notebook } from "./Notebook";
import type { Identity } from "../lib/wallet";

export function Avatar({index=0}:{index?:number}) {
  return <svg className="avatar" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="29" fill="#101022" stroke="currentColor"/><g transform={`rotate(${index*30} 32 32)`}><path d="M12 32 32 12 52 32 32 52Z" fill="none" stroke="currentColor" strokeWidth="3"/><path d={index%2?"M20 20 44 44M44 20 20 44":"M19 32H45M32 19V45"} stroke="currentColor" strokeWidth="4"/></g><circle cx="32" cy="32" r={4+index%4} fill="currentColor"/></svg>;
}
type Props={account:string;config:Config|null;visible:boolean;target:string;authenticate:()=>Promise<void>;identity:()=>Identity|null;open:()=>void;enter:(c:any)=>void;matchRef?:string;atUs?:string;applyPreferences:(settings:{preferredMode:number;sound:boolean})=>void};
export function SocialHub(p:Props) {
  const appApi=(path:string,method="GET",body?:unknown)=>requestApp(path,method,body,p.account);
  const [authenticated,setAuthenticated]=useState(false),[profile,setProfile]=useState<any>(null),[people,setPeople]=useState<any[]>([]),[inbox,setInbox]=useState<any[]>([]),[blocked,setBlocked]=useState<string[]>([]);
  const [search,setSearch]=useState(""),[target,setTarget]=useState(""),[mode,setMode]=useState(0),[ranked,setRanked]=useState(false),[handle,setHandle]=useState(""),[avatar,setAvatar]=useState(0),[link,setLink]=useState(""),[message,setMessage]=useState(""),[busy,setBusy]=useState(false),[linked,setLinked]=useState<any>(null);
  const locked=useRef(false),generation=useRef(0);
  useEffect(()=>{generation.current++;setAuthenticated(false);setInbox([]);setBlocked([]);setProfile(null);setLinked(null);setMessage("");setHandle("");},[p.account]);
  useEffect(()=>{if(p.target)setTarget(p.target);},[p.target]);
  async function auth(){await p.authenticate();setAuthenticated(true);}
  async function refresh(){const g=generation.current;const [a,b]=await Promise.all([appApi("/challenges"),appApi("/blocks")]);if(g===generation.current){setInbox(a.challenges.filter((c:any)=>!b.blocked.includes(c.creator)));setBlocked(b.blocked);}}
  async function run(fn:()=>Promise<void>){if(locked.current)return;locked.current=true;setBusy(true);setMessage("");try{await fn();}catch(e){setMessage((e as Error).message);}finally{locked.current=false;setBusy(false);}}
  useEffect(()=>{if(!authenticated)return;const timer=setInterval(()=>void refresh().catch(()=>setAuthenticated(false)),5000);void refresh().catch(()=>setAuthenticated(false));return()=>clearInterval(timer);},[authenticated,p.account]);
  useEffect(()=>{if(!p.visible)return;let stop=false;const timer=setTimeout(()=>void appApi(`/profiles?search=${encodeURIComponent(search)}`).then(d=>{if(!stop)setPeople(d.profiles);}).catch(e=>setMessage(e.message)),250);return()=>{stop=true;clearTimeout(timer);};},[search,p.visible]);
  useEffect(()=>{const id=new URL(location.href).searchParams.get("challenge");if(id){setLink(id);p.open();}},[]);
  const incoming=inbox.filter(c=>c.creator!==p.account.toLowerCase() && c.status==="pending");
  const accepted=inbox.filter(c=>c.status==="accepted" && c.room_id && !c.match_id && Number(c.room_expires)>Date.now()/1000);
  async function action(c:any,action:string){await auth();const result=await appApi(`/challenges/${c.id}/${action}`,"POST",{});if(action==="accept"){setLinked(null);await refresh();p.enter(result);}else await refresh();}
  async function create(){await auth();const c=await appApi("/challenges","POST",{recipient:target.trim()||null,mode,ranked});setLink(`${location.origin}/?challenge=${c.id}`);await refresh();setMessage("Invitation created. It expires in ten minutes. Share the link or wait for your opponent's inbox response.");}
  async function inspect(address:string){const [profile,stats]=await Promise.all([appApi(`/profiles/${address}`),appApi(`/player/${address}`)]);setProfile({...profile,...stats,address});setTarget(address);}
  const invitation=(c:any)=><article className="invitation" key={c.id}><div><span className="eyebrow">{c.mode===1?"CHAOS":"CLASSIC"} · {c.ranked?"RANKED":"FRIENDLY"}</span><p>{short(c.creator)} → {c.recipient?short(c.recipient):"Open challenge"}</p><small>{c.status.toUpperCase()} · expires {new Date(Number(c.expires)*1000).toLocaleTimeString()}</small></div><div className="button-row">
    {c.status==="pending" && (c.creator===p.account.toLowerCase()?<button disabled={busy} onClick={()=>void run(()=>action(c,"cancel"))}>Cancel invitation</button>:<><button disabled={busy} onClick={()=>void run(()=>action(c,"accept"))}>Accept {c.ranked?"ranked":"friendly"}</button>{c.recipient&&<button disabled={busy} onClick={()=>void run(()=>action(c,"decline"))}>Decline</button>}<button disabled={busy} onClick={()=>void run(async()=>{await appApi("/blocks","POST",{player:c.creator});await refresh();})}>Block</button></>)}
    {c.status==="accepted" && !c.match_id && Number(c.room_expires)>Date.now()/1000 && <button disabled={busy} onClick={()=>p.enter(c)}>Enter agreed match ↗</button>}
    {c.job_id && <small>{c.match_id?`Match ${c.match_id}`:"Match creation submitted — awaiting confirmation"}</small>}
    {c.creator===p.account.toLowerCase() && c.status==="pending" && <button onClick={()=>void run(async()=>{await navigator.clipboard.writeText(`${location.origin}/?challenge=${c.id}`);setMessage("Invitation link copied.");})}>Copy link</button>}
  </div></article>;
  return <>{!p.visible && (incoming.length>0 || accepted.length>0) && <button className="inbox-banner" onClick={p.open}>{incoming.length} incoming invitation(s) · {accepted.length} ready match(es) — open inbox ↗</button>}
  <div className="social-layout" hidden={!p.visible}>
    <section className="side-card"><p className="eyebrow">PLAYER NETWORK</p><h2>Pick your rival.</h2><p>Friendly by default. Every match starts with two signed agreements.</p>
      {!authenticated && <button disabled={busy || !p.account} onClick={()=>void run(auth)}>Unlock invitations & profile</button>}
      <label>Find a public profile<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Nickname or address"/></label>
      <div className="profile-results">{people.map(player=><button key={player.player} onClick={()=>void run(()=>inspect(player.player))}><Avatar index={player.avatar}/><span>{player.handle}<small>{short(player.player)}</small></span></button>)}</div>
      {profile && <article className="public-profile"><Avatar index={profile.avatar}/><h3>{profile.handle || "Anonymous player"}</h3><a target="_blank" rel="noreferrer" href={`https://testnet.monadscan.com/address/${profile.address}`}>{profile.address} ↗</a><p>Classic {profile.rating?.elo || 1000} · Chaos {profile.chaosRating?.elo || 1000}</p><p>{profile.rating?.played || 0} Classic games · {profile.chaosRating?.played || 0} Chaos games</p></article>}
      <label>Opponent address (optional)<input value={target} onChange={e=>setTarget(e.target.value)} placeholder="Leave blank for a first-come open link"/></label>
      <div className="split"><label>Mode<select aria-label="Challenge mode" value={mode} onChange={e=>setMode(Number(e.target.value))}><option value="0">Classic</option><option value="1">Chaos</option></select></label><label>Competition<select aria-label="Competition" value={String(ranked)} onChange={e=>setRanked(e.target.value==="true")}><option value="false">Friendly · no ELO</option><option value="true">Ranked · affects ELO</option></select></label></div>
      <button className="primary" disabled={busy || !p.account || !!target&&!/^0x[\da-fA-F]{40}$/.test(target)} onClick={()=>void run(create)}>Create ten-minute challenge ↗</button>
      <label>Share or open an invitation<input value={link} onChange={e=>setLink(e.target.value)} placeholder="Challenge link or ID"/></label><div className="split"><button disabled={!link || busy} onClick={()=>void run(async()=>{await navigator.clipboard.writeText(link);setMessage("Link copied.");})}>Copy</button><button disabled={!link || busy} onClick={()=>void run(async()=>{await auth();const id=/^0x[\da-f]{64}$/.test(link)?link:new URL(link).searchParams.get("challenge");setLinked(await appApi(`/challenges/${id}`));})}>Open invitation</button></div>
      {linked && invitation(linked)}
      <h3>Inbox</h3>{inbox.map(invitation)}{authenticated && !inbox.length && <p>No invitations yet.</p>}
      {!!blocked.length && <><h3>Blocked players</h3>{blocked.map(address=><button key={address} onClick={()=>void run(async()=>{await appApi("/blocks","DELETE",{player:address});await refresh();})}>Unblock {short(address)}</button>)}</>}
      {message && <p role="status" className="notice">{message}</p>}
    </section>
    <div><section className="side-card"><p className="eyebrow">OPTIONAL PUBLIC PROFILE</p><h2>Make a name.</h2><p>Without a profile, only your address and onchain stats are public.</p><label>Unique nickname<input maxLength={20} value={handle} onChange={e=>setHandle(e.target.value.toLowerCase())} placeholder="3–20 characters, starting with a letter"/></label><div className="avatar-grid">{Array.from({length:12},(_,i)=><button key={i} aria-label={`Avatar ${i+1}`} aria-pressed={avatar===i} onClick={()=>setAvatar(i)}><Avatar index={i}/></button>)}</div><button disabled={busy || !p.account || !/^[a-z][a-z0-9_]{2,19}$/.test(handle)} onClick={()=>void run(async()=>{await auth();await appApi("/profiles","PUT",{handle,avatar});setMessage("Public profile saved.");await inspect(p.account);})}>Save public profile</button></section>
    <button disabled={busy || !p.account} onClick={()=>void run(async()=>{await auth();await appApi("/profiles","DELETE");setProfile(null);setHandle("");setMessage("Public profile removed. Onchain statistics remain public.");})}>Remove my public profile</button><Notebook account={p.account} authenticate={auth} identity={p.identity} matchRef={p.matchRef} atUs={p.atUs} applyPreferences={p.applyPreferences}/></div>
  </div></>;
}
