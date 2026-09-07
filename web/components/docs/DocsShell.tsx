"use client";
import { IconButton } from "../IconButton";

import Link from "next/link";
import {usePathname} from "next/navigation";
import {useEffect,useState,type ReactNode} from "react";
import {DocsModal} from "./DocsControls";
import {DocsSearch} from "./DocsSearch";
type Page={slug:string;title:string;group:string};
export function DocsShell({groups,pages,children}:{groups:string[];pages:Page[];children:ReactNode}){
 const pathname=usePathname(),[menu,setMenu]=useState(false),[search,setSearch]=useState(false);
 useEffect(()=>{setMenu(false);setSearch(false);},[pathname]);
 useEffect(()=>{const visibility=()=>{document.documentElement.dataset.tabHidden=String(document.hidden);};visibility();document.addEventListener("visibilitychange",visibility);return()=>{document.removeEventListener("visibilitychange",visibility);delete document.documentElement.dataset.tabHidden;};},[]);
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"){e.preventDefault();setMenu(false);setSearch(true);}};document.addEventListener("keydown",key);return()=>document.removeEventListener("keydown",key);},[]);
 const nav=<nav aria-label="Documentation chapters"><Link className={`docs-overview-link ${pathname==="/docs"?"selected":""}`} href="/docs" aria-current={pathname==="/docs"?"page":undefined} onClick={()=>setMenu(false)}>Documentation home <span>↗</span></Link>{groups.map(group=><section key={group}><h2>{group}</h2><ul>{pages.filter(p=>p.group===group).map(p=><li key={p.slug}><Link href={`/docs/${p.slug}`} aria-current={pathname===`/docs/${p.slug}`?"page":undefined} onClick={()=>setMenu(false)}>{p.title}</Link></li>)}</ul></section>)}<p className="docs-nav-note"><span/>Monad Testnet · V4</p></nav>;
 return <div className="docs-site"><a className="docs-skip" href="#docs-content">Skip to content</a><header className="docs-header"><Link className="docs-brand" href="/docs" aria-label="PONGIT documentation home"><img src="/brand/opposing-orbits.webp" width="34" height="34" alt=""/><span>PONGIT<small>DOCUMENTATION</small></span></Link><button className="docs-search-trigger" onClick={()=>{setMenu(false);setSearch(true);}} aria-label="Search documentation"><span>⌕</span><span>Search the docs</span><kbd>⌘ K</kbd></button><a className="docs-github" href="https://github.com/DEUSVULTXYZ/Pongit" target="_blank" rel="noopener noreferrer">GitHub ↗</a><Link className="docs-back" href="/" prefetch={false}>Back to arcade <span>↗</span></Link></header><div className="docs-mobile-bar"><button aria-label="Open documentation menu" aria-expanded={menu} onClick={()=>setMenu(true)}>☰ <span>Browse guides</span></button><span>V4 · Testnet</span></div><div className="docs-layout"><aside className="docs-sidebar">{nav}</aside>{children}</div><footer className="docs-footer"><span>PONGIT / ONE MORE GAME.</span><span>Public documentation · Monad Testnet · <a href="https://github.com/DEUSVULTXYZ/Pongit" target="_blank" rel="noopener noreferrer">GitHub ↗</a></span></footer>{menu&&<DocsModal label="Documentation menu" close={()=>setMenu(false)} className="docs-nav-modal"><div className="docs-modal-title"><strong>Browse documentation</strong><IconButton aria-label="Close documentation menu" onClick={()=>setMenu(false)}/></div>{nav}</DocsModal>}{search&&<DocsSearch close={()=>setSearch(false)}/>}</div>;
}
