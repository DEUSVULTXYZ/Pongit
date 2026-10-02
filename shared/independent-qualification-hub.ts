import {NO_LEASE_HUB} from './hub-lease';
import {LEGACY_HOSTED_HUB} from './hosted-control';

/** Explicit fresh private v3 qualification, never an implicit migration. */
export function independentQualificationHub(rules:number,flag:string|undefined,snapshot:boolean){
 if(flag===undefined)return LEGACY_HOSTED_HUB;
 if(flag!=='isolated-testnet'||rules!==14||snapshot)throw Error('V3 human qualification requires fresh private reusable rules');
 return NO_LEASE_HUB;
}
