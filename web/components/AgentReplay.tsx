'use client';
import {useEffect,useState} from 'react';
import {restoreEngineFrame} from '../../shared/engine-frame-json';
import type {EngineState} from '../../shared/engine-stream';
import {agentMatchKey,type AgentMatchRef} from '../../shared/agents';
import {API} from '../lib/api';
import {Court} from './Court';
import {ChaosEffectsHud} from './ChaosEffectsHud';
import {eventHud} from '../lib/chaos-presentation';
export function AgentReplay({reference}:{reference:AgentMatchRef}){
 const [frames,setFrames]=useState<EngineState[]>([]),[index,setIndex]=useState(0),[playing,setPlaying]=useState(false),[message,setMessage]=useState('Loading replay'),[rules,setRules]=useState<number>();
 useEffect(()=>{let done=false;setFrames([]);setIndex(0);setPlaying(false);
  void fetch(`${API}/agents/replay?${new URLSearchParams({id:reference.id,app:reference.app,epoch:reference.epoch})}`,{signal:AbortSignal.timeout(15000)})
   .then(async r=>{if(!r.ok)throw Error('Replay unavailable');return r.json();}).then(r=>{
    if(done)return;if(!['available','partial'].includes(r.availability)){setMessage(r.availability==='pruned'?'Replay retired. The result remains available.':r.availability==='indexing'?'Replay history is synchronizing. Try again shortly.':r.availability==='corrected'?'The published result changed. This recording is unavailable.':'No complete replay is available.');return;}
    const values=r.frames.map(restoreEngineFrame);setFrames(values);setRules(r.rulesVersion);setMessage(r.availability==='partial'?'PARTIAL REPLAY · Some snapshots were not recorded':'REPLAY · Recorded contract snapshots');
   }).catch(()=>{if(!done)setMessage('Replay unavailable. Try again later.');});return()=>{done=true;};
 },[reference.app,reference.epoch,reference.id]);
 useEffect(()=>{if(!playing)return;let last=performance.now(),clock=Number(frames[index]?.state.t||0n);
  const t=setInterval(()=>{const now=performance.now();if(!document.hidden)clock+=(now-last)*1000;last=now;
   setIndex(old=>{let i=old;while(i+1<frames.length&&Number(frames[i+1].state.t)<=clock)i++;if(i===frames.length-1)setPlaying(false);return i;});
  },80);return()=>clearInterval(t);
 },[playing,frames]);
 const s=frames[index];return <section><p role="status">{message}</p>{s&&<>
  {s.chaos&&<ChaosEffectsHud effects={eventHud(s.chaos.physics)} gameMs={Number(s.state.t)/1000} effectsEnabled={false}/>}
  <div className="rooms-canvas"><Court state={s.state} chaos={s.chaos} rulesVersion={rules} clock={s.clock} observedAt={Date.now()} direction={0} side={-1} replay
   matchId={`replay:${agentMatchKey(reference)}`} controllable={false} pending={false} liveEngine onStats={()=>{}}/></div>
  <label>Replay position<input type="range" min={0} max={frames.length-1} value={index} onChange={e=>{setPlaying(false);setIndex(Number(e.target.value));}}/></label>
  <button onClick={()=>{if(index===frames.length-1)setIndex(0);setPlaying(v=>!v);}}>{playing?'Pause':'Play replay'}</button><p>{s.state.scoreA} : {s.state.scoreB}</p>
 </>}</section>;
}
