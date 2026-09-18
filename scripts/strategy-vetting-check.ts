// Vets real strategy bytecode on a local anvil, the way the service vets a registration on Monad:
// the example strategy passes with room to spare, and each hostile contract is refused for its
// own reason. Also measures what one decide() costs, for the documentation.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {createPublicClient,createWalletClient,encodeFunctionData,http,type Abi,type Address,type Hex} from 'viem';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {foundry} from 'viem/chains';
import {pongStrategyAbi,strategySamples,STRATEGY_GAS} from '../shared/agents';
import {vetStrategy,strategyCallGas} from '../relayer/src/agents/strategies';

const port=8600+Math.floor(Math.random()*300),rpc=`http://127.0.0.1:${port}`;
const node=spawn('anvil',['--port',String(port),'--silent'],{stdio:'ignore'});
try{
 const base=createPublicClient({chain:foundry,transport:http(rpc)});
 for(let i=0;;i++){try{await base.getBlockNumber();break;}catch{if(i>50)throw Error('anvil did not start');await new Promise(r=>setTimeout(r,200));}}
 // Throwaway keys, funded by the local node itself; nothing here ever leaves this process.
 const deployer=privateKeyToAccount(generatePrivateKey()),creator=privateKeyToAccount(generatePrivateKey()).address;
 await base.request({method:'anvil_setBalance',params:[deployer.address,'0x56bc75e2d63100000']} as any);
 const wallet=createWalletClient({chain:foundry,transport:http(rpc),account:deployer});
 async function deploy(file:string,name:string,args:unknown[]=[]):Promise<Address>{
  const artifact=JSON.parse(await readFile(`contracts/out/${file}/${name}.json`,'utf8'));
  const hash=await wallet.deployContract({abi:artifact.abi as Abi,bytecode:artifact.bytecode.object as Hex,args});
  return (await base.waitForTransactionReceipt({hash})).contractAddress!;
 }
 const results:Record<string,string>={};
 const tracker=await deploy('TrackerStrategy.sol','TrackerStrategy',[creator,4n]);
 await vetStrategy(base as any,tracker,creator);results.TrackerStrategy='accepted';
 // What one decision costs: the estimate less the call's own intrinsic and calldata cost.
 const spent=await Promise.all(strategySamples.map(async sample=>{
  const data=encodeFunctionData({abi:pongStrategyAbi,functionName:'decide',args:[sample as any]});
  const overhead=strategyCallGas(data)-STRATEGY_GAS;
  return Number(await base.estimateGas({to:tracker,data})-overhead);
 }));
 assert(Math.max(...spent)<Number(STRATEGY_GAS)/2,'The example must leave most of the budget unused');
 const refused=async(name:string,address:Address,pattern:RegExp,who=creator)=>{
  await assert.rejects(vetStrategy(base as any,address,who),(e:any)=>{assert.equal(e.code,'AGENT_STRATEGY_INVALID');assert.match(e.message,pattern);return true;});
  results[name]='refused';
 };
 await refused('another creator',tracker,/creator\(\)/,deployer.address);
 await refused('RevertingStrategy',await deploy('AgentArcade.t.sol','RevertingStrategy',[creator]),/reverted or used more/);
 await refused('BurningStrategy',await deploy('AgentArcade.t.sol','BurningStrategy',[creator]),/reverted or used more/);
 await refused('OutOfRangeStrategy',await deploy('AgentArcade.t.sol','OutOfRangeStrategy',[creator]),/answered 5/);
 await refused('NoCreatorContract',await deploy('AgentArcade.t.sol','NoCreatorContract'),/creator\(\)/);
 await refused('no contract','0x000000000000000000000000000000000000dEaD',/No contract/);
 // Two it cannot tell apart, both harmless on the arcade: a flood whose first word is a valid
 // answer, and a decide() that writes, which works in an eth_call but always holds under the
 // arcade's STATICCALL. The qualification match, where the paddle must move, is what catches it.
 await vetStrategy(base as any,await deploy('AgentArcade.t.sol','FloodingStrategy',[creator]),creator);results.FloodingStrategy='accepted (answers 0; the arcade reads only 32 bytes)';
 await vetStrategy(base as any,await deploy('AgentArcade.t.sol','WritingStrategy',[creator]),creator);results.WritingStrategy='accepted here; holds under STATICCALL and fails qualification';
 console.log(JSON.stringify({at:new Date().toISOString(),scope:'real bytecode on a local anvil',results,trackerDecideGas:spent,budget:Number(STRATEGY_GAS)},null,1));
}finally{node.kill();}
