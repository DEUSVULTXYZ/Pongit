/** Expand bounded historical log requests without changing filters or returning partial results. */
export async function chunkedLogs(filter:any,send:(filter:any)=>Promise<any[]>,chunkSize:number,maxRange:number):Promise<any[]|null>{
 if(!filter||filter.blockHash||!/^0x[\da-f]+$/i.test(filter.fromBlock)||!/^0x[\da-f]+$/i.test(filter.toBlock))return null;
 const from=BigInt(filter.fromBlock),to=BigInt(filter.toBlock);if(to<from)throw Error('Invalid log range');
 const count=to-from+1n;if(count<=BigInt(chunkSize))return null;if(count>BigInt(maxRange))throw Error('Historical log range exceeds the gateway bound');
 const ranges:any[]=[];for(let first=from;first<=to;first+=BigInt(chunkSize)){const last=first+BigInt(chunkSize)-1n;ranges.push({...filter,fromBlock:'0x'+first.toString(16),toBlock:'0x'+(last>to?to:last).toString(16)});}
 const logs:any[]=[];for(let i=0;i<ranges.length;i+=4){const group=await Promise.all(ranges.slice(i,i+4).map(send));for(const rows of group)logs.push(...rows);}
 return logs.sort((a,b)=>{for(const key of ['blockNumber','transactionIndex','logIndex']){const x=BigInt(a[key]),y=BigInt(b[key]);if(x!==y)return x<y?-1:1;}return 0;});
}
