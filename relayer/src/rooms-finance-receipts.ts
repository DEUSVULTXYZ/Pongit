import {decodeEventLog,type TransactionReceipt} from 'viem';
import {marketV4Abi} from '../../shared/abis-v4';
import {financeScope,type RoomsFinanceManifest} from './rooms-finance-config';
/** Consume receipts already verified by the relayer's Monad client. Never accept
 * browser-supplied logs. Historical scans remain the recovery path. */
export async function recordRoomsFinanceReceipt(db:{query:(sql:string,args:any[])=>Promise<unknown>},entries:RoomsFinanceManifest[],receipt:TransactionReceipt){
 if(receipt.status!=='success')return;
 for(const log of receipt.logs){
  const m=entries.find(x=>x.market.toLowerCase()===log.address.toLowerCase());if(!m)continue;
  let event;try{event=decodeEventLog({abi:marketV4Abi,data:log.data,topics:log.topics});}catch{continue;}
  if(event.eventName==='BetPlaced')await db.query('INSERT INTO il_bettors(app,id,player) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[financeScope(m),String(event.args.matchId),event.args.player.toLowerCase()]);
  if(event.eventName==='PayoutPaid'||event.eventName==='PayoutDeferred')await db.query('INSERT INTO il_payment_receipts VALUES($1,$2,$3,$4) ON CONFLICT(app,payout_id) DO UPDATE SET status=$3,tx_hash=$4',[financeScope(m),event.args.payoutId,event.eventName,receipt.transactionHash]);
 }
}
