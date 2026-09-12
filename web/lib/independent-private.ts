import {getPasskeyPrfOutput} from '@category-labs/mera';
import {encodeAbiParameters,encodeFunctionData,keccak256,zeroAddress,bytesToHex,hexToBytes,type Address,type Hex,type Abi} from 'viem';
import {abi} from '../../shared/abi-independent-PrivateDataStore';
import {namespaceHash,privateNamespaces,privateKeyFromPrf,encryptPrivate,decryptPrivate,restoreCiphertext,saveEncryptedChunks,type UploadPort} from '../../shared/authority-private';
import {ownerWriteTypes,type IndependentManifest} from '../../shared/independent';
import {independentBase,sponsorCall,resumeSponsored,withOwner} from './independent';
import {api,appApi} from './api';
import {emptyNotebook} from '../../shared/social';
import {decryptNotebook} from './notebook';

type Kind=keyof typeof privateNamespaces;
const uploadKey=(m:IndependentManifest,player:Address,kind:Kind)=>`pongit:encrypted-upload:${m.privateData.toLowerCase()}:${player.toLowerCase()}:${kind}`;
export function discardIndependentUpload(m:IndependentManifest,player:Address,kind:Kind){sessionStorage.removeItem(uploadKey(m,player,kind));}
export async function unlockIndependentPrivate(m:IndependentManifest,player:Address,kind:Kind){
 return withOwner(player,async identity=>{
  if(!identity.credential)throw Error('Use a PRF-compatible passkey');
  const salt=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(privateNamespaces[kind])));
  const prf=await getPasskeyPrfOutput({rpId:process.env.NEXT_PUBLIC_RP_ID||location.hostname,credential:identity.credential,prfSalt:salt});
  if(prf.credentialId!==identity.credential.credentialId){prf.prfOutput.fill(0);throw Error('Use the connected passkey');}
  const key=await privateKeyFromPrf(prf.prfOutput,kind),record=await readPrivateRecord(m,player,kind);
  const pending=sessionStorage.getItem(uploadKey(m,player,kind));
  let conflict=false;
  if(pending){const p=JSON.parse(pending);
   if(record&&record.upload===p.id&&record.revision===BigInt(p.revision)+1n)discardIndependentUpload(m,player,kind);
   else if(BigInt(p.revision)===(record?.revision??0n))return {key,data:await decryptPrivate(key,kind,player,p.iv,new Uint8Array(hexToBytes(p.ciphertext))),revision:BigInt(p.revision),imported:false,resumable:true};
   else conflict=true;
  }
  if(record)return {key,data:await decryptPrivate(key,kind,player,record.iv,new Uint8Array(record.ciphertext)),revision:record.revision,imported:false,conflict};
  // Existing private data is read only after an owner-signed app authentication.
  // It remains in its original store until the owner explicitly saves the encrypted copy.
  const challenge=await api('/auth/challenge',{player});
  const signature=await identity.account.signMessage({message:challenge.message});
  await api('/auth/session',{player,nonce:challenge.nonce,signature});
  if(kind==='notebook'){
   const old=await appApi('/notebook','GET',undefined,player);
   return {key,data:old.ciphertext?await decryptNotebook(key,player,old):emptyNotebook(),revision:0n,imported:!!old.ciphertext};
  }
  const old=await appApi('/independent/import/contacts','GET',undefined,player);
  return {key,data:{version:1,contacts:old.contacts.map((address:string)=>({address,addedAt:Date.now()}))},revision:0n,imported:old.contacts.length>0};
 });
}
const read=(m:IndependentManifest,name:string,args:readonly unknown[]=[]):Promise<any>=>independentBase().readContract({address:m.privateData,abi:abi as Abi,functionName:name,args});
async function readPrivateRecord(m:IndependentManifest,player:Address,kind:Kind){
 const [revision,upload]=await read(m,'heads',[player,namespaceHash(kind)]);if(!revision)return null;
 const u=await read(m,'uploads',[upload]);
 if(!u[10]||u[0].toLowerCase()!==player.toLowerCase()||u[1]!==namespaceHash(kind))throw Error('Encrypted backup identity mismatch');
 const chunks=await Promise.all(Array.from({length:Number(u[9])},(_,i)=>read(m,'chunk',[upload,i])));
  return {revision:BigInt(revision),upload,iv:u[4] as Hex,ciphertext:restoreCiphertext(chunks,u[3])};
}
export async function saveIndependentPrivate(m:IndependentManifest,player:Address,kind:Kind,key:CryptoKey,data:unknown,revision:bigint,progress:(done:number,total:number)=>void){
 await resumeSponsored(m);
 const storage=uploadKey(m,player,kind),namespace=namespaceHash(kind);
 let pending:any;try{pending=JSON.parse(sessionStorage.getItem(storage)||'null');}catch{}
 if(pending){
  const earlier=await decryptPrivate(key,kind,player,pending.iv,new Uint8Array(hexToBytes(pending.ciphertext)));
  if(JSON.stringify(earlier)!==JSON.stringify(data))throw Error('Finish the pending encrypted save first. Reload this panel to recover its edits.');
  const head=await read(m,'heads',[player,namespace]);
  if(head[1]===pending.id&&BigInt(head[0])===BigInt(pending.revision)+1n){sessionStorage.removeItem(storage);return BigInt(head[0]);}
  if(BigInt(pending.revision)!==revision)throw Error('This backup changed. Reload the saved copy before starting another upload.');
 }else{const encrypted=await encryptPrivate(key,kind,player,data);pending={ciphertext:bytesToHex(encrypted.ciphertext),iv:encrypted.iv,revision:String(revision)};sessionStorage.setItem(storage,JSON.stringify(pending));}
 // Only authenticated ciphertext, IV and public upload metadata survive F5.
 if(pending.id&&(await read(m,'uploads',[pending.id]))[0]===zeroAddress){delete pending.id;sessionStorage.setItem(storage,JSON.stringify(pending));}
 const port:UploadPort={player,namespace,
  currentRevision:async()=>BigInt((await read(m,'heads',[player,namespace]))[0]),
  currentUpload:async()=>(await read(m,'heads',[player,namespace]))[1],
  bitmap:async id=>Number((await read(m,'uploads',[id]))[8]),
  upload:async id=>{const u=await read(m,'uploads',[id]);return {player:u[0],namespace:u[1],root:u[2],dataHash:u[3],iv:u[4],size:u[7],expected:u[5]};},
  begin:async(p,iv,expected)=>withOwner(player,async identity=>{
   const nonce=await read(m,'writeNonces',[player]),deadline=(await independentBase().getBlock()).timestamp+180n;
   const selector=encodeFunctionData({abi,functionName:'begin',args:[player,namespace,expected,p.root,p.dataHash,iv,p.size,nonce,deadline,'0x']}).slice(0,10) as Hex;
   const action=keccak256(encodeAbiParameters([{type:'bytes4'},{type:'bytes32'},{type:'uint64'},{type:'bytes32'},{type:'bytes32'},{type:'bytes12'},{type:'uint32'}],[selector,namespace,expected,p.root,p.dataHash,iv,p.size]));
   const signature=await identity.account.signTypedData({domain:{name:'PONGIT Private Data',version:'1',chainId:10143,verifyingContract:m.privateData},types:ownerWriteTypes,primaryType:'OwnerWrite',message:{player,action,nonce,deadline}});
   const id=keccak256(encodeAbiParameters([{type:'address'},{type:'address'},{type:'bytes32'},{type:'uint256'},{type:'bytes32'}],[m.privateData,player,namespace,nonce,action]));
   pending.id=id;sessionStorage.setItem(storage,JSON.stringify(pending));
   await sponsorCall(m,m.privateData,encodeFunctionData({abi,functionName:'begin',args:[player,namespace,expected,p.root,p.dataHash,iv,p.size,nonce,deadline,signature]}));return id;
  }),
  put:async(id,c)=>{await sponsorCall(m,m.privateData,encodeFunctionData({abi,functionName:'put',args:[id,c.index,c.data,c.proof]}));},
  commit:async id=>{await sponsorCall(m,m.privateData,encodeFunctionData({abi,functionName:'commit',args:[id]}));},
 };
 await saveEncryptedChunks(port,hexToBytes(pending.ciphertext),pending.iv,revision,progress,undefined,pending.id);
 sessionStorage.removeItem(storage);
 return revision+1n;
}
