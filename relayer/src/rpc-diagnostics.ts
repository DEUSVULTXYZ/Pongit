import type {Pool} from "pg";
import {z} from "zod";
import {takeRpcSamples,type RpcMetric} from "../../shared/rpc-metrics";
const schema=z.array(z.object({at:z.number().finite(),target:z.enum(["interlude","monad","pongit"]),method:z.string().regex(/^[\w.]{1,80}$/),status:z.number().int().min(0).max(599),ms:z.number().min(0).max(300000),source:z.enum(["network","cooldown","cache","websocket"]),requestId:z.string().max(160).regex(/^[\w:./-]+$/).optional()})).max(200);
/** Per-second counters retain 1/10/60-second rates without storing request bodies. */
function aggregate(samples:RpcMetric[]){
 const groups=new Map<string,any>();
 for(const s of samples){const key=[Math.floor(s.at/1000),s.target,s.method,s.status,s.source].join(":");let g=groups.get(key);
  if(!g){g={second:Math.floor(s.at/1000),target:s.target,method:s.method,status:s.status,source:s.source,count:0,sumMs:0,maxMs:0,histogram:Array(11).fill(0),requestIds:[]};groups.set(key,g);}
  g.count++;g.sumMs+=s.ms;g.maxMs=Math.max(g.maxMs,s.ms);g.histogram[[10,25,50,100,200,400,800,1600,3200,10000,Infinity].findIndex(n=>s.ms<=n)]++;
  if(s.status>=400&&s.requestId&&g.requestIds.length<5)g.requestIds.push(s.requestId);
 }
 return [...groups.values()];
}
export async function createRpcDiagnostics(db:Pool,app:string){
 await db.query("CREATE TABLE IF NOT EXISTS il_rpc_diagnostics(id bigserial PRIMARY KEY,app text NOT NULL,component text NOT NULL,received_at timestamptz NOT NULL DEFAULT now(),data jsonb NOT NULL); CREATE INDEX IF NOT EXISTS il_rpc_diagnostics_time ON il_rpc_diagnostics(received_at)");
 let busy=false,lastPrune=0;
 const store=async(component:string,samples:RpcMetric[])=>{if(samples.length)await db.query("INSERT INTO il_rpc_diagnostics(app,component,data) VALUES($1,$2,$3)",[app,component,JSON.stringify(aggregate(samples))]);};
 const flush=async()=>{if(busy)return;busy=true;try{
  await store("vps",takeRpcSamples(5000));
  if(Date.now()-lastPrune>3600000){await db.query("DELETE FROM il_rpc_diagnostics WHERE received_at<now()-interval '7 days'");await db.query("DELETE FROM il_presence WHERE seen<$1",[Date.now()-86400000]);lastPrune=Date.now();}
 }catch{/* Diagnostics must not stop a game. */}finally{busy=false;}};
 const timer=setInterval(()=>void flush(),60000);timer.unref();
 return {accept:async(value:unknown,instance:unknown)=>{const id=z.string().uuid().parse(instance);const samples=schema.parse(value).filter(s=>Math.abs(Date.now()-s.at)<120000);await store("browser:"+id,samples);},stop:()=>{clearInterval(timer);void flush();}};
}
