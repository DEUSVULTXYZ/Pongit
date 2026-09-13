import type {CSSProperties} from 'react';
import {chaosEvent,type ChaosEffectState} from '../../shared/chaos-events';
import styles from './ChaosEffectsHud.module.css';

/** Fixed two-slot HUD. Only a rules-6 transport with verified effects may supply it.
 * Time comes from the game renderer; there is no additional timer or animation loop. */
export function ChaosEffectsHud({effects,gameMs,effectsEnabled=true,players=['PLAYER 01','PLAYER 02']}:{
 effects:readonly ChaosEffectState[];gameMs:number;effectsEnabled?:boolean;players?:readonly [string,string];
}){
 const visible=effects.filter(e=>!e.consumed&&gameMs<e.expiresAt).slice(0,2);
 return <div className={styles.hud} data-effects={effectsEnabled?'on':'off'} aria-label="Chaos effects">
  <div className={styles.slots} aria-hidden="true"><span/><span/></div>
  {visible.map(effect=>{
   const definition=chaosEvent(effect.id),announcing=gameMs<effect.startsAt;
   const remaining=Math.max(0,effect.expiresAt-Math.max(effect.startsAt,gameMs));
   const duration=effect.expiresAt-effect.startsAt;
   const target=effect.target===2?(definition.target==='both'?'BOTH PLAYERS':'COURT'):players[effect.target];
   return <div key={`${effect.slot}:${effect.startsAt}:${effect.id}`} className={styles.card} data-announcing={announcing||undefined}
    style={{gridColumn:effect.slot+1,gridRow:1,'--chaos-color':definition.color,'--chaos-remaining':`${Math.max(0,Math.min(100,remaining/Math.max(1,duration)*100))}%`} as CSSProperties}>
    <img className={styles.icon} src={`/chaos/events-v6/${definition.key}.svg`} alt="" width="36" height="36"/>
    <div className={styles.copy}>
     <span className={styles.target}>{target}</span>
     <strong>{definition.name}</strong>
     <span className={styles.description}>{definition.description}</span>
    </div>
    <span className={styles.time} aria-label={announcing?'Activating':`${Math.ceil(remaining/1000)} seconds remaining`}>
     {announcing?'READY':effect.chargeRemaining!==undefined?`${effect.chargeRemaining} CHARGE`:`${Math.ceil(remaining/1000)}s`}
    </span>
    <span className={styles.track} aria-hidden="true"><span/></span>
   </div>;
  })}
 </div>;
}
