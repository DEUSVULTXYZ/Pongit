import type { IncomingMessage, ServerResponse } from "node:http";
import type { Address, Abi } from "viem";
import { gameAbi, vaultAbi, marketAbi } from "../../shared/abis";
import type { Deployment } from "../../shared/protocol";

export function legacyRoutes(d:{legacy?:Deployment;read:(address:Address,abi:Abi,name:string,args:readonly unknown[])=>Promise<any>;graphql:(query:string,variables?:unknown)=>Promise<any>;send:(res:ServerResponse,value:unknown,status?:number)=>void}) {
  return async(req:IncomingMessage,res:ServerResponse,path:string)=>{
    if(!path.startsWith("/legacy/"))return false;
    if(req.method!=="GET" || !d.legacy){d.send(res,{error:"Legacy deployment unavailable"},404);return true;}
    const url=new URL(req.url!,"http://localhost"),legacy=d.legacy;
    const player=/^\/legacy\/player\/(0x[\da-fA-F]{40})$/.exec(path);
    if(player){const address=player[1] as Address;const [balance,vaultNonce,marketNonce,rating]=await Promise.all([d.read(legacy.vault,vaultAbi,"balances",[address]),d.read(legacy.vault,vaultAbi,"nonces",[address]),d.read(legacy.market,marketAbi,"nonces",[address]),d.read(legacy.game,gameAbi,"ratingOf",[address])]);d.send(res,{balance,vaultNonce,marketNonce,rating});return true;}
    if(path==="/legacy/history") {
      const before=url.searchParams.get("before") || "999999999999";if(!/^\d+$/.test(before))throw new Error("Invalid cursor");
      d.send(res,await d.graphql('query LegacyHistory($before:numeric!){Match(where:{deployment:{_eq:"v1"},block:{_lt:$before}},order_by:{block:desc},limit:100){id rawId deployment playerA playerB tournamentId status winner block mode ranked rulesVersion}}',{before}));return true;
    }
    const match=/^\/legacy\/(matches|replay)\/(\d+)$/.exec(path);
    if(match){const id=match[2];if(match[1]==="matches"){const m=await d.read(legacy.game,gameAbi,"getMatch",[BigInt(id)]);d.send(res,{id:`v1:${id}`,match:m,clock:m.state.t});}
      else {const after=url.searchParams.get("after") || "0";if(!/^\d+$/.test(after))throw new Error("Invalid cursor");d.send(res,await d.graphql('query LegacyReplay($id:String!,$after:numeric!){Frame(where:{matchId:{_eq:$id},version:{_gt:$after}},order_by:{version:asc},limit:1000){id matchId version state clock block nextAt nextKind}}',{id:`v1:${id}`,after}));}return true;}
    d.send(res,{error:"Legacy route not found"},404);return true;
  };
}
