"use client";
import {useEffect,useRef,useState} from 'react';
import type {Address} from 'viem';
import {independentApi} from '../lib/independent';
import {Court} from './Court';
import type {EngineState} from '../../shared/engine-stream';
const short=(p:string)=>p.slice(0,6)+'…'+p.slice(-4);
function frame(raw:any):EngineState{
 const state={...raw.state};for(const k of ['x','y','vx','vy','left','right','t','halfA','halfB','resumeAt'])state[k]=BigInt(state[k]);
 const s={...raw,state};for(const k of ['id','revision','head','clock','nonceA','nonceB','deadline'])s[k]=BigInt(s[k]);return s;
}
export function IndependentHistory({player,matchId}:{player:Address;matchId?:bigint}){
 const request=useRef(0);
 const [rows,setRows]=useState<any[]>([]),[frames,setFrames]=useState<EngineState[]>([]),[index,setIndex]=useState(0),[playing,setPlaying]=useState(false),[message,setMessage]=useState('Loading match history'),[selected,setSelected]=useState<string>();
 async function load(id:string){
  const current=++request.current;setMessage('Loading replay');setPlaying(false);setFrames([]);setSelected(id);let after='-1';const loaded:EngineState[]=[];
  try{for(;;){const r=await independentApi(`replay/${id}?after=${after}`);
   if(current!==request.current)return;
   if(r.availability!=='available'){setMessage(r.availability==='pruned'?'Replay retired. The result and payments remain available.':r.availability==='reorganizing'?'Publication is being reconciled.':'Replay frames were not recorded for this match.');return;}
   loaded.push(...r.frames.map(frame));if(r.frames.length<1000)break;after=String(loaded.at(-1)!.revision);
  }setFrames(loaded);setIndex(0);setMessage('Recorded engine snapshots. Published results remain available independently.');}catch{if(current===request.current)setMessage('Replay temporarily unavailable. Try opening it again.');}
 }
 useEffect(()=>{let alive=true;setPlaying(false);setFrames([]);setRows([]);void independentApi(`player/${player}/recent`).then(r=>{if(alive){setRows(r);if(!matchId)setMessage(r.length?'Your three latest completed matches':'No completed matches in these arenas yet.');}}).catch(()=>{if(alive&&!matchId)setMessage('History temporarily unavailable.');});if(matchId)void load(String(matchId));return()=>{alive=false;request.current++;};},[player,matchId]);
 useEffect(()=>{if(!playing||frames.length<2)return;let previous=performance.now(),elapsed=Number(frames[index]?.clock??0n);
  const t=setInterval(()=>{const now=performance.now();if(document.hidden){previous=now;return;}elapsed+=(now-previous)*1000;previous=now;setIndex(old=>{let next=old;while(next+1<frames.length&&Number(frames[next+1].clock)<=elapsed)next++;if(next===frames.length-1)setPlaying(false);return next;});},80);return()=>clearInterval(t);
 },[playing,frames]);
 const s=frames[index];
 return <section><p role="status">{message}</p>{rows.map(row=><div className="rooms-contact" key={row.ref}><strong>{short(row.latest.a)} · {short(row.latest.b)}</strong><span>{row.latest.scoreA} : {row.latest.scoreB}</span><span>{row.latest.mode?'Chaos':'Classic'} · {row.finality?'Final':'Published, contestable'}</span>{row.legacy?<a href={`/?deployment=${row.ref.split(':')[0]}&replay=${row.id}`}>Open previous replay ↗</a>:<button onClick={()=>void load(row.id)}>{row.replayAvailability==='pruned'?'View summary':'Watch replay'}</button>}</div>)}
  {s&&<><div className="rooms-canvas"><Court state={s.state} clock={s.clock} observedAt={Date.now()} direction={0} side={-1} replay matchId={`replay:${selected}`} controllable={false} pending={false} liveEngine onStats={()=>{}}/></div><label>Replay position<input type="range" min={0} max={frames.length-1} value={index} onChange={e=>{setPlaying(false);setIndex(Number(e.target.value));}}/></label><button onClick={()=>{if(index===frames.length-1)setIndex(0);setPlaying(!playing);}}>{playing?'Pause':'Play replay'}</button><p>{s.state.scoreA} : {s.state.scoreB}</p></>}
  <a href="/?deployment=v4">Earlier arenas and replays ↗</a></section>;
}
