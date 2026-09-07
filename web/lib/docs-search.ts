export type SearchEntry={href:string;page:string;section:string;keywords:string[];text:string};
const normalize=(s:string)=>s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"");
export function searchDocs(entries:SearchEntry[],query:string){
 const terms=normalize(query.trim()).split(/\s+/).filter(Boolean);
 if(!terms.length)return entries.filter(e=>e.section==="Overview").filter(e=>/first-match|passkeys|chaos|profile|payments|troubleshooting/.test(e.href)).slice(0,6).map(e=>({...e,excerpt:e.text.slice(0,180)}));
 return entries.map(e=>{const title=normalize(e.page),heading=normalize(e.section),keywords=normalize(e.keywords.join(" ")),text=normalize(e.text);let score=0;
  for(const t of terms){const value=(title.includes(t)?40:0)+(heading.includes(t)?30:0)+(keywords.includes(t)?12:0)+(text.includes(t)?4:0);if(!value)return null;score+=value;}
  const at=Math.max(0,text.indexOf(terms.find(t=>text.includes(t))||terms[0])-45);return {...e,score,excerpt:(at?"…":"")+e.text.slice(at,at+190)+(e.text.length>at+190?"…":"")};
 }).filter((e):e is NonNullable<typeof e>=>!!e).sort((a,b)=>b.score-a.score).slice(0,12);
}
