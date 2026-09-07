import type {Metadata} from "next";
import {DocsShell} from "../../components/docs/DocsShell";
import {docs} from "../../lib/docs";
import "./docs.css";
export const metadata:Metadata={title:{default:"PONGIT Docs | Play, learn, explore",template:"%s | PONGIT Docs"},description:"Guides for PONGIT players and builders: passkeys, Classic, Chaos, challenges, test-MON betting, payouts and the onchain architecture."};
export default function DocsLayout({children}:{children:React.ReactNode}){return <DocsShell groups={docs.groups} pages={docs.pages.map(({slug,title,group})=>({slug,title,group}))}>{children}</DocsShell>;}
