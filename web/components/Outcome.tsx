"use client";
import { IconButton } from "./IconButton";

import { useEffect, useRef, useState } from "react";
import { arcadeAudio } from "../lib/audio";
import {createPortal} from "react-dom";
import {useDialog} from "../lib/dialog";
import { short } from "../lib/api";

export function Outcome({id,match,account,rating,ratingDelta,sound,replay,rematch,watch,again,confirmation="monad",againLabel="Find another opponent",showResultKey=0}:{id:string|null;match:any;account:string;rating:number|null;ratingDelta?:number;sound:boolean;replay:boolean;rematch:()=>Promise<void>;watch?:()=>void;again:()=>void;confirmation?:"monad"|"engine";againLabel?:string;showResultKey?:number}) {
  const [rematchBusy,setRematchBusy]=useState(false),[rematchStatus,setRematchStatus]=useState("");
  const dialog=useRef<HTMLElement>(null);
  const seen=useRef<{id:string;status:number;account:string;rating:number|null}|null>(null);
  const [result,setResult]=useState<{id:string;account:string;victory:boolean|null;before:number|null;cancelled?:boolean}|null>(null),[animate,setAnimate]=useState(false);
  const currentResult=!!result && !!match && result.id===id && result.account===account && !replay;
  useEffect(()=>{
    const previous=seen.current;
    if(!id || !match || replay){seen.current=null;setResult(null);return;}
    if(previous?.id!==id || previous.account!==account)setResult(null);
    const participant=account && [match.playerA,match.playerB].some((a:string)=>a.toLowerCase()===account.toLowerCase());
    if(previous?.id===id && previous.account===account && previous.status===2 && match.status===3){
      const victory=participant?match.winner.toLowerCase()===account.toLowerCase():null;
      setResult({id,account,victory,before:previous.rating});setAnimate(!window.matchMedia("(prefers-reduced-motion: reduce)").matches);
      if(sound && participant)arcadeAudio.play(victory?"victory":"defeat",`result:${id}:${account}`);
    }
    if(previous?.id===id && previous.account===account && previous.status===2 && match.status===4){
      setResult({id,account,victory:null,before:previous.rating,cancelled:true});setAnimate(false);
    }
    seen.current={id,status:match.status,account,rating};
  },[id,match?.status,account,replay]);
  useEffect(()=>{
    if(!showResultKey || !id || !match || ![3,4].includes(match.status) || replay)return;
    const participant=account && [match.playerA,match.playerB].some((a:string)=>a.toLowerCase()===account.toLowerCase());
    setResult({id,account,victory:participant?match.winner.toLowerCase()===account.toLowerCase():null,before:null,cancelled:match.status===4});setAnimate(false);
  },[showResultKey]);
  useEffect(()=>{if(!animate)return;const t=setTimeout(()=>setAnimate(false),4000);return()=>clearTimeout(t);},[animate]);
  useDialog(dialog,currentResult && (result!.victory!==null||!!result!.cancelled),()=>{if(animate)setAnimate(false);else setResult(null);});
  useEffect(()=>{if(result && !animate && (result.victory!==null||result.cancelled))dialog.current?.querySelector<HTMLButtonElement>(".button-row button")?.focus({preventScroll:true});},[animate,result]);
  if(!currentResult || !result)return null;
  const delta=ratingDelta ?? (rating!==null && result.before!==null?rating-result.before:null);
  if(result.cancelled)return createPortal(<section tabIndex={-1} ref={dialog} className="outcome" role="dialog" aria-modal="true" aria-label="Cancelled match result">
    <IconButton className="outcome-close" onClick={()=>setResult(null)} aria-label="Close result"/>
    <h2>Match cancelled</h2><p>No winner. ELO unchanged.</p>
    <div className="button-row"><button onClick={()=>{setResult(null);again();}}>{againLabel}</button><button onClick={()=>setResult(null)}>Back</button></div>
  </section>,document.body);
  if(result.victory===null)return <aside className="inbox-banner spectator-result" role="status">{short(match.winner)} wins · {match.state.scoreA} : {match.state.scoreB}<IconButton aria-label="Dismiss winner" onClick={()=>setResult(null)}/></aside>;
  return createPortal(<section tabIndex={-1} ref={dialog} className={`outcome ${animate?"celebrate":""} ${result.victory===false?"defeat":"victory"}`} role="dialog" aria-modal="true" aria-label="Confirmed match result">
    <IconButton className="outcome-close" onClick={()=>setResult(null)} aria-label="Close result"/>
    <div className="outcome-effects" aria-hidden="true">
      <div className="result-vortex"/><div className="result-ring ring-a"/><div className="result-ring ring-b"/><div className="result-scan"/>
      {animate && <div className="arcade-particles">{Array.from({length:32},(_,i)=><i key={i} style={{"--i":i} as React.CSSProperties}/>)}</div>}
    </div>
    <p className="eyebrow">{confirmation==="engine"?"RESULT CONFIRMED ON INTERLUDE":"RESULT CONFIRMED ON MONAD"}</p><h2 data-title={result.victory?"VICTORY":"DEFEAT"}>{result.victory?"VICTORY":"DEFEAT"}</h2>
    <p className="outcome-score">{match.state.scoreA} : {match.state.scoreB}</p><p>{short(match.winner)} wins</p>
    {result.victory!==null && <p>{match.ranked===false?"Friendly match · ELO unchanged":!match.ratingFinalized?"ELO settlement pending…":delta!==null?`${match.mode===1?"Chaos":"Classic"} ELO ${delta>=0?"+":""}${delta}`:"ELO updated"}</p>}
    {animate && <button className="outcome-skip" data-autofocus onClick={()=>setAnimate(false)}>Skip animation · Esc</button>}
    {rematchStatus && <p role="status">{rematchStatus}</p>}
    <div className="button-row">{result.victory!==null && <button disabled={rematchBusy} onClick={()=>{setRematchBusy(true);setRematchStatus("");void rematch().then(()=>setResult(null)).catch(e=>setRematchStatus(e.message)).finally(()=>setRematchBusy(false));}}>{rematchBusy?"Sending rematch…":"Rematch ↗"}</button>}{watch&&<button onClick={()=>{setResult(null);watch();}}>Watch replay</button>}<button onClick={()=>{setResult(null);again();}}>{againLabel}</button></div>
  </section>,document.body);
}
