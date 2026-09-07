"use client";
import { IconButton } from "./IconButton";

import { useEffect, useRef, useState } from "react";
import { emptyNotebook, type NotebookData } from "../../shared/social";
import { decryptNotebook, encryptNotebook, unlockNotebook } from "../lib/notebook";
import { api, appApi as requestApp } from "../lib/api";
import type { Identity } from "../lib/wallet";

function ReplayStatus({reference}:{reference:string}){
  const [status,setStatus]=useState("");
  useEffect(()=>{let alive=true;if(/^v[1-4]:\d+$/.test(reference))void api(`/replay-status/${reference}`).then(r=>{if(alive)setStatus(r.replayAvailability);}).catch(()=>{});return()=>{alive=false;};},[reference]);
  return status==="pruned"?<small>Replay retired · your private note is preserved.</small>:null;
}
export function Notebook({disabled=false,account,authenticate,identity,matchRef,atUs,applyPreferences}:{disabled?:boolean;account:string;authenticate:()=>Promise<void>;identity:()=>Identity|null;matchRef?:string;atUs?:string;applyPreferences:(settings:{preferredMode:number;sound:boolean})=>void}) {
  const appApi=(path:string,method="GET",body?:unknown)=>requestApp(path,method,body,account);
  const key=useRef<CryptoKey|null>(null), generation=useRef(0), inFlight=useRef(false);
  const [data,setData]=useState<NotebookData|null>(null),[revision,setRevision]=useState(0),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
  const [rival,setRival]=useState(""),[nickname,setNickname]=useState(""),[note,setNote]=useState("");
  function lock(){generation.current++;key.current=null;setData(null);setRival("");setNickname("");setNote("");setRevision(0);setMessage("");}
  useEffect(()=>{lock();return ()=>{generation.current++;key.current=null;};},[account]);
  async function run(fn:()=>Promise<void>){if(inFlight.current)return;inFlight.current=true;setBusy(true);setMessage("");try{await fn();}catch(e){setMessage((e as Error).message);}finally{inFlight.current=false;setBusy(false);}}
  async function load(){const g=generation.current;await authenticate();if(g!==generation.current)return;const own=identity();if(!own || own.account.address.toLowerCase()!==account.toLowerCase())throw new Error("Connect the correct passkey first");const k=key.current || await unlockNotebook(own);if(g!==generation.current)return;const stored=await appApi("/notebook");const decrypted=stored.ciphertext ? await decryptNotebook(k,account,stored) : emptyNotebook();if(g!==generation.current)return;key.current=k;setData(decrypted);setRevision(stored.revision || 0);setMessage("Unlocked in memory. Lock or disconnect to close.");}
  async function save(){if(!data || !key.current)return;const g=generation.current,k=key.current;await authenticate();if(g!==generation.current)return;const encrypted=await encryptNotebook(k,account,data);if(g!==generation.current)return;const result=await appApi("/notebook","PUT",{...encrypted,revision});if(g!==generation.current)return;setRevision(result.revision);setMessage("Encrypted copy saved. Recover it with the same passkey on another device.");}
  return <section className="side-card notebook"><div className="card-title"><p className="eyebrow">PRIVATE NOTEBOOK / MERA</p><span>{data?"UNLOCKED":"ENCRYPTED"}</span></div><h2>Your private playbook.</h2><p>Rivals, replay notes and preferences. Only your passkey can decrypt them.</p>
    {!data?<button disabled={disabled || !account || busy} onClick={()=>void run(load)}>Unlock notebook ↗</button>:<>
      <div className="split"><button disabled={disabled || busy} onClick={()=>void run(save)}>Save encrypted</button><button onClick={lock}>Lock</button></div>
      <button disabled={disabled || busy} onClick={()=>void run(load)}>Reload saved copy (discard local edits)</button>
      <h3>Favourite rivals</h3><label>Address<input value={rival} onChange={e=>setRival(e.target.value)} placeholder="0x…"/></label><label>Private nickname<input maxLength={40} value={nickname} onChange={e=>setNickname(e.target.value)}/></label>
      <button disabled={!/^0x[\da-fA-F]{40}$/.test(rival)} onClick={()=>{setData({...data,rivals:[...data.rivals.filter(r=>r.address.toLowerCase()!==rival.toLowerCase()),{address:rival,nickname,note:""}]});setRival("");setNickname("");}}>Add favourite</button>
      {data.rivals.map(r=><div className="notebook-row" key={r.address}><span>{r.nickname || r.address}<small>{r.address}</small></span><IconButton aria-label={`Remove ${r.nickname || r.address}`} onClick={()=>setData({...data,rivals:data.rivals.filter(x=>x!==r)})}/></div>)}
      <h3>Replay notes</h3><p>{matchRef?`${matchRef} · ${Number(atUs || 0)/1e6}s`:"Open a match or replay to attach a note."}</p><textarea maxLength={2000} value={note} onChange={e=>setNote(e.target.value)} placeholder="Private observation…"/>
      <button disabled={!note.trim() || !matchRef} onClick={()=>{setData({...data,notes:[...data.notes,{id:crypto.randomUUID(),matchRef:matchRef!,atUs:atUs || "0",text:note}]});setNote("");}}>Add timestamped note</button>
      {data.notes.map(n=><div className="notebook-row" key={n.id}><span><small>{n.matchRef} · {Number(n.atUs)/1e6}s</small><ReplayStatus reference={n.matchRef}/>{n.text}</span><IconButton aria-label="Delete note" onClick={()=>setData({...data,notes:data.notes.filter(x=>x!==n)})}/></div>)}
      <label>Preferred mode<select value={data.settings.preferredMode} onChange={e=>setData({...data,settings:{...data.settings,preferredMode:Number(e.target.value) as 0|1}})}><option value="0">Classic</option><option value="1">Chaos</option></select></label>
      <label><input type="checkbox" checked={data.settings.sound} onChange={e=>setData({...data,settings:{...data.settings,sound:e.target.checked}})}/> Prefer arcade sounds</label>
      <button onClick={()=>void run(async()=>{applyPreferences(data.settings);setMessage("Preferences applied to this browser.");})}>Apply preferences</button>
      <p>Edits stay in memory until you save. If another device saves first, reload its copy before merging your changes.</p>
    </>}{message && <p role="status">{message}</p>}</section>;
}
