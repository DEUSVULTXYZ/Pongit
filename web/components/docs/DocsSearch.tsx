"use client";
import {useEffect,useRef,useState} from "react";
import {useRouter} from "next/navigation";
import {DocsModal} from "./DocsControls";
import {searchDocs,type SearchEntry} from "../../lib/docs-search";

let cached:Promise<SearchEntry[]>|undefined;
export function DocsSearch({close}:{close:()=>void}){
 const router=useRouter(),[query,setQuery]=useState(""),[data,setData]=useState<SearchEntry[]>([]),[error,setError]=useState(false),[active,setActive]=useState(0),list=useRef<HTMLUListElement>(null);
 const load=()=>{setError(false);cached ||= fetch("/search/docs-v1.json").then(r=>{if(!r.ok)throw Error("search");return r.json();}).catch(e=>{cached=undefined;throw e;});return cached;};
 useEffect(()=>{let alive=true;load().then(d=>{if(alive)setData(d);}).catch(()=>{if(alive)setError(true);});return()=>{alive=false;};},[]);
 const results=searchDocs(data,query);useEffect(()=>setActive(0),[query]);
 useEffect(()=>{list.current?.children[active]?.scrollIntoView({block:"nearest"});},[active]);
 function go(href:string){close();router.push(href);}
 return <DocsModal label="Search documentation" close={close} className="docs-search-modal"><div className="docs-search-input"><span aria-hidden="true">⌕</span><input data-autofocus aria-label="Search documentation" placeholder="Search rules, payments, passkeys…" maxLength={120} value={query} role="combobox" aria-expanded="true" aria-controls="docs-search-results" aria-autocomplete="list" aria-activedescendant={results[active]?`docs-search-result-${active}`:undefined} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(["ArrowDown","ArrowUp"].includes(e.key)){e.preventDefault();if(results.length)setActive(n=>(n+(e.key==="ArrowDown"?1:-1)+results.length)%results.length);}if(e.key==="Enter"&&results[active]){e.preventDefault();go(results[active].href);}}}/><button aria-label="Close search" onClick={close}>Esc</button></div><p className="docs-search-hint" role="status">{error?"Search could not load.":!data.length?"Loading search…":query.trim()?`${results.length} results`:"Popular guides"}</p>{error?<button className="docs-retry" onClick={()=>void load().then(setData).catch(()=>setError(true))}>Retry search</button>:<ul id="docs-search-results" ref={list} role="listbox" className="docs-search-results">{results.map((r,i)=><li key={r.href} role="option" id={`docs-search-result-${i}`} aria-selected={active===i}><a href={r.href} tabIndex={-1} onMouseEnter={()=>setActive(i)} onClick={e=>{e.preventDefault();go(r.href);}}><span>{r.page}</span><strong>{r.section}</strong><small>{r.excerpt}</small></a></li>)}</ul>}{!error&&!!data.length&&!results.length&&<div className="docs-search-empty"><strong>No results for “{query}”</strong><p>Try a feature name such as “Chaos”, “payout” or “passkey”. You can also browse the sidebar.</p></div>}<div className="docs-search-footer">↑ ↓ to navigate <span>Enter to open · Esc to close</span></div></DocsModal>;
}
