import type {ServerResponse} from 'node:http';
import {isAddress} from 'viem';

type View={revision:string;value:any};
type Client={response:ServerResponse;topics:string[];seen:Map<string,string>;initial:boolean;lastSent:number};
/** Public contract-view invalidations, never grants or private request bodies.
 * One bounded poll serves every viewer. Reconnect always requests a fresh view,
 * including after server restart; a missed event cannot strand an admission. */
export class PoolNotifications {
 private clients=new Set<Client>();private timer:ReturnType<typeof setTimeout>|undefined;private pending:Promise<void>|undefined;
 constructor(private load:(url:URL)=>Promise<View>,private publicGate:boolean,private now=Date.now){}
 add(response:ServerResponse,account:string|null){
  if(account&&!isAddress(account))throw Object.assign(Error('Invalid account'),{status:400});
  if(this.clients.size>=64)throw Object.assign(Error('Notifications are busy'),{status:503,code:'AGENT_EVENTS_BUSY'});
  const topics=['config','live','tournaments?limit=8','catalog?limit=32',...(account?[`challenges/${account.toLowerCase()}`]:[])];
  const client:Client={response,topics,seen:new Map(),initial:true,lastSent:this.now()};
  response.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','X-Accel-Buffering':'no','Connection':'keep-alive'});
  response.write('retry: 3000\n\n');this.clients.add(client);
  response.once('close',()=>{this.clients.delete(client);if(!this.clients.size)clearTimeout(this.timer);});
  if(!this.pending)void this.tick();
 }
 async tick(){
  if(this.pending)return this.pending;clearTimeout(this.timer);
  this.pending=this.observe().finally(()=>{this.pending=undefined;if(this.clients.size)this.timer=setTimeout(()=>void this.tick(),2000);});
  return this.pending;
 }
 private async observe(){
  const topics=new Set([...this.clients].flatMap(c=>c.topics)),values=new Map<string,View>();
  await Promise.all([...topics].map(async topic=>{try{values.set(topic,await this.load(new URL(`/agents/${topic}`,'http://localhost')));}catch{/* Keep the last revision; polling remains available. */}}));
  for(const c of this.clients){
   const gate=values.get('config');
   if(this.publicGate&&(!gate||gate.value.enabled!==true)){c.response.end();continue;}
   const changed=c.topics.filter(topic=>{const v=values.get(topic);return v&&c.seen.get(topic)!==v.revision;});
   for(const topic of changed)c.seen.set(topic,values.get(topic)!.revision);
   if(changed.length||c.initial){
    const data={version:1,resync:c.initial,changed:changed.map(t=>t.split('?')[0]),revisions:Object.fromEntries(c.seen)};
    // Disconnect slow consumers instead of accumulating an unbounded write queue.
    if(!c.response.write(`event: change\ndata: ${JSON.stringify(data)}\n\n`))c.response.end();
    c.initial=false;c.lastSent=this.now();
   }else if(this.now()-c.lastSent>=15000){c.response.write(': heartbeat\n\n');c.lastSent=this.now();}
  }
 }
 close(){clearTimeout(this.timer);for(const c of this.clients)c.response.end();this.clients.clear();}
}
