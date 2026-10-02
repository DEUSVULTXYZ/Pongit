import {NO_LEASE_HUB} from './hub-lease';
import {LEGACY_HOSTED_HUB} from './hosted-control';

/** Explicit fresh private v3 qualification, never an implicit migration. */
export function independentQualificationHub(rules:number,flag:string|undefined,snapshot:boolean){
 if(flag===undefined)return LEGACY_HOSTED_HUB;
 if(flag!=='isolated-testnet'||rules!==14||snapshot)throw Error('V3 human qualification requires fresh private reusable rules');
 return NO_LEASE_HUB;
}

/** Reviewed test-only ceiling. Never infer spending permission from a changed fee. */
export function independentQualificationOpeningFee(hub:string,fee:bigint,flag:string|undefined){
 if(fee<0n)throw Error('Invalid opening fee');
 if(hub.toLowerCase()===LEGACY_HOSTED_HUB.toLowerCase()&&fee===0n)return fee;
 if(hub.toLowerCase()===NO_LEASE_HUB.toLowerCase()&&flag==='isolated-testnet'&&fee<=10_000_000_000_000_000n)return fee;
 throw Error('Opening fee outside the reviewed private qualification');
}
