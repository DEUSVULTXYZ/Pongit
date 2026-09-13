import {readFile} from 'node:fs/promises';
import {createPublicClient,http} from 'viem';
import {roomsRealtimeAbi as abi} from '../shared/abi-PongRoomsRealtime';
const {game:m}=JSON.parse(await readFile('artifacts/realtime/manifests.json','utf8'));
const client=createPublicClient({transport:http(m.node,{retryCount:0,timeout:8000})});
const status:any=await client.request({method:'interlude_session' as any,params:[]} as any);
const matches=[];for(const id of [2026091300n,2026091301n]){const s=await client.readContract({address:m.app,abi,functionName:'getSnapshot',args:[id]});matches.push({id:String(id),phase:String(s[2]),score:[s[12].scoreA,s[12].scoreB],time:String(s[12].t),half:String(s[12].halfA),waiting:s[12].awaitingServe});}
console.log(JSON.stringify({at:new Date().toISOString(),epoch:status.epoch,batches:status.committedBatches,pending:status.pendingDiffs?.length,matches}));
