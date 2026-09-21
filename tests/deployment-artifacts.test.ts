import test from 'node:test';
import assert from 'node:assert/strict';
import {assertDeploymentArtifact,preflightDeploymentArtifacts,type DeploymentArtifact} from '../shared/deployment-artifacts';
const fixture=(runtime=100,links:string[]=[]):DeploymentArtifact=>({bytecode:{object:'0x'+'00'.repeat(200),linkReferences:{'fixture.sol':Object.fromEntries(links.map((name,i)=>[name,[{start:i*20,length:20}]]))}},deployedBytecode:{object:'0x'+'00'.repeat(runtime)}});
test('preflight rejects an oversized transitive library before a deployer can submit any root',async()=>{
 const artifacts={Root:fixture(200,['Game']),Game:fixture(27719)};let submitted=false;
 await assert.rejects(async()=>{await preflightDeploymentArtifacts(['Root'],async name=>artifacts[name as keyof typeof artifacts]);submitted=true;},/Game exceeds/);
 assert.equal(submitted,false);
});
test('the full library graph is checked once, and missing or cyclic links fail closed',async()=>{
 const seen:string[]=[];const a:Record<string,DeploymentArtifact>={A:fixture(100,['Shared']),B:fixture(100,['Shared']),Shared:fixture()};
 const graph=await preflightDeploymentArtifacts(['A','B'],async name=>{seen.push(name);return a[name];});
 assert.equal(graph.length,3);assert.equal(seen.filter(x=>x==='Shared').length,1);
 await assert.rejects(preflightDeploymentArtifacts(['Missing'],async()=>{throw Error('artifact missing');}),/artifact missing/);
 await assert.rejects(preflightDeploymentArtifacts(['Cycle'],async()=>fixture(100,['Cycle'])),/Cyclic/);
});
test('runtime exceptions remain explicit and creation/reference bounds cannot be bypassed',()=>{
 assert.doesNotThrow(()=>assertDeploymentArtifact('ReusableEventsLobby',fixture(30000)));
 assert.doesNotThrow(()=>assertDeploymentArtifact('BalancedAgentInstancesPool',fixture(32768)));
 assert.throws(()=>assertDeploymentArtifact('BalancedAgentInstancesPool',fixture(32769)),/runtime/);
 assert.doesNotThrow(()=>assertDeploymentArtifact('ContinuingAgentInstancesPool',fixture(32768)));
 assert.throws(()=>assertDeploymentArtifact('ContinuingAgentInstancesPool',fixture(32769)),/runtime/);
 assert.throws(()=>assertDeploymentArtifact('ReusableGame',fixture(30000)),/runtime/);
 const a=fixture();a.bytecode.object='0x'+'00'.repeat(49153);assert.throws(()=>assertDeploymentArtifact('Root',a),/creation/);
 const b=fixture(100,['Lib']);b.bytecode.linkReferences!['fixture.sol'].Lib[0].start=190;assert.throws(()=>assertDeploymentArtifact('Root',b),/references/);
});
