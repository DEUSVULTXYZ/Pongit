"use client";
import {useEffect,useRef,useState} from 'react';
import {LobbyClock,QueueElapsed} from '../../shared/lobby-clock';
export function useLobbyClock(){
 const clock=useRef(new LobbyClock()).current;
 const [now,setNow]=useState(()=>clock.now());
 useEffect(()=>{const t=setInterval(()=>setNow(clock.now()),250);return()=>clearInterval(t);},[clock]);
 return {now,clock};
}
export function useQueueElapsed(key:string|undefined){
 const elapsed=useRef(new QueueElapsed()).current;
 const [,refresh]=useState(0);
 useEffect(()=>{if(!key)return;const t=setInterval(()=>refresh(n=>n+1),250);return()=>clearInterval(t);},[key]);
 return elapsed.sample(key,performance.now());
}
