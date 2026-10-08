"use client";
import {useEffect,useRef,type ReactNode} from 'react';

/** Direction is still owned by the pointer handlers. A native non-passive
 * touch listener acknowledges this control gesture immediately; Chromium's
 * touch-start priority window must not defer live replies behind scrolling. */
export function TouchControls({children}:{children:ReactNode}){
 const ref=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const controls=ref.current;if(!controls)return;
  const consume=(event:TouchEvent)=>{if(event.cancelable)event.preventDefault();};
  controls.addEventListener('touchstart',consume,{passive:false});
  return()=>controls.removeEventListener('touchstart',consume);
 },[]);
 return <div className="touch-controls" ref={ref}>{children}</div>;
}
