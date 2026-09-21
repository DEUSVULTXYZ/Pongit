import {Avatar} from './Avatar';

/** Agent and human courts deliberately use the same Pixel Palace score panel. */
export function AgentScoreboard({players,scores,caption}:{players:[{name:string;avatar:number},{name:string;avatar:number}];scores:[number,number];caption:string}){
 return <div className="scoreboard">
  {players.map((player,i)=><div className={`player-label ${i?'right':''}`} style={i?{gridColumn:3}:undefined} key={i}>
   <Avatar index={player.avatar}/><small>PLAYER 0{i+1}</small><span>{player.name}</span>
   <div className="arena-rounds" aria-hidden="true">{Array.from({length:7},(_,n)=><b key={n} data-won={n<scores[i]}/>)}</div>
  </div>)}
  <div className="arena-score-module" style={{gridColumn:2,gridRow:1}}><small>{caption}</small>
   <div className="score"><span>{String(scores[0]).padStart(2,'0')}</span><i>:</i><span>{String(scores[1]).padStart(2,'0')}</span></div>
  </div>
 </div>;
}
