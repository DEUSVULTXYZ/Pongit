"use client";
import {useEffect,useRef,useState} from 'react';
import {LobbyClock,QueueElapsed} from '../../shared/lobby-clock';
export function useLobbyClock(){
 const clock=useRef(new LobbyClock()).current;
 const [now,setNow]=useState(()=>clock.now());
 useEffect(()=>{const t=setInterval(()=>setNow(clock.now()),250);return()=>clearInterval(t);},[clock]);
 return {now,clock};
}
export function useQueueElapsed(key:string|undefined,since:number,serverNow:number){
 const elapsed=useRef(new QueueElapsed()).current;
 return elapsed.sample(key,since,serverNow,performance.now());
}
