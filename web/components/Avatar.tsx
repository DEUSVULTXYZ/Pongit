"use client";
import {useRef,type CSSProperties,type KeyboardEvent} from "react";

// Stable IDs preserve every existing profile choice. Artwork is versioned by path.
export const AVATARS = [
  {name:"Nova",slug:"nova",detail:"Star pilot",accent:"#75e4ff"},
  {name:"Ghost",slug:"ghost",detail:"Night rider",accent:"#b9afff"},
  {name:"Vector",slug:"vector",detail:"Chrome soul",accent:"#ffd282"},
  {name:"Pulse",slug:"pulse",detail:"Neon rebel",accent:"#ff82c3"},
  {name:"Drift",slug:"drift",detail:"After hours",accent:"#ffb178"},
  {name:"Kitsune",slug:"kitsune",detail:"Digital fox",accent:"#8df2ed"},
  {name:"Ion",slug:"ion",detail:"Voltage runner",accent:"#b8f189"},
  {name:"Echo",slug:"echo",detail:"Future memory",accent:"#c9a9ff"},
  {name:"Onyx",slug:"onyx",detail:"Midnight hunter",accent:"#79b8ff"},
  {name:"Glitch",slug:"glitch",detail:"Analog heart",accent:"#93f4e1"},
  {name:"Solar",slug:"solar",detail:"Golden hour",accent:"#ffda91"},
  {name:"Viper",slug:"viper",detail:"Redline racer",accent:"#ff8999"},
] as const;
export const avatarAt=(index:number)=>AVATARS[Number.isInteger(index)&&index>=0&&index<AVATARS.length?index:0];
export function Avatar({index=0}:{index?:number}) {
  const a=avatarAt(index);
  return <span className="avatar portrait-avatar" style={{"--avatar-accent":a.accent} as CSSProperties} aria-hidden="true"><img src={`/avatars/roster-v1/${a.slug}.webp`} alt="" width="256" height="256" decoding="async" draggable={false}/></span>;
}

export function AvatarPicker({value,disabled,onChange}:{value:number;disabled:boolean;onChange:(index:number)=>void}) {
  const grid=useRef<HTMLDivElement>(null);
  function key(event:KeyboardEvent<HTMLButtonElement>,index:number) {
    const columns=grid.current?getComputedStyle(grid.current).gridTemplateColumns.split(" ").length:4;
    const delta:Record<string,number>={ArrowRight:1,ArrowLeft:-1,ArrowDown:columns,ArrowUp:-columns};
    let next:number;
    if(event.key==="Home")next=0;else if(event.key==="End")next=AVATARS.length-1;
    else if(event.key in delta)next=(index+delta[event.key]+AVATARS.length)%AVATARS.length;else return;
    event.preventDefault();onChange(next);const target=grid.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next];target?.focus({preventScroll:true});target?.scrollIntoView({block:"nearest",inline:"nearest",behavior:"instant"});
  }
  return <fieldset className="avatar-roster" disabled={disabled}><legend>Choose your avatar</legend><p className="roster-caption">Twelve faces. Your place in the arcade.</p><div className="avatar-grid portrait-grid" ref={grid} role="radiogroup" aria-label="Arcade characters">{AVATARS.map((a,i)=><button key={a.slug} type="button" role="radio" aria-label={`${a.name}: ${a.detail}`} aria-checked={value===i} tabIndex={value===i?0:-1} data-avatar={i} style={{"--avatar-accent":a.accent} as CSSProperties} onKeyDown={e=>key(e,i)} onClick={()=>onChange(i)}><Avatar index={i}/><span className="avatar-name">{a.name}</span><span className="avatar-check" aria-hidden="true">✓</span></button>)}</div></fieldset>;
}
