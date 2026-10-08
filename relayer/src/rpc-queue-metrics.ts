/** Short, bounded scheduling measurements. No address, calldata or credentials. */
export function rpcQueueMetrics(now=Date.now){
 const buckets=[25,50,100,200,400,800,1600,3200,10000,Infinity];
 let since=now();const groups=new Map<string,{count:number;sum:number;max:number;histogram:number[]}>();
 const rotate=()=>{if(now()-since>=60000){groups.clear();since=now();}};
 return {
  record(upstream:'primary'|'secondary',kind:'transaction'|'control'|'foreground'|'live'|'history',method:string,stage:'queue'|'network',ms:number){
   rotate();if(!Number.isFinite(ms)||ms<0)return;
   const name=/^eth_[A-Za-z]{1,35}$/.test(method)?method:'other';
   let key=[upstream,kind,name,stage].join(':');
   if(!groups.has(key)&&groups.size>=96)key='other';
   let group=groups.get(key);if(!group){group={count:0,sum:0,max:0,histogram:buckets.map(()=>0)};groups.set(key,group);}
   group.count++;group.sum+=ms;group.max=Math.max(group.max,ms);group.histogram[buckets.findIndex(b=>ms<=b)]++;
  },
  snapshot(){rotate();return {since,at:now(),bounds:buckets.map(n=>Number.isFinite(n)?n:null),groups:Object.fromEntries([...groups].map(([key,v])=>[key,{...v,histogram:[...v.histogram]}]))};},
 };
}
