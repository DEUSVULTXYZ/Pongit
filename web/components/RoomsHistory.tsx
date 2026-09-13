"use client";
import {useEffect,useRef,useState} from 'react';
import {roomsApi,roomsManifest,roomsAccountKey,authenticateRooms} from '../lib/interlude-rooms';
import type {Address} from 'viem';
import {restoreEngineFrame} from '../../shared/engine-frame-json';
import type {EngineState} from '../../shared/engine-stream';
import {Court} from './Court';
import {ChaosEffectsHud} from './ChaosEffectsHud';
import {eventHud} from '../lib/chaos-presentation';
import styles from './RoomsHistory.module.css';
export function RoomsHistory({matchId}:{matchId?:string}){
 const revision=useRef(0),[rows,setRows]=useState<any[]>([]),[frames,setFrames]=useState<EngineState[]>([]),[index,setIndex]=useState(0),[playing,setPlaying]=useState(false),[message,setMessage]=useState('Loading recent matches'),[refresh,setRefresh]=useState(0);
 async function load(row:any){const version=++revision.current;setFrames([]);setPlaying(false);setMessage('Loading replay');
  try{const values:EngineState[]=[];let after='-1';for(;;){
    const r=await roomsApi<any>(`/interlude/replay?app=${row.app}&epoch=${row.epoch}&id=${row.id}&after=${after}`);if(version!==revision.current)return;
    if(r.availability!=='available'){setMessage(r.availability==='pruned'?'Replay retired. Results and payments remain available.':r.availability==='awaiting-publication'?'Waiting for result publication. Try again shortly.':'No replay was recorded for this match.');return;}
    values.push(...r.frames.map(restoreEngineFrame));if(r.frames.length<250)break;after=String(values.at(-1)!.revision);
   }setFrames(values);setIndex(0);setMessage(values.length?'Recorded snapshots. Published results remain contestable.':'No replay frames were recorded.');
  }catch{if(version===revision.current)setMessage('Replay unavailable. Try again.');}
 }
 useEffect(()=>{let active=true;void (async()=>{
  // Published history needs an authenticated account, not a writable engine.
  // Renew only the HTTP cookie from the retained grant; this cannot open a
  // passkey prompt or authorize a game/financial transaction.
  try{return await roomsApi<any[]>('/interlude/recent-matches');}catch(e){if((e as {status?:number}).status!==401)throw e;const p=sessionStorage.getItem(roomsAccountKey);if(!p)throw e;await authenticateRooms(p as Address);return roomsApi<any[]>('/interlude/recent-matches');}
 })().then(next=>{if(!active)return;setRows(next);const selected=matchId&&next.find(r=>r.ref===matchId||r.id===matchId&&r.app===roomsManifest.app);if(selected?.epoch)void load(selected);else setMessage(matchId?'Waiting for the match to appear in published history.':'Your three latest completed matches');}).catch(()=>{if(active)setMessage('History unavailable. Try again.');});return()=>{active=false;revision.current++;};},[matchId,refresh]);
 useEffect(()=>{if(!playing)return;let last=performance.now(),clock=Number(frames[index]?.clock||0n);const timer=setInterval(()=>{
  const now=performance.now();if(!document.hidden)clock+=(now-last)*1000;last=now;setIndex(old=>{let i=old;while(i+1<frames.length&&Number(frames[i+1].clock)<=clock)i++;if(i+1===frames.length)setPlaying(false);return i;});
 },80);return()=>clearInterval(timer);},[playing,frames]);
 const s=frames[index];
 return <section><p role="status">{message}</p><button onClick={()=>setRefresh(x=>x+1)}>Refresh history</button>
  {rows.map(row=><div className="rooms-contact" key={row.ref}><strong>{row.score_a} : {row.score_b}</strong><span>{row.mode?'Chaos':'Classic'} · {row.published?'Published':'Awaiting publication'}</span>{row.epoch?<button onClick={()=>void load(row)}>{row.replay_availability==='pruned'?'View summary':'Watch replay'}</button>:row.legacy?<a href={`/?deployment=${row.legacy}`} target="_blank" rel="noreferrer">Open legacy arcade</a>:<span>Summary only</span>}</div>)}
  {s&&<>{s.chaos&&<ChaosEffectsHud effects={eventHud(s.chaos.physics)} gameMs={Number(s.state.t/1000n)} effectsEnabled={false}/>}
   <div className={`rooms-canvas ${styles.court}`}><Court chaos={s.chaos} state={s.state} clock={s.clock} observedAt={Date.now()} direction={0} side={-1} replay matchId={`replay:${s.id}`} controllable={false} pending={false} liveEngine onStats={()=>{}}/></div>
   <label>Replay position<input type="range" min={0} max={frames.length-1} value={index} onChange={e=>{setPlaying(false);setIndex(Number(e.target.value));}}/></label>
   <button onClick={()=>{if(index===frames.length-1)setIndex(0);setPlaying(v=>!v);}}>{playing?'Pause':'Play replay'}</button><p>{s.state.scoreA} : {s.state.scoreB}</p></>}
 </section>;
}
