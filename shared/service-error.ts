import {engineReadRetryMs} from "./engine-read";
export class SessionUnavailable extends Error {code="SESSION_UNAVAILABLE";source="monad_rpc";constructor(){super("Session verification is temporarily unavailable. Your arcade session is still connected.");}}
export class SessionRejected extends Error {code="SESSION_REJECTED";source="pongit_api";}
export class EnginePublicationUnavailable extends Error {
 code="ENGINE_PUBLICATION_UNAVAILABLE";source="interlude_rpc";status=503;retryAt=Date.now()+30000;
 constructor(cause?:unknown){super("The game service has paused writes because publication failed. Your session is saved; retry after service recovery.",{cause});}
}
export function publicationUnavailable(error:unknown){
 for(let e=error as any,n=0;e&&n<8;e=e.cause,n++)if(e.code==="ENGINE_PUBLICATION_UNAVAILABLE" || /this session is over|node is no longer accepting transactions|commit relay failed/i.test(String(e.details||"")+" "+String(e.message||"")))return true;
 return false;
}
export function serviceError(error:unknown,requestId:string){
 if(publicationUnavailable(error)){const e=new EnginePublicationUnavailable(error);return {status:503,retryMs:30000,body:{error:e.message,code:e.code,source:e.source,retryAt:e.retryAt,requestId}};}
 const e=error as any,retryMs=engineReadRetryMs(e);
 let local=false;for(let x=e,i=0;x&&i<8;x=x.cause,i++)if(x.code==="ENGINE_COOLDOWN")local=true;
 const status=retryMs?429:e instanceof SessionUnavailable?503:e instanceof SessionRejected?401:400;
 return {status,retryMs,body:{error:retryMs?"The game node is busy. Waiting to synchronize.":String(e?.message||"Service unavailable").split("\n")[0],code:retryMs?(local?"ENGINE_COOLDOWN":"ENGINE_RATE_LIMIT"):e?.code||"REQUEST_REJECTED",source:retryMs?(local?"client_cooldown":"interlude_rpc"):e?.source||"pongit_api",retryAt:retryMs?Date.now()+retryMs:undefined,requestId}};
}
