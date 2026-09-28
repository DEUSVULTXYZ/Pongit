'use client';
import {useEffect} from 'react';
import {scheduleRegionProbe} from '../lib/region-probe';

/** Renders nothing: starts the sampled, background region probe once per page load. */
export function RegionProbe(){
 useEffect(()=>{if(!location.pathname.startsWith('/docs'))return scheduleRegionProbe();},[]);
 return null;
}
