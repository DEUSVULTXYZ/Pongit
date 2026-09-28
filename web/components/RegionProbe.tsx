'use client';
import {useEffect} from 'react';
import {usePathname} from 'next/navigation';
import {scheduleRegionProbe} from '../lib/region-probe';

/** Renders nothing: starts the sampled, background region probe once per page load. */
export function RegionProbe(){
 const path=usePathname();
 useEffect(()=>{
  if(path==='/')return scheduleRegionProbe(Math.random,()=>location.pathname==='/'&&!document.querySelector('canvas, .rooms-playing'));
 },[path]);
 return null;
}
