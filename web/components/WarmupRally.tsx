'use client';
import {useEffect,useRef,useState} from 'react';
import {HEIGHT,HALF_PADDLE,RADIUS,SCALE,WIDTH} from '../../shared/physics-v2';
import {newWarmup,stepWarmup,type Warmup} from '../lib/warmup';

const px=(v:bigint)=>Number(v/SCALE);
const W=px(WIDTH),H=px(HEIGHT);

/** Practice against the house bot while an arena gets ready. Local only: no
 * account, no network, no ranking. W / S or ↑ / ↓, or drag on the court. */
export function WarmupRally({onClose}:{onClose?:()=>void}){
 const canvas=useRef<HTMLCanvasElement>(null);
 const [score,setScore]=useState<[number,number]>([0,0]);
 const [result,setResult]=useState('');
 useEffect(()=>{
  const c=canvas.current,ctx=c?.getContext('2d');if(!c||!ctx)return;
  let w:Warmup=newWarmup(),frame=0,last=performance.now(),restartAt=0,pointerY:number|null=null;
  const keys=new Set<string>(),up=new Set(['w','arrowup']),down=new Set(['s','arrowdown']);
  const key=(e:KeyboardEvent,on:boolean)=>{
   const k=e.key.toLowerCase();if(!up.has(k)&&!down.has(k))return;
   if((e.target as HTMLElement).closest('input,textarea,select,[contenteditable=true]'))return;
   e.preventDefault();if(on)keys.add(k);else keys.delete(k);
  };
  const kd=(e:KeyboardEvent)=>key(e,true),ku=(e:KeyboardEvent)=>key(e,false),blur=()=>keys.clear();
  const pointer=(e:PointerEvent)=>{const r=c.getBoundingClientRect();pointerY=(e.clientY-r.top)/r.height*H;};
  const drag=(e:PointerEvent)=>{if(pointerY!==null)pointer(e);},release=()=>{pointerY=null;};
  const pointers:[string,(e:PointerEvent)=>void][]=[['pointerdown',pointer],['pointermove',drag],['pointerup',release],['pointercancel',release],['pointerleave',release]];
  window.addEventListener('keydown',kd);window.addEventListener('keyup',ku);window.addEventListener('blur',blur);
  for(const [type,listener] of pointers)c.addEventListener(type,listener as EventListener);
  const draw=()=>{
   const s=w.state;ctx.clearRect(0,0,W,H);
   ctx.fillStyle='#697a8f';for(let y=8;y<H;y+=24)ctx.fillRect(W/2-1,y,2,12);
   ctx.fillStyle='#e5e1ff';ctx.fillRect(22,px(s.left-HALF_PADDLE),12,px(2n*HALF_PADDLE));
   ctx.fillStyle='#b68aff';ctx.fillRect(W-34,px(s.right-HALF_PADDLE),12,px(2n*HALF_PADDLE));
   ctx.fillStyle='#84efff';ctx.beginPath();ctx.arc(px(s.x),px(s.y),px(RADIUS),0,Math.PI*2);ctx.fill();
  };
  const tick=(now:number)=>{
   const ms=now-last;last=now;
   if(restartAt&&now>=restartAt){w=newWarmup();restartAt=0;setResult('');setScore([0,0]);}
   if(!restartAt){
    const held=[...keys].some(k=>up.has(k))?-1:[...keys].some(k=>down.has(k))?1:0;
    const follow=pointerY===null?0:pointerY<px(w.state.left)-6?-1:pointerY>px(w.state.left)+6?1:0;
    const before=w.state;w=stepWarmup(w,ms,held||follow);
    if(w.state.scoreA!==before.scoreA||w.state.scoreB!==before.scoreB)setScore([w.state.scoreA,w.state.scoreB]);
    if(w.state.finished){setResult(w.state.scoreA>w.state.scoreB?'You win the warm-up':'The bot takes this one');restartAt=now+2500;}
   }
   draw();frame=requestAnimationFrame(tick);
  };
  frame=requestAnimationFrame(tick);
  return()=>{
   cancelAnimationFrame(frame);window.removeEventListener('keydown',kd);window.removeEventListener('keyup',ku);window.removeEventListener('blur',blur);
   for(const [type,listener] of pointers)c.removeEventListener(type,listener as EventListener);
  };
 },[]);
 return <section className="warmup-rally court-card" aria-label="Warm-up rally">
  <div className="warmup-head"><small>WARM-UP · NOT RANKED</small><span className="warmup-score">{String(score[0]).padStart(2,'0')} : {String(score[1]).padStart(2,'0')}</span>{onClose&&<button onClick={onClose}>Close</button>}</div>
  <div className="warmup-canvas"><canvas ref={canvas} width={W} height={H}/>{result&&<div className="rooms-serve-status" role="status">{result}</div>}</div>
  <p className="rooms-caption">W / S · ↑ / ↓ · or drag on the court. Your match starts as soon as it is ready.</p>
 </section>;
}
