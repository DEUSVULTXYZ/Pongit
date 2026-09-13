import type {Pool} from 'pg';
import {publicationFailureDetails} from '../../shared/service-error';

export type PublicationIncident={epoch:string;batch:string;reason:string;relayStatus?:number;failedAt:number};
/** Read success is not proof that the writer or its failed batch recovered. */
export async function createRoomsPublicationHealth(db:Pick<Pool,'query'>,app:string,now=Date.now){
 await db.query('CREATE TABLE IF NOT EXISTS il_rooms_publication_health(app text PRIMARY KEY,incident jsonb NOT NULL)');
 let incident:PublicationIncident|null=(await db.query('SELECT incident FROM il_rooms_publication_health WHERE app=$1',[app])).rows[0]?.incident??null;
 let retryAt=incident?now():0;
 return {
  status:()=>incident,
  retryAt:()=>retryAt,
  claimRetry:()=>{if(!incident||now()<retryAt)return false;retryAt=now()+30000;return true;},
  fail:async(error:unknown,epoch:number,batch:number)=>{
   const detail=publicationFailureDetails(error);
   const same=incident?.epoch===String(epoch);
   incident={epoch:String(epoch),batch:detail.batch??(same?incident!.batch:String(batch+1)),
    reason:detail.relayStatus?detail.reason:same?incident!.reason:detail.reason,
    relayStatus:detail.relayStatus??(same?incident!.relayStatus:undefined),failedAt:same?incident!.failedAt:now()};
   retryAt=now()+30000;
   await db.query('INSERT INTO il_rooms_publication_health(app,incident) VALUES($1,$2) ON CONFLICT(app) DO UPDATE SET incident=$2',[app,incident]);
   return incident;
  },
  // Caller has already checked app, chain, active delegation and expiry.
  observe:async(node:{epoch:number;committedBatches:number},hub:{epoch:bigint;batchIndex:bigint})=>{
   if(!incident||BigInt(node.epoch)!==hub.epoch)return false;
   const epoch=BigInt(incident.epoch),batch=BigInt(incident.batch);
   const recovered=hub.epoch>epoch&&BigInt(node.committedBatches)===hub.batchIndex || hub.epoch===epoch&&BigInt(node.committedBatches)>=batch&&hub.batchIndex>=batch;
   if(!recovered)return false;
   // Do not erase a concurrent new failure while the database delete is in flight.
   const prior=incident;
   await db.query('DELETE FROM il_rooms_publication_health WHERE app=$1 AND incident=$2::jsonb',[app,prior]);
   if(incident!==prior)return false;
   incident=null;retryAt=0;return true;
  },
 };
}
