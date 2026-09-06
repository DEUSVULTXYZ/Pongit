"use client";
import { useEffect, useRef, useState } from "react";
import { short } from "../lib/api";

export function Outcome({id,match,account,rating,sound,replay,rematch,watch,again}:{id:string|null;match:any;account:string;rating:number|null;sound:boolean;replay:boolean;rematch:()=>void;watch:()=>void;again:()=>void}) {
  const seen=useRef<{id:string;status:number;account:string;rating:number|null}|null>(null);
  const [result,setResult]=useState<{victory:boolean|null;before:number|null}|null>(null),[animate,setAnimate]=useState(false);
  useEffect(()=>{
    const previous=seen.current;
    if(!id || !match || replay){seen.current=null;setResult(null);return;}
    if(previous?.id!==id || previous.account!==account)setResult(null);
    const participant=account && [match.playerA,match.playerB].some((a:string)=>a.toLowerCase()===account.toLowerCase());
    if(previous?.id===id && previous.account===account && previous.status===2 && match.status===3){
      const victory=participant?match.winner.toLowerCase()===account.toLowerCase():null;
      setResult({victory,before:previous.rating});setAnimate(!window.matchMedia("(prefers-reduced-motion: reduce)").matches);
      if(sound && participant){try{const context=new AudioContext();const now=context.currentTime;[0,1,2,3].forEach(i=>{const osc=context.createOscillator(),gain=context.createGain();osc.type="square";osc.frequency.value=(victory?[392,523,659,784]:[392,330,262,196])[i];gain.gain.setValueAtTime(0.035,now+i*0.13);gain.gain.exponentialRampToValueAtTime(0.001,now+i*0.13+0.12);osc.connect(gain);gain.connect(context.destination);osc.start(now+i*0.13);osc.stop(now+i*0.13+0.13);});setTimeout(()=>void context.close(),1200);}catch{/* Sound is optional; result stays usable. */}}
    }
    seen.current={id,status:match.status,account,rating};
  },[id,match?.status,account,replay]);
  useEffect(()=>{if(!animate)return;const t=setTimeout(()=>setAnimate(false),2000);return()=>clearTimeout(t);},[animate]);
  if(!result)return null;
  const delta=rating!==null && result.before!==null?rating-result.before:null;
  if(result.victory===null)return <aside className="inbox-banner spectator-result" role="status">{short(match.winner)} wins · {match.state.scoreA} : {match.state.scoreB}<button aria-label="Dismiss winner" onClick={()=>setResult(null)}>×</button></aside>;
  return <section className={`outcome ${animate?"celebrate":""} ${result.victory===false?"defeat":"victory"}`} role="dialog" aria-modal="true" aria-label="Confirmed match result">
    <button className="outcome-close" onClick={()=>setResult(null)} aria-label="Close result">×</button>
    {animate && <div className="arcade-particles" aria-hidden="true">{Array.from({length:20},(_,i)=><i key={i} style={{"--i":i} as React.CSSProperties}/>)}</div>}
    <p className="eyebrow">RESULT CONFIRMED ON MONAD</p><h2>{result.victory===null?"GAME OVER":result.victory?"VICTORY":"DEFEAT"}</h2>
    <p className="outcome-score">{match.state.scoreA} : {match.state.scoreB}</p><p>{short(match.winner)} wins</p>
    {result.victory!==null && <p>{match.ranked===false?"Friendly match · ELO unchanged":!match.ratingFinalized?"ELO settlement pending…":delta!==null?`${match.mode===1?"Chaos":"Classic"} ELO ${delta>=0?"+":""}${delta}`:"ELO updated"}</p>}
    {animate && <button onClick={()=>setAnimate(false)}>Skip animation</button>}
    <div className="button-row">{result.victory!==null && <button onClick={()=>{setResult(null);rematch();}}>Rematch ↗</button>}<button onClick={()=>{setResult(null);watch();}}>Watch replay</button><button onClick={()=>{setResult(null);again();}}>Find another opponent</button></div>
  </section>;
}
