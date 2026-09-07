import Link from "next/link";
import type {ReactNode} from "react";
import {docs,type DocPage} from "../../lib/docs";
import {OnThisPage} from "./DocsControls";
export function DocsArticle({page,children}:{page:DocPage;children:ReactNode}){
 const i=docs.pages.findIndex(p=>p.slug===page.slug),previous=docs.pages[i-1],next=docs.pages[i+1];
 return <div className="docs-reading-layout"><main id="docs-content" className="docs-content" tabIndex={-1}><div className="docs-breadcrumb"><Link href="/docs">Docs</Link><span>/</span><span>{page.group}</span></div><header className="docs-article-header"><p className="docs-eyebrow">{page.group}</p><h1>{page.title}</h1><p>{page.description}</p></header><div className="docs-prose">{children}</div><div className="docs-article-meta"><span>Last reviewed {new Date(page.updated+"T12:00:00Z").toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric",timeZone:"UTC"})}</span><a href={`https://github.com/DEUSVULTXYZ/Pongit/blob/main/web/content/docs/${page.slug}.mdx`} target="_blank" rel="noopener noreferrer">View source on GitHub ↗</a></div><nav className="docs-pagination" aria-label="Adjacent articles">{previous?<Link href={`/docs/${previous.slug}`}><small>← Previous</small><strong>{previous.title}</strong></Link>:<span/>}{next&&<Link href={`/docs/${next.slug}`}><small>Next →</small><strong>{next.title}</strong></Link>}</nav></main><OnThisPage headings={page.headings}/></div>;
}
