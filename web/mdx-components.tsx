import type {MDXComponents} from "mdx/types";
import type {ReactNode,HTMLAttributes} from "react";
import {CopyHeading,CodeBlock} from "./components/docs/DocsControls";
import {docs} from "./lib/docs";
const text=(children:ReactNode):string=>typeof children==="string"||typeof children==="number"?String(children):Array.isArray(children)?children.map(text).join(""):children&&typeof children==="object"&&"props" in children?text((children.props as {children:ReactNode}).children):"section";
function Heading({level,id,children,...props}:HTMLAttributes<HTMLHeadingElement>&{level:2|3|4}){const Tag=`h${level}` as "h2"|"h3"|"h4";return <Tag id={id} {...props}>{children}{id&&<CopyHeading id={id} label={text(children)}/>}</Tag>;}
function ContractTable(){
 const versions=[{name:`Rooms · Rules ${docs.rooms.rulesVersion}`,chainId:docs.rooms.chainId,startBlock:docs.rooms.startBlock,addresses:docs.rooms.addresses},...docs.contracts.map(d=>({name:`V${d.version} · ${d.version===4?'Previous arcade':'Archive'}`,chainId:d.chainId,startBlock:d.startBlock,addresses:d.addresses}))];
 return <div className="docs-contracts">{versions.map(d=><section key={d.name}><h3>{d.name}</h3><p>Chain {d.chainId}{d.startBlock&&<> · Index start block {d.startBlock}</>}</p><div className="docs-table-wrap" tabIndex={0} role="region" aria-label={`${d.name} contract addresses`}><table><thead><tr><th>Contract</th><th>Address</th></tr></thead><tbody>{d.addresses.map(a=><tr key={a.name}><td>{a.name}</td><td><a href={`https://testnet.monadscan.com/address/${a.address}`} target="_blank" rel="noopener noreferrer"><code>{a.address}</code></a></td></tr>)}</tbody></table></div></section>)}</div>;
}
function ArchitectureDiagram(){return <figure className="docs-diagram"><div><strong>01 / Browser</strong><span>Passkey · controls · preview</span></div><b aria-hidden="true">↓ signed requests</b><div><strong>02 / Relayer</strong><span>Validation · journal · receipts</span></div><b aria-hidden="true">↓ transactions</b><div><strong>03 / Monad contracts</strong><span>Physics · results · balances</span></div><b aria-hidden="true">↓ confirmed events</b><div><strong>04 / Envio</strong><span>History · replays · payment discovery</span></div><figcaption>Confirmed data returns to the app. The relayer verifies payment candidates against the contracts.</figcaption></figure>;}
export function useMDXComponents():MDXComponents{return {
 h2:p=><Heading level={2} {...p}/>,h3:p=><Heading level={3} {...p}/>,h4:p=><Heading level={4} {...p}/>,
 a:({href,children,...p})=><a {...p} href={href} {...(href?.startsWith("https://")?{target:"_blank",rel:"noopener noreferrer"}:{})}>{children}</a>,
 pre:({children})=><CodeBlock>{children}</CodeBlock>,
 table:({children})=><div className="docs-table-wrap" role="region" aria-label="Reference table" tabIndex={0}><table>{children}</table></div>,
 img:({src,alt})=><img className="docs-screenshot" src={typeof src==="string"?src:undefined} alt={alt||""} loading="lazy" decoding="async"/>,
 Callout:({title,children}:{title:string;children:ReactNode})=><aside className="docs-callout"><strong>{title}</strong><div>{children}</div></aside>,ContractTable,ArchitectureDiagram,
};}
