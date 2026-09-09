import type {Pool,PoolClient} from "pg";
import type {LobbyRoom} from "../../shared/rooms";
export async function overlayPresence<T extends {rooms:Record<string,LobbyRoom>;queue:{player:string;seen:number}[]}>(db:Pool|PoolClient,app:string,s:T):Promise<T>{
 const rows=(await db.query("SELECT player,seen FROM il_presence WHERE app=$1 AND seen>$2",[app,Date.now()-120000])).rows;
 const seen=new Map<string,number>(rows.map(r=>[r.player,Number(r.seen)]));
 for(const room of Object.values(s.rooms))for(const member of room.members)member.seen=Math.max(member.seen,seen.get(member.player)||0);
 for(const member of s.queue)member.seen=Math.max(member.seen,seen.get(member.player)||0);
 return s;
}
