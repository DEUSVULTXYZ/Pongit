import type {Pool} from "pg";
import type {Address,PublicClient} from "viem";
import {createRoomsFinance} from "./rooms-finance";
import type {RoomsFinanceManifest} from "./rooms-finance-config";

/** A match never changes its financial deployment. Old queued jobs retain their destination. */
export async function createRoomsFinanceRouter(o:{db:Pool;base:PublicClient;entries:RoomsFinanceManifest[];enqueue:Parameters<typeof createRoomsFinance>[0]["enqueue"]}) {
  const workers:Awaited<ReturnType<typeof createRoomsFinance>>[]=[];
  for(const manifest of o.entries) workers.push(await createRoomsFinance({...o,manifest}));
  if(!workers.length)throw new Error("No rooms finance deployment");
  const app=o.entries[0].app.toLowerCase();
  if(o.entries.some(x=>x.app.toLowerCase()!==app))throw new Error("Mixed arena finance router");
  const active=workers.at(-1)!;
  const find=(id:string)=>{
    const w=workers.find(x=>(x.manifest.financeId||"")===id);
    if(!w)throw new Error("Unknown financial deployment");
    return w;
  };
  await o.db.query(`CREATE TABLE IF NOT EXISTS il_match_finance(app text NOT NULL,id text NOT NULL,finance_id text NOT NULL,market text NOT NULL,PRIMARY KEY(app,id))`);
  async function forMatch(id:string){
    let row=(await o.db.query("SELECT finance_id,market FROM il_match_finance WHERE app=$1 AND id=$2",[app,id])).rows[0];
    if(!row){
      let selected=active;
      const existing=[];
      for(const w of workers)if(await w.hasBook(id))existing.push(w);
      if(existing.length>1)throw new Error("Multiple markets exist for this match; operator review required");
      if(existing.length)selected=existing[0];
      await o.db.query("INSERT INTO il_match_finance VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",[app,id,selected.manifest.financeId||"",selected.manifest.market.toLowerCase()]);
      row=(await o.db.query("SELECT finance_id,market FROM il_match_finance WHERE app=$1 AND id=$2",[app,id])).rows[0];
    }
    const w=find(row.finance_id);
    if(w.manifest.market.toLowerCase()!==row.market)throw new Error("Match financial binding changed");
    return w;
  }
  return {
    pressure:async(...args:Parameters<typeof active.pressure>)=>(await forMatch(args[0])).pressure(...args),
    audit:async()=>{for(const w of workers)await w.audit();},
    beforeRenew:async()=>{for(const w of workers)await w.beforeRenew();},
    status:()=>workers.map(w=>w.status()).filter(Boolean).join("; "),
    route:async(path:string,method:string,player:string,body:any,params:URLSearchParams)=>{
      const match=/^\/interlude\/markets\/([0-9]+)$/.exec(path);
      const matchId=match?.[1] || (path.endsWith("/buy")?body.bet?.matchId:path.endsWith("/retry")?body.id:undefined);
      if(matchId!==undefined&&!/^[0-9]{1,78}$/.test(String(matchId)))throw new Error("Invalid financial match reference");
      const requested=method==="GET"?params.get("financeId"):body.financeId;
      const selected=matchId!==undefined?await forMatch(String(matchId)):requested!==undefined&&requested!==null?find(String(requested)):active;
      if(matchId!==undefined&&requested!==undefined&&requested!==null&&String(requested)!==(selected.manifest.financeId||""))throw new Error("Financial deployment changed; refresh before signing");
      const result=await selected.route(path,method,player,body,params);
      if(path==="/interlude/finance"&&method==="GET"&&result){
        const archives=[];
        for(const w of workers)if(w!==selected)archives.push(await w.route(path,method,player,{},params));
        return {...result,archives};
      }
      return result;
    },
  };
}
