// Bounded private gas-role setup. No contract role, opening or user permission changes.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {formatEther,parseEther} from 'viem';
import {chainTools} from './independent-chain-tools';
import {retryOperatorContention} from '../shared/operator-contention';
import {abi as lobbyAbi} from '../shared/abi-independent-ReusableEventsLobby';

assert.equal(process.env.PONG_PRIVATE_PLAYER_SPONSOR,'reviewed-20261003');
const deadline=Date.parse(process.env.PONG_PRIVATE_PLAYER_SPONSOR_DEADLINE??'');
assert(deadline>Date.now()&&deadline<=Date.now()+600_000);
const manifest=JSON.parse(await readFile('/secrets/finance-v3-manifest.json','utf8'));
assert.equal(manifest.production,false);assert.equal(manifest.lobby.toLowerCase(),'0xe4cdf97e582282879219d7a888f8cd0ae629bd31');
const prefix=manifest.prefix+':player-sponsor-20261003',t=await chainTools(prefix);
const report:any={startedAt:new Date().toISOString(),deadline,scope:'Dedicated private player gas only, no contract role or permission change.',passed:false};
try{
 for(const lane of [0n,1n])assert.equal(await t.base.readContract({address:manifest.lobby,abi:lobbyAbi,functionName:'slot',args:[lane]}),0n,'Drain private human games before sponsor transition');
 const file='/secrets/player-sponsor.json';let secret:{privateKey:`0x${string}`};
 try{secret=JSON.parse(await readFile(file,'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;secret={privateKey:generatePrivateKey()};await writeFile(file,JSON.stringify(secret),{flag:'wx',mode:0o600});}
 const address=privateKeyToAccount(secret.privateKey).address;assert.notEqual(address.toLowerCase(),t.account.address.toLowerCase());
 const before=await t.base.getBalance({address});report.address=address;report.beforeMon=formatEther(before);
 const known=await t.db.query('SELECT status FROM il_lifecycle_jobs WHERE id=$1',[prefix+':fund-5']);
 assert(known.rowCount||before<parseEther('0.1'),'Do not refill an already funded sponsor blindly');
 const receipt=await retryOperatorContention(()=>{assert(Date.now()<deadline,'Original sponsor funding deadline');return t.submit('fund-5','0x',address,parseEther('5'));});
 report.hash=receipt.transactionHash;report.block=String(receipt.blockNumber);report.transferredMon='5';
 report.afterMon=formatEther(await t.base.getBalance({address}));report.passed=true;
}catch(e){report.error=String((e as any).shortMessage??(e as Error).message).split('\n')[0].replace(/0x[\da-f]{90,}/gi,'[omitted]').slice(0,200);process.exitCode=1;}
finally{await t.close();report.finishedAt=new Date().toISOString();await writeFile('/evidence/player-sponsor-funding-1.json',JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,error:report.error,address:report.address}));}
