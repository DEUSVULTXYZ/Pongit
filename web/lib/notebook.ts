import { getPasskeyPrfOutput } from "@category-labs/mera";
import type { Identity } from "./wallet";
import type { NotebookData } from "../../shared/social";

const utf8 = new TextEncoder();
export const notebookNamespace = "pongit.xyz/notebook/v1";
export async function notebookKeyFromPrf(prf: Uint8Array<ArrayBuffer>) {
  try {
    const material = await crypto.subtle.importKey("raw", prf, "HKDF", false, ["deriveKey"]);
    return await crypto.subtle.deriveKey({name:"HKDF",hash:"SHA-256",salt:utf8.encode(notebookNamespace),info:utf8.encode("PONGIT notebook AES-GCM encryption")}, material, {name:"AES-GCM",length:256}, false, ["encrypt","decrypt"]);
  } finally { prf.fill(0); }
}
export async function unlockNotebook(identity: Identity) {
  if (!identity.credential) throw new Error("The private notebook requires a PRF-compatible passkey.");
  const prfSalt = new Uint8Array(await crypto.subtle.digest("SHA-256", utf8.encode(notebookNamespace)));
  const result = await getPasskeyPrfOutput({rpId:process.env.NEXT_PUBLIC_RP_ID || location.hostname,credential:identity.credential,prfSalt});
  if(result.credentialId!==identity.credential.credentialId) { result.prfOutput.fill(0); throw new Error("Choose the connected passkey."); }
  return notebookKeyFromPrf(result.prfOutput);
}
const b64 = (bytes:Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
const bytes = (value:string) => Uint8Array.from(atob(value.replace(/-/g,"+").replace(/_/g,"/")),c=>c.charCodeAt(0));
const aad = (player:string) => utf8.encode(`${notebookNamespace}:${player.toLowerCase()}`);
export async function encryptNotebook(key:CryptoKey,player:string,data:NotebookData) {
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const plain=utf8.encode(JSON.stringify(data));
  try { return {iv:b64(iv),ciphertext:b64(new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv,additionalData:aad(player)},key,plain)))}; }
  finally {plain.fill(0);}
}
export async function decryptNotebook(key:CryptoKey,player:string,record:{iv:string,ciphertext:string}):Promise<NotebookData> {
  const plain=new Uint8Array(await crypto.subtle.decrypt({name:"AES-GCM",iv:bytes(record.iv),additionalData:aad(player)},key,bytes(record.ciphertext)));
  try {
    const data=JSON.parse(new TextDecoder().decode(plain));
    if(data.version!==1 || !Array.isArray(data.rivals) || !Array.isArray(data.notes) || !data.settings) throw new Error("Unsupported notebook version");
    return data;
  } finally {plain.fill(0);}
}
