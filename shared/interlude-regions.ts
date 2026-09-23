/** Interlude's public regional nodes, as the SDK lists them in PUBLIC_DEMO_FLOORS
 * (a test keeps the two in step). Browsers time a request to each to learn where
 * players are; nothing onchain is read or written. */
export const INTERLUDE_REGIONS=[
 {region:'us',city:'California',node:'https://rpc.us.interludelayer.xyz'},
 {region:'ny',city:'New York',node:'https://rpc.ny.interludelayer.xyz'},
 {region:'eu',city:'Paris',node:'https://rpc.interludelayer.xyz'},
 {region:'asia',city:'Singapore',node:'https://rpc.asia.interludelayer.xyz'},
 {region:'tokyo',city:'Tokyo',node:'https://rpc.tokyo.interludelayer.xyz'},
 {region:'mumbai',city:'Mumbai',node:'https://rpc.mumbai.interludelayer.xyz'},
 {region:'africa',city:'Johannesburg',node:'https://rpc.africa.interludelayer.xyz'},
 {region:'sa',city:'São Paulo',node:'https://rpc.sa.interludelayer.xyz'},
] as const;
export type InterludeRegion=typeof INTERLUDE_REGIONS[number]['region'];
/** Every arena runs in Paris today (Fly cdg), beside the eu node. */
export const HOME_REGION:InterludeRegion='eu';
export const isInterludeRegion=(value:unknown):value is InterludeRegion=>INTERLUDE_REGIONS.some(r=>r.region===value);
/** Latencies are only ever kept in 10 ms steps, capped at one second. */
export const latencyBucket=(ms:number)=>Math.min(1000,Math.max(0,Math.round(ms/10)*10));
