"use client";
import {useEffect} from "react";

/** Visibility gates CSS sprites; no timer or animation frame loop competes with Court. */
export function PixelMotion() {
  useEffect(()=>{
    const ornaments=new Set<Element>();
    const observer=new IntersectionObserver(entries=>{
      for(const entry of entries)(entry.target as HTMLElement).dataset.pixelVisible=String(entry.isIntersecting);
    },{threshold:0});
    const scan=()=>{
      for(const element of ornaments)if(!element.isConnected){observer.unobserve(element);ornaments.delete(element);}
      document.querySelectorAll('.cabinet-ui .pixel-ornament:not([data-still]),.cabinet-dialog .pixel-ornament:not([data-still])').forEach(element=>{
        if(!ornaments.has(element)){ornaments.add(element);observer.observe(element);}
      });
    };
    scan();
    const mutations=new MutationObserver(records=>{if(records.some(r=>r.addedNodes.length || r.removedNodes.length))scan();});
    mutations.observe(document.body,{childList:true,subtree:true});
    return()=>{observer.disconnect();mutations.disconnect();};
  },[]);
  return null;
}
