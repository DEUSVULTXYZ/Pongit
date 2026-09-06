"use client";
import { useEffect, useState } from "react";
import { arcadeAudio, type AudioSettings } from "../lib/audio";

export function ArcadeAmbience({onSound}:{onSound:(enabled:boolean)=>void}) {
  const [settings,setSettings]=useState<AudioSettings|null>(null),[hidden,setHidden]=useState(false),[controls,setControls]=useState(false);
  useEffect(()=>{
    const update=()=>{setSettings({...arcadeAudio.settings});onSound(arcadeAudio.settings.enabled);};arcadeAudio.load();update();
    const gesture=()=>{void arcadeAudio.activate();};
    const click=(event:MouseEvent)=>{if((event.target as HTMLElement).closest("button"))arcadeAudio.play("button");};
    const visibility=()=>{setHidden(document.hidden);if(document.hidden)arcadeAudio.hidden();else void arcadeAudio.activate();};
    window.addEventListener("pongit:audio",update);window.addEventListener("pointerdown",gesture);window.addEventListener("keydown",gesture);window.addEventListener("click",click);document.addEventListener("visibilitychange",visibility);
    return()=>{arcadeAudio.hidden();window.removeEventListener("pongit:audio",update);window.removeEventListener("pointerdown",gesture);window.removeEventListener("keydown",gesture);window.removeEventListener("click",click);document.removeEventListener("visibilitychange",visibility);};
  },[]);
  function enter(enabled:boolean){arcadeAudio.configure({entered:true,enabled});void arcadeAudio.activate();}
  return <><div className={`arcade-background ${hidden || settings?.background===false?"paused":""}`} data-effects={settings?.background!==false} aria-hidden="true"><div className="arcade-horizon"/><div className="arcade-grid"/><div className="arcade-orbit orbit-one"/><div className="arcade-orbit orbit-two"/>{Array.from({length:12},(_,i)=><i key={i} className="neon-mote" style={{"--i":i} as React.CSSProperties}/>)}</div>
    <button className="arcade-settings-toggle" aria-label="Arcade settings" title="Music, effects and background settings" disabled={!settings} aria-expanded={controls} onClick={()=>setControls(!controls)}>Sound {settings?.enabled?"on":"off"} ♫</button>
    {controls && settings && <section className="arcade-settings side-card" aria-label="Arcade settings"><button className="modal-close" aria-label="Close arcade settings" onClick={()=>setControls(false)}>×</button><p className="eyebrow">TUNE YOUR CABINET</p><button aria-pressed={settings.enabled} onClick={()=>{arcadeAudio.configure({enabled:!settings.enabled,entered:true});void arcadeAudio.activate();}}>Sound {settings.enabled?"on":"off"}</button><label>Music · {Math.round(settings.music*100)}%<input aria-label="Music volume" type="range" min="0" max="100" value={settings.music*100} onChange={e=>arcadeAudio.configure({music:Number(e.target.value)/100})}/></label><label>Effects · {Math.round(settings.effects*100)}%<input aria-label="Effects volume" type="range" min="0" max="100" value={settings.effects*100} onChange={e=>arcadeAudio.configure({effects:Number(e.target.value)/100})}/></label><button aria-pressed={settings.background} onClick={()=>arcadeAudio.configure({background:!settings.background})}>Background effects {settings.background?"on":"off"}</button><small>Music resumes after your first gesture. Reduced motion follows your device setting.</small></section>}
    {settings && !settings.entered && <div className="arcade-entry modal-backdrop"><section className="connect-modal" role="dialog" aria-modal="true" aria-label="Enter PONGIT arcade"><p className="eyebrow">INSERT YOURSELF / PLAYER ONE</p><h2>THE ARCADE<br/>IS OPEN.</h2><p>Two paddles. One chain. Your next rival is waiting.</p><button className="primary" autoFocus onClick={()=>enter(true)}>Enter arcade ♫</button><button onClick={()=>enter(false)}>Enter muted</button><small>Original soundtrack · music 20% / effects 60%</small></section></div>}
  </>;
}
