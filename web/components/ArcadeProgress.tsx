import type {CSSProperties,ReactNode} from 'react';
import {arcadeStageLabels,measuredProgress,type ArcadeStage,type ArcadeProgress as Progress} from '../../shared/arcade-progress';
import styles from './ArcadeProgress.module.css';

/** CSS-only animation: it never advances game time or reports invented network progress. */
export function ArcadeProgress({stage,title,detail,elapsed,progress,actions,compact=false,overlay=false}:{
 stage:ArcadeStage;title?:string;detail?:string;elapsed?:number;progress?:Progress['progress'];actions?:ReactNode;compact?:boolean;overlay?:boolean;
}){
 const quantity=measuredProgress(progress),incident=stage==='error'||stage==='unavailable',complete=stage==='ready'||stage==='confirmed';
 const label=title??arcadeStageLabels[stage],filled=complete?16:quantity?Math.floor(16*quantity.completed/quantity.total):0;
 const seconds=elapsed===undefined?undefined:Math.max(0,Math.floor(elapsed));
 return <section className={`${styles.panel} ${compact?styles.compact:''} ${overlay?styles.overlay:''}`} role={incident?'alert':undefined} data-arcade-progress={stage} data-incident={incident} data-complete={complete} data-measured={!!quantity}>
  <div className={styles.caption}><span role={incident?undefined:'status'} aria-live={incident?undefined:'polite'}>{label}</span>
   {seconds!==undefined&&<span className={styles.clock} aria-label="Time waiting">{Math.floor(seconds/60)}:{String(seconds%60).padStart(2,'0')}</span>}
  </div>
  <div className={styles.track} role={incident?'img':'progressbar'} aria-label={label}
   aria-valuemin={incident?undefined:0} aria-valuemax={incident?undefined:quantity?.total??100}
   aria-valuenow={incident?undefined:complete?(quantity?.total??100):quantity?.completed}>
   <div className={styles.segments} aria-hidden="true">{Array.from({length:16},(_,i)=><i key={i} data-filled={i<filled} style={{'--segment':i} as CSSProperties}/>)}</div>
   {!incident&&!complete&&!quantity&&<span className={styles.ball} aria-hidden="true"/>}
  </div>
  <div className={styles.detail}>{detail&&<span>{detail}</span>}{quantity&&<span>{quantity.completed} / {quantity.total}</span>}</div>
  {actions&&<div className={styles.actions}>{actions}</div>}
 </section>;
}
