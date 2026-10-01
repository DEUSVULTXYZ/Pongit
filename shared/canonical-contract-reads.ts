import type {Abi,Address,Hex,PublicClient} from 'viem';

export type ContractRead={address:Address;abi:Abi;functionName:string;args?:readonly unknown[]};

/** Coalesce one snapshot's independent reads, always at its canonical hash.
 * No latest-block fallback, cross-snapshot cache, or inferred empty result.
 * A short batch avoids turning catalogue/history reads into huge EVM calls. */
export function canonicalContractReads(client:PublicClient,blockHash:Hex){
 const batch=async(contracts:readonly ContractRead[]):Promise<unknown[]>=>{
  const chunks:Promise<unknown[]>[]=[];
  for(let i=0;i<contracts.length;i+=32)chunks.push(client.multicall({
   contracts:contracts.slice(i,i+32),blockHash,requireCanonical:true,allowFailure:false,batchSize:0,
  }) as Promise<unknown[]>);
  return(await Promise.all(chunks)).flat();
 };
 let queued:{call:ContractRead;resolve:(value:any)=>void;reject:(error:unknown)=>void}[]=[];
 const read=<R=any>(address:Address,abi:Abi,functionName:string,args:readonly unknown[]=[]):Promise<R>=>new Promise((resolve,reject)=>{
  queued.push({call:{address,abi,functionName,args},resolve,reject});
  if(queued.length!==1)return;
  queueMicrotask(()=>{
   const current=queued;queued=[];
   void batch(current.map(x=>x.call)).then(values=>{
    if(values.length!==current.length)throw Error('Incomplete canonical contract observation');
    current.forEach((x,i)=>x.resolve(values[i]));
   }).catch(error=>current.forEach(x=>x.reject(error)));
  });
 });
 return{read,batch};
}
