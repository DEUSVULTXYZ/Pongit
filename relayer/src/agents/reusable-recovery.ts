import type {Address} from 'viem';

type Epoch={app:Address;epoch:bigint;status:number;lastCommitAt:bigint;maxBatchInterval:bigint};
type Ticket={arena:Address;epoch:bigint;matchId:bigint;sequence:bigint;issuedAt:bigint};

/** Only a canonical, still-unpublished reservation can expire by publication
 * silence. A long-idle epoch or a locally missing receipt is not that proof.
 * The hub simulation/inclusion remains the authority for forceClose. */
export function overdueAgentPublication(d:Epoch,ticket:Ticket,published:readonly [bigint,bigint|number,string],now:bigint){
 if(d.status!==1)return false;
 if(ticket.arena.toLowerCase()!==d.app.toLowerCase()||ticket.epoch!==d.epoch
  ||ticket.matchId<=0n||ticket.sequence<=0n||ticket.issuedAt<=0n)
  throw Error('Publication recovery ticket does not belong to this arena epoch');
 if(published[0]!==d.epoch||BigInt(published[1])<0n)
  throw Error('Publication recovery requires a canonical commitment for this epoch');
 if(BigInt(published[1])>=ticket.sequence||d.maxBatchInterval<=0n)return false;
 const since=ticket.issuedAt>d.lastCommitAt?ticket.issuedAt:d.lastCommitAt;
 return now>since+d.maxBatchInterval;
}
