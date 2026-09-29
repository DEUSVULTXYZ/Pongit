import styles from './AgentModeSwitch.module.css';

export function AgentModeSwitch({value,onChange,disabled=false,all=false}:{
 value:'all'|0|1;onChange:(value:'all'|0|1)=>void;disabled?:boolean;all?:boolean;
}){
 return <div className={styles.modes} role="group" aria-label="Game mode">
  {all&&<button type="button" aria-label="All live matches" aria-pressed={value==='all'} disabled={disabled} onClick={()=>onChange('all')} className={styles.all}>All matches</button>}
  {([0,1] as const).map(mode=><button type="button" key={mode} data-mode={mode===0?'classic':'chaos'}
   aria-label={mode===0?'Classic':'Chaos'} aria-pressed={value===mode} disabled={disabled} onClick={()=>onChange(mode)}>
   <svg aria-hidden="true" viewBox="0 0 32 32" shapeRendering="crispEdges">
    {mode===0?<><path d="M2 5h4v22H2zM26 5h4v22h-4z"/><path d="M13 13h6v6h-6z"/><path opacity=".4" d="M10 15h2v2h-2zM7 15h2v2H7z"/></>
     :<><path d="M17 1H9v14H4l9 16h8V17h7L17 1zm-2 6 6 8h-5v10l-5-8h4V7z"/><path opacity=".5" d="M1 2h3v3H1zM27 27h4v4h-4z"/></>}
   </svg><span><strong>{mode===0?'Classic':'Chaos'}</strong><small>{mode===0?'Pure paddle skill':'Wild arcade effects'}</small></span>
   <i aria-hidden="true"/>
  </button>)}
 </div>;
}
