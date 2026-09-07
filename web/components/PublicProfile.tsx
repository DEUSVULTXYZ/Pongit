"use client";
import {useEffect, useId, useRef, useState} from "react";
import {appApi, short} from "../lib/api";

export type PublicProfile = {player:string;handle:string|null;avatar:number};
const validHandle = /^[a-z][a-z0-9_]{2,19}$/;
export function profileChanged(profile:PublicProfile) {
  window.dispatchEvent(new CustomEvent("pongit:profile",{detail:profile}));
}
export function usePublicProfile(address:string|undefined) {
  const [profile,setProfile]=useState<PublicProfile|null>(null);
  useEffect(()=>{
    setProfile(null);if(!address)return;
    let stopped=false,revision=0;
    const refresh=()=>{const request=++revision;void appApi(`/profiles/${address}`).then(p=>{if(!stopped&&request===revision)setProfile(p);}).catch(()=>{});};
    const changed=(event:Event)=>{const p=(event as CustomEvent<PublicProfile>).detail;if(p.player.toLowerCase()===address.toLowerCase()){revision++;setProfile(p);}};
    refresh();window.addEventListener("pongit:profile",changed);window.addEventListener("focus",refresh);
    return()=>{stopped=true;window.removeEventListener("pongit:profile",changed);window.removeEventListener("focus",refresh);};
  },[address]);
  return profile?.player.toLowerCase()===address?.toLowerCase()?profile:null;
}
export function Avatar({index=0}:{index?:number}) {
  return <svg className="avatar" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="29" fill="#101022" stroke="currentColor"/><g transform={`rotate(${index*30} 32 32)`}><path d="M12 32 32 12 52 32 32 52Z" fill="none" stroke="currentColor" strokeWidth="3"/><path d={index%2?"M20 20 44 44M44 20 20 44":"M19 32H45M32 19V45"} stroke="currentColor" strokeWidth="4"/></g><circle cx="32" cy="32" r={4+index%4} fill="currentColor"/></svg>;
}

/** One editor for the home cabinet and Rivals. The database owns the unique name. */
export function ProfileEditor({account,ready,authenticate}:{account:string;ready:boolean;authenticate:()=>Promise<void>}) {
  const profile=usePublicProfile(account),id=useId();
  const [handle,setHandle]=useState(""),[avatar,setAvatar]=useState(0),[loaded,setLoaded]=useState(false);
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState("");
  const [availability,setAvailability]=useState<"idle"|"checking"|"available"|"taken"|"unknown">("idle");
  const locked=useRef(false),generation=useRef(0),mounted=useRef(true),edited=useRef(false);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;generation.current++;};},[]);
  useEffect(()=>{generation.current++;edited.current=false;setHandle("");setAvatar(0);setLoaded(false);setMessage("");setError("");},[account]);
  useEffect(()=>{if(profile&&!edited.current){setHandle(profile.handle||"");setAvatar(profile.avatar);setLoaded(true);}},[profile]);
  useEffect(()=>{
    if(!validHandle.test(handle)||handle===profile?.handle){setAvailability("idle");return;}
    let stopped=false;setAvailability("checking");
    const timer=setTimeout(()=>void appApi(`/profiles?search=${encodeURIComponent(handle)}`).then(d=>{if(!stopped)setAvailability(d.profiles.some((p:PublicProfile)=>p.handle===handle&&p.player.toLowerCase()!==account.toLowerCase())?"taken":"available");}).catch(()=>{if(!stopped)setAvailability("unknown");}),300);
    return()=>{stopped=true;clearTimeout(timer);};
  },[handle,account,profile?.handle]);
  async function save(remove=false) {
    if(locked.current)return;locked.current=true;setBusy(true);setMessage("");setError("");
    const current=generation.current;
    try {
      await authenticate();if(current!==generation.current||!mounted.current)return;
      const saved=await appApi("/profiles",remove?"DELETE":"PUT",remove?undefined:{handle,avatar},account);
      if(current!==generation.current||!mounted.current)return;
      const next:PublicProfile=remove?{player:account,handle:null,avatar:parseInt(account.slice(-4),16)%12}:saved;
      edited.current=false;setHandle(next.handle||"");setAvatar(next.avatar);profileChanged(next);
      setMessage(remove?"Public profile removed. Your results remain available.":"Public profile saved. Your username is ready in Rivals and the leaderboard.");
    } catch(e){if(current===generation.current&&mounted.current)setError((e as Error).message);}
    finally {locked.current=false;if(mounted.current)setBusy(false);}
  }
  return <form className="public-profile-form" onSubmit={e=>{e.preventDefault();if(ready&&account&&validHandle.test(handle)&&availability!=="taken")void save();}}>
    <div className="profile-preview"><Avatar index={avatar}/><div><strong>{handle||"Your player name"}</strong><small title={account}>{short(account)}</small></div></div>
    <p>Your public name follows you into Rivals, the leaderboard and the arena. Creating one is optional.</p>
    <label htmlFor={id}>Unique username</label><input id={id} name="username" autoComplete="nickname" spellCheck={false} autoCapitalize="none" maxLength={20} value={handle} disabled={busy||!account} aria-describedby={`${id}-hint ${id}-availability`} aria-invalid={!!handle&&!validHandle.test(handle)||availability==="taken"} onChange={e=>{edited.current=true;setHandle(e.target.value.toLowerCase());setMessage("");setError("");}} placeholder="e.g. neon_rider"/>
    <small id={`${id}-hint`}>3–20 characters. Start with a letter; use letters, numbers or underscores. Names are public and not case-sensitive.</small>
    <span id={`${id}-availability`} className={`username-availability ${availability}`} role="status">{handle&&!validHandle.test(handle)?"Use 3–20 characters, starting with a letter.":availability==="checking"?"Checking username…":availability==="taken"?"This username is already taken.":availability==="available"?"Username available.":availability==="unknown"?"Availability check unavailable. Saving will check again.":handle&&handle===profile?.handle?"This is your saved username.":"Choose a name your rivals will remember."}</span>
    <fieldset disabled={busy}><legend>Choose your avatar</legend><div className="avatar-grid">{Array.from({length:12},(_,i)=><button type="button" key={i} aria-label={`Avatar ${i+1}`} aria-pressed={avatar===i} onClick={()=>{edited.current=true;setAvatar(i);setMessage("");}}><Avatar index={i}/></button>)}</div></fieldset>
    <button className="primary" type="submit" disabled={!ready||!account||busy||!validHandle.test(handle)||availability==="taken"}>{busy?"Saving…":"Save public profile"}</button>
    {!loaded&&account&&<small>Your saved profile is loading. You can still choose a username.</small>}
    {profile?.handle&&<button type="button" className="remove-profile" disabled={!ready||busy} onClick={()=>void save(true)}>Remove my public profile</button>}
    {message&&<p className="notice" role="status">{message}</p>}{error&&<p className="notice error" role="alert">{error}</p>}
  </form>;
}
