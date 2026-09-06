import type { IncomingMessage, ServerResponse } from "node:http";
import type { Address, Abi } from "viem";
import { gameAbi, vaultAbi, marketAbi } from "../../shared/abis";
import { allDeployments, deploymentId, contractsFor, type Deployment } from "../../shared/protocol";

export function legacyRoutes(d:{legacy?:Deployment;read:(address:Address,abi:Abi,name:string,args:readonly unknown[])=>Promise<any>;graphql:(query:string,variables?:unknown)=>Promise<any>;send:(res:ServerResponse,value:unknown,status?:number)=>void}) {
  return async(req:IncomingMessage,res:ServerResponse,path:string)=>{
    if(!path.startsWith("/legacy/"))return false;
    if(req.method!=="GET" || !d.legacy){d.send(res,{error:"Legacy deployment unavailable"},404);return true;}
    const url=new URL(req.url!,"http://localhost");
    const requested=url.searchParams.get("deployment") || "v1";
    const legacy=allDeployments(d.legacy).find(x=>deploymentId(x)===requested);
    if(!legacy)throw new Error("Legacy deployment unavailable");
    const {game:gameAbi,market:marketAbi,vault:vaultAbi}=contractsFor(legacy);
    const player=/^\/legacy\/player\/(0x[\da-fA-F]{40})$/.exec(path);
    if(player){const address=player[1] as Address;const [balance,vaultNonce,marketNonce,rating]=await Promise.all([d.read(legacy.vault,vaultAbi,"balances",[address]),d.read(legacy.vault,vaultAbi,"nonces",[address]),d.read(legacy.market,marketAbi,"nonces",[address]),d.read(legacy.game,gameAbi,"ratingOf",[address])]);d.send(res,{balance,vaultNonce,marketNonce,rating});return true;}
    const claims=/^\/legacy\/claims\/(0x[\da-fA-F]{40})$/.exec(path);
    if(claims){
      const address=claims[1].toLowerCase() as Address;let after="";const ids=new Set<string>();
      for(;;){const data=await d.graphql('query($player:String!,$pattern:String!,$after:String!){Bet(where:{player:{_eq:$player},matchId:{_like:$pattern},id:{_gt:$after}},order_by:{id:asc},limit:1000){id matchId}}',{player:address,pattern:requested+":%",after});for(const b of data.Bet)ids.add(b.matchId.split(":")[1]);if(data.Bet.length<1000)break;after=data.Bet.at(-1).id;}
      const eligible:Record<string,string>={};const list=[...ids];
      for(let i=0;i<list.length;i+=4)await Promise.all(list.slice(i,i+4).map(async id=>{const [m,p]=await Promise.all([d.read(legacy.game,gameAbi,"result",[BigInt(id)]),d.read(legacy.market,marketAbi,"positions",[BigInt(id),address])]);const amount=m[3]===4?p[2]:String(m[2]).toLowerCase()===String(m[0]).toLowerCase()?p[0]:p[1];if(m[3]>=3&&!p[3]&&BigInt(amount)>0n)eligible[id]=String(amount);}));
      d.send(res,{claims:eligible});return true;
    }
    if(path==="/legacy/history") {
      const before=url.searchParams.get("before") || "999999999999";if(!/^\d+$/.test(before))throw new Error("Invalid cursor");
      d.send(res,await d.graphql('query LegacyHistory($before:numeric!,$deployment:String!){Match(where:{deployment:{_eq:$deployment},block:{_lt:$before}},order_by:{block:desc},limit:100){id rawId deployment playerA playerB tournamentId status winner block mode ranked rulesVersion}}',{before,deployment:requested}));return true;
    }
    const match=/^\/legacy\/(matches|replay)\/(\d+)$/.exec(path);
    if(match){const id=match[2];if(match[1]==="matches"){const m=await d.read(legacy.game,gameAbi,"getMatch",[BigInt(id)]);d.send(res,{id:`${requested}:${id}`,match:m,clock:m.state.t});}
      else {const after=url.searchParams.get("after") || "0";if(!/^\d+$/.test(after))throw new Error("Invalid cursor");d.send(res,await d.graphql('query LegacyReplay($id:String!,$after:numeric!){Frame(where:{matchId:{_eq:$id},version:{_gt:$after}},order_by:{version:asc},limit:1000){id matchId version state clock block nextAt nextKind}}',{id:`${requested}:${id}`,after}));}return true;}
    d.send(res,{error:"Legacy route not found"},404);return true;
  };
}
