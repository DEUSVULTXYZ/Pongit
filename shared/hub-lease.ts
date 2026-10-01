import type {Address} from 'viem';

/** Pinned protocol semantics, not a default for missing lifecycle fields. */
export const NO_LEASE_HUB:Address='0x98922c6E5e4Bea62761C71D2401c7ec2c26eC43e';
export function hubHasNoLease(hub:Address,expiresAt:bigint){
 return expiresAt===0n&&hub.toLowerCase()===NO_LEASE_HUB.toLowerCase();
}
