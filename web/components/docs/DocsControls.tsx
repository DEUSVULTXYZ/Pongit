"use client";
import {useEffect,useRef,useState,type ReactNode} from "react";
import {createPortal} from "react-dom";
import {useDialog} from "../../lib/dialog";

export function DocsModal({label,close,children,className=""}:{label:string;close:()=>void;children:ReactNode;className?:string}){
 const ref=useRef<HTMLElement>(null);useDialog(ref,true,close);
 return createPortal(<div className="docs-overlay" onClick={e=>{if(e.target===e.currentTarget)close();}}><section ref={ref} className={`docs-modal ${className}`} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>{children}</section></div>,document.body);
}
export function CopyHeading({id,label}:{id:string;label:string}){
 const [message,setMessage]=useState("");
 async function copy(){try{await navigator.clipboard.writeText(`${location.origin}${location.pathname}#${id}`);setMessage("Section link copied");}catch{setMessage("Copy unavailable. Use the address bar after opening this section.");}setTimeout(()=>setMessage(""),2500);}
 return <><a className="docs-heading-anchor" href={`#${id}`} aria-label={`Link to ${label}`} onClick={()=>void copy()}>#</a><span className="docs-sr-only" role="status">{message}</span></>;
}
export function CodeBlock({children}:{children:ReactNode}){
 const ref=useRef<HTMLPreElement>(null),[copied,setCopied]=useState(false),[error,setError]=useState("");
 async function copy(){try{await navigator.clipboard.writeText(ref.current?.textContent||"");setCopied(true);setError("");setTimeout(()=>setCopied(false),1800);}catch{setError("Select the code to copy it manually.");}}
 return <div className="docs-code"><button type="button" onClick={()=>void copy()}>{copied?"Copied":"Copy code"}</button><pre ref={ref}>{children}</pre><span role="status" className="docs-code-status">{error}</span></div>;
}
export function OnThisPage({headings}:{headings:{id:string;text:string;level:number}[]}){
 const [active,setActive]=useState(""),disclosure=useRef<HTMLDetailsElement>(null);
 useEffect(()=>{const update=()=>{let id=headings[0]?.id||"";for(const h of headings){const el=document.getElementById(h.id);if(el&&el.getBoundingClientRect().top<=150)id=h.id;}setActive(id);};update();window.addEventListener("scroll",update,{passive:true});return()=>window.removeEventListener("scroll",update);},[headings]);
 const links=<ul>{headings.filter(h=>h.level<=3).map(h=><li key={h.id} data-depth={h.level}><a href={`#${h.id}`} aria-current={active===h.id?"location":undefined}>{h.text}</a></li>)}</ul>;
 return <aside className="docs-toc" aria-label="On this page"><div className="docs-toc-desktop"><strong>On this page</strong>{links}</div><details ref={disclosure} className="docs-toc-mobile" onKeyDown={e=>{if(e.key==="Escape"&&disclosure.current?.open){e.preventDefault();disclosure.current.open=false;disclosure.current.querySelector("summary")?.focus();}}}><summary>On this page</summary>{links}</details></aside>;
}
