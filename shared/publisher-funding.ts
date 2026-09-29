import type {Address,PublicClient} from 'viem';
import {BackgroundObservation} from './background-observation';

// Observed hosted publication envelope: 24M gas per successful commit. This is
// a minimum liveness check, NOT a reservation or a promise to fund a full match.
export const HOSTED_PUBLICATION_GAS=24_000_000n;
export function publisherFunding(base:Pick<PublicClient,'getBalance'|'getGasPrice'>,now=Date.now){
 const publishers=new Map<string,BackgroundObservation<{funded:boolean;balance:bigint;minimum:bigint}>>();
 return (publisher:Address)=>{
  const key=publisher.toLowerCase();let observation=publishers.get(key);
  if(!observation){observation=new BackgroundObservation(async()=>{
   const [balance,price]=await Promise.all([base.getBalance({address:publisher}),base.getGasPrice()]);
   const minimum=HOSTED_PUBLICATION_GAS*price*12n/10n;
   return{funded:balance>=minimum,balance,minimum};
  },5000,7500,now);publishers.set(key,observation);}
  return observation.read();
 };
}
