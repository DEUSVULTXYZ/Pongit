"use client";
import {useEffect,useRef,type RefObject} from "react";

const stack:HTMLElement[]=[];
let unlock:()=>void=()=>{};
const inert=new Map<HTMLElement,boolean>();
function updateBackground(){
  const top=stack.at(-1);
  for(const child of Array.from(document.body.children) as HTMLElement[]){
    if(!inert.has(child))inert.set(child,child.inert);
    child.inert=!!top && !child.contains(top);
  }
  if(!top){for(const [el,value] of inert)el.inert=value;inert.clear();}
  window.dispatchEvent(new Event("pongit:overlay"));
}
/** All dialogs are portalled to body; only the top one handles focus and Escape. */
export function useDialog(ref:RefObject<HTMLElement|null>,active:boolean,close:()=>void){
  const closeRef=useRef(close);closeRef.current=close;
  useEffect(()=>{
    const el=ref.current;if(!active || !el)return;
    const previous=document.activeElement as HTMLElement|null;
    if(!stack.length){
      const body=document.body,root=document.documentElement,x=scrollX,y=scrollY;
      const saved=body.style.cssText,overflow=root.style.overflow;
      const gap=innerWidth-root.clientWidth;
      if(gap)body.style.paddingRight=`${parseFloat(getComputedStyle(body).paddingRight)+gap}px`;
      Object.assign(body.style,{position:"fixed",top:`-${y}px`,left:`-${x}px`,width:"100%",overflow:"hidden"});root.style.overflow="hidden";
      unlock=()=>{body.style.cssText=saved;root.style.overflow=overflow;window.scrollTo({left:x,top:y,behavior:"instant"});};
    }
    stack.push(el);updateBackground();
    const controls=()=>Array.from(el.querySelectorAll<HTMLElement>('button:not(:disabled),summary,a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')).filter(e=>e.getClientRects().length>0);
    (el.querySelector<HTMLElement>("[data-autofocus]")||controls()[0]||el).focus({preventScroll:true});
    const key=(event:KeyboardEvent)=>{
      if(stack.at(-1)!==el)return;
      // A native picker owns Escape until it closes; keep its parent dialog open.
      if(event.key==="Escape" && CSS.supports("selector(select:open)") && el.querySelector("select:open"))return;
      if(event.key==="Escape"){event.preventDefault();event.stopImmediatePropagation();closeRef.current();}
      if(event.key==="Tab"){
        const list=controls(),first=list[0],last=list.at(-1);
        if(!first){event.preventDefault();el.focus();}
        else if(event.shiftKey && (document.activeElement===first || !el.contains(document.activeElement))){event.preventDefault();last?.focus();}
        else if(!event.shiftKey && (document.activeElement===last || !el.contains(document.activeElement))){event.preventDefault();first.focus();}
      }
    };
    const focus=(event:FocusEvent)=>{if(stack.at(-1)===el && !el.contains(event.target as Node))(controls()[0]||el).focus({preventScroll:true});};
    document.addEventListener("keydown",key,true);document.addEventListener("focusin",focus);
    return()=>{
      document.removeEventListener("keydown",key,true);document.removeEventListener("focusin",focus);
      const index=stack.indexOf(el);if(index>=0)stack.splice(index,1);
      updateBackground();if(!stack.length)unlock();
      if(previous?.isConnected && !previous.closest('[inert]'))previous.focus({preventScroll:true});
    };
  },[active,ref]);
}
