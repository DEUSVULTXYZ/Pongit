"use client";
import { IconButton } from "./IconButton";

import {useRef,type ReactNode,type RefObject} from "react";
import {createPortal} from "react-dom";
import {useDialog} from "../lib/dialog";
import styles from "./Dialog.module.css";

export function Dialog({label,children,onClose,className="",backdropClass="",returnFocus}:{label:string;children:ReactNode;onClose:()=>void;className?:string;backdropClass?:string;returnFocus?:RefObject<HTMLElement|null>}){
  const ref=useRef<HTMLElement>(null);useDialog(ref,true,onClose,returnFocus);
  return createPortal(<div className={`modal-backdrop cabinet-dialog ${styles.backdrop} ${backdropClass}`} onClick={e=>{if(e.target===e.currentTarget)onClose();}}><section ref={ref} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} className={`connect-modal ${styles.panel} ${className}`}>{children}</section></div>,document.body);
}

export function CabinetTools({modal,open,onClose,children}:{modal:boolean;open:boolean;onClose:()=>void;children:ReactNode}){
  if(modal)return open?<Dialog label="Cabinet tools" onClose={onClose} className="cabinet-tools-dialog"><IconButton className="modal-close" aria-label="Close cabinet tools" onClick={onClose}/>{children}</Dialog>:null;
  return <aside className="cabinet-tools">{children}</aside>;
}
