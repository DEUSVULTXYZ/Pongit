import { api, API, WS } from "./api";
import type { Deployment } from "../../shared/protocol";

/** Financial consumers may only use a settled result anchored to its deployment. */
export type EngineResult = {phase:"live";matchRef:string} | {phase:"settled";matchRef:string;winner:string;status:3|4;chainId:number;contract:string;block:string};
export interface GameTransport {
  readMatch(id:string):Promise<any>;
  readClock(id:string):Promise<{clock:string;head:string;observedAt:number}>;
  subscribe(onEvent:(event:any)=>void,onConnection:(connected:boolean)=>void):()=>void;
  confirmedResult(id:string,deployment:Deployment):Promise<EngineResult>;
}
export const monadTransport:GameTransport = {
  readMatch:id=>api(`/matches/${id}`),
  readClock:async id=>{const m=await api(`/matches/${id}`);return {clock:m.clock,head:m.head,observedAt:m.observedAt};},
  subscribe(onEvent,onConnection){const socket=new WebSocket(WS);socket.onopen=()=>onConnection(true);socket.onclose=()=>onConnection(false);socket.onmessage=e=>{try{onEvent(JSON.parse(e.data));}catch{}};return()=>socket.close();},
  async confirmedResult(id,d){const m=await api(`/matches/${id}?fresh=1`);const ref=`v${d.version || 1}:${id}`;return m.match.status>=3?{phase:"settled",matchRef:ref,winner:m.match.winner,status:m.match.status,chainId:d.chainId,contract:d.game,block:m.head}:{phase:"live",matchRef:ref};},
};
// Interlude is deliberately not selectable until SDK, operator expiry, settlement
// proofs and Monad financial contracts have been validated together.
