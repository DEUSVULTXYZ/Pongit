import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { type Address, type Hex } from "viem";
import { arcadeGrantTypes, arcadeRevokeTypes, domain, type Deployment } from "../../shared/protocol";
import { api, relay } from "./api";
import { accountStub, type Identity } from "./wallet";

const storageKey="pongit:arcade-session:v3";
export type ArcadeSession={identity:Identity;player:Address;expires:number;game:Address;chainId:number;validate:()=>Promise<void>;end:()=>void};
type Stored={player:Address;key:Hex;expires:number;game:Address;chainId:number;credential?:Identity["credential"];grant:Record<string,string>;ownerSignature:Hex;keySignature:Hex};
let current:ArcadeSession|null=null;
let releaseControl:(()=>void)|undefined;
async function control(player:string,d:Deployment){
  if(releaseControl)return;
  if(!navigator.locks)throw new Error("This browser cannot safely control a shared arcade session. Update your browser.");
  await new Promise<void>((resolve,reject)=>{void navigator.locks.request(`pongit:${d.chainId}:${d.game.toLowerCase()}:${player.toLowerCase()}`,{ifAvailable:true},async lock=>{
    if(!lock){reject(new Error("Another tab controls this account. Close that tab and reload here."));return;}
    await new Promise<void>(release=>{releaseControl=release;resolve();});
  }).catch(reject);});
}
function install(data:Stored):ArcadeSession {
  const keyAccount=privateKeyToAccount(data.key);
  let alive=true;const lease=releaseControl;
  // Retain only a gameplay key. The remembered identity contains no wallet key.
  const identity:Identity={account:{...keyAccount,signMessage:async args=>{if(!alive || Date.now()/1000>=data.expires)throw new Error("Renew arcade session");return keyAccount.signMessage(args);},signTypedData:async args=>{if(!alive || Date.now()/1000>=data.expires)throw new Error("Renew arcade session");return keyAccount.signTypedData(args);}},local:false,end:()=>{alive=false;}};
  const result:ArcadeSession={identity,player:data.player,expires:data.expires,game:data.game,chainId:data.chainId,
    validate:async()=>{if(!alive || Date.now()/1000>=data.expires)throw new Error("Renew arcade session");const state=await api(`/arcade/${data.player}`);if(state.key.toLowerCase()!==keyAccount.address.toLowerCase() || Number(state.expires)<=state.serverTime)throw new Error("Arcade session expired or revoked. Renew arcade session.");},
    end:()=>{alive=false;lease?.();if(releaseControl===lease)releaseControl=undefined;if(current===result)current=null;}
  };current=result;return result;
}
export async function createArcade(owner:Identity,d:Deployment) {
  if(!d.arcade)throw new Error("Arcade registry unavailable");
  current?.end();await control(owner.account.address,d);
  try {
    const key=generatePrivateKey(),signer=privateKeyToAccount(key),state=await api(`/arcade/${owner.account.address}`);
    const expires=Number(state.serverTime)+7190;
    const grant={player:owner.account.address,key:signer.address,game:d.game,expires:BigInt(expires),nonce:BigInt(state.nonce)};
    const typed={domain:domain("PONGIT Arcade",d.chainId,d.arcade),types:arcadeGrantTypes,primaryType:"ArcadeGrant" as const,message:grant};
    const ownerSignature=await owner.account.signTypedData(typed),keySignature=await signer.signTypedData(typed);
    const data:Stored={player:owner.account.address,key,expires,game:d.game,chainId:d.chainId,credential:owner.credential,grant:JSON.parse(JSON.stringify(grant,(_,v)=>typeof v==="bigint"?String(v):v)),ownerSignature,keySignature};
    sessionStorage.setItem(storageKey,JSON.stringify(data));
    await relay({contract:"arcade",functionName:"register",args:[grant,ownerSignature,keySignature]});
    return install(data);
  } catch(e){releaseControl?.();releaseControl=undefined;throw e;}
}
export async function restoreArcade(d:Deployment):Promise<{session:ArcadeSession;owner:Identity}|null> {
  const raw=sessionStorage.getItem(storageKey);if(!raw || !d.arcade)return null;
  const data=JSON.parse(raw) as Stored;
  if(data.game.toLowerCase()!==d.game.toLowerCase() || data.chainId!==d.chainId || data.expires<=Date.now()/1000){clearArcade();return null;}
  await control(data.player,d);
  const session=install(data);
  try {await session.validate();return {session,owner:accountStub(data.player,data.credential)};}
  catch(e){session.end();sessionStorage.removeItem(storageKey);throw e;}
}
export function clearArcade(){current?.end();sessionStorage.removeItem(storageKey);sessionStorage.removeItem("pongit:pending-match");}
export async function revokeArcade(d:Deployment,session:ArcadeSession) {
  if(!d.arcade)return;
  const state=await api(`/arcade/${session.player}`);if(state.key.toLowerCase()!==session.identity.account.address.toLowerCase())return;
  const message={player:session.player,key:session.identity.account.address,nonce:BigInt(state.nonce),deadline:BigInt(state.serverTime+120)};
  const signature=await session.identity.account.signTypedData({domain:domain("PONGIT Arcade",d.chainId,d.arcade),types:arcadeRevokeTypes,primaryType:"ArcadeRevoke",message});
  await relay({contract:"arcade",functionName:"revoke",args:[message.player,message.key,message.nonce,message.deadline,signature]});
}
