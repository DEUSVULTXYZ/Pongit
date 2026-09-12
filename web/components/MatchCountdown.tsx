"use client";
import {useEffect,useState} from 'react';
import {zeroHash} from 'viem';
import {initial} from '../../shared/physics-v2';
import {Court} from './Court';
import {arcadeAudio} from '../lib/audio';
const preview=initial(zeroHash),quiet=()=>{};
function CountdownDigit({digit,offset}:{digit:number;offset:number}){
 const [delay]=useState(()=>`-${offset}ms`);
 return <span className="match-countdown-digit" style={{animationDelay:delay}}>{digit}</span>;
}
/** Pre-admission scene: the engine has not received both acceptance signatures. */
export function MatchCountdown({id,endsAt,now,players,onBack,busy}:{id:string;endsAt?:number;now:number;players:[string,string];onBack:()=>void;busy:boolean}){
 const remaining=endsAt?Math.max(0,endsAt-now):0;
 const digit=endsAt?Math.min(3,Math.ceil(remaining/1000)):0;
 useEffect(()=>{if(digit)arcadeAudio.play('countdown',`${id}:intro:${digit}`);},[id,digit]);
 return <section className="rooms-court court-card rooms-intro" aria-label="Match starting">
  <div className="rooms-intro-players"><strong>{players[0]}</strong><span>VS</span><strong>{players[1]}</strong></div>
  <div className="rooms-canvas">
   <Court state={preview} clock={0n} observedAt={0} direction={0} side={-1} replay matchId={`intro:${id}`} controllable={false} pending={false} onStats={quiet}/>
   <div className="match-countdown" role="status" aria-live="polite" aria-atomic="true">
    <span className="match-countdown-label">{digit?'GET READY':endsAt?'STARTING MATCH':'READY TO PLAY'}</span>
    {digit>0?<CountdownDigit key={digit} digit={digit} offset={(1000-remaining%1000)%1000}/>:<span className="match-countdown-wait">{endsAt?'Waiting for the game to start':'Waiting for your rival'}</span>}
   </div>
  </div>
  <div className="rooms-court-controls"><span>{digit?'First to seven':endsAt?'Confirming both players':'Your rival must accept too'}</span><button disabled={busy} onClick={onBack}>Back</button></div>
 </section>;
}

export function ChaosRallyStatus({phase,blocksLeft}:{phase:'open'|'closing'|'preparing';blocksLeft?:number|bigint}){
 return <div className="rooms-serve-status" role="status"><strong>{phase==='open'?`Betting open · ${blocksLeft??0} blocks left`:phase==='closing'?'Closing bets':'Synchronizing Chaos bets'}</strong><small>{phase==='open'?'The next rally uses the updated paddle sizes.':phase==='closing'?'Locking the bets for the next rally.':'Waiting for confirmed bets on Monad before updating the paddles.'}</small></div>;
}
