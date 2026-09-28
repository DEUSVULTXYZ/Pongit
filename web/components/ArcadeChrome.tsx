import Link from 'next/link';
import type {ReactNode} from 'react';
import styles from './ArcadeChrome.module.css';

export function ArcadeHeader({children}:{children:ReactNode}){
 return <header className={`rooms-header ${styles.header}`}><Link href="/" className="brand" aria-label="PONGIT home">
  <img className="brand-mark" src="/brand/opposing-orbits.webp" width="40" height="40" alt=""/><span className="brand-word">PONGIT</span>
 </Link><div className={`rooms-header-actions ${styles.actions}`}>{children}</div></header>;
}
export function ArcadeHeading({title,description,children}:{title:string;description:string;children?:ReactNode}){
 return <div className={`agent-heading ${styles.heading}`}><div><span className={styles.eyebrow}>PONGIT / ARCADE</span>
  <h1>{title}</h1><p>{description}</p></div>{children&&<div className={styles.headingActions}>{children}</div>}</div>;
}
export function ArcadeState({title,children,actions,alert=false}:{title:string;children?:ReactNode;actions?:ReactNode;alert?:boolean}){
 return <section className={`agent-empty ${styles.state}`} role={alert?'alert':'status'}><h2>{title}</h2>{children}{actions&&<div className={styles.stateActions}>{actions}</div>}</section>;
}
export function ArcadeAction({href,children}:{href:string;children:ReactNode}){
 return <Link className={styles.action} href={href}>{children}</Link>;
}
