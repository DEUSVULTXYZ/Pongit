import test from 'node:test';
import assert from 'node:assert/strict';
import {agentCatalogMigration,migratedHousePolicyModules} from '../shared/agent-catalog-migration';
const original=`0x${'ab'.repeat(32)}` as const,replacement=`0x${'cd'.repeat(32)}` as const;
test('already-installed progressive policy keeps inherited qualification instead of reverting deployment',()=>{
 const inherited=agentCatalogMigration(original);
 assert.deepEqual(agentCatalogMigration(original,original),inherited);
 assert.deepEqual(agentCatalogMigration(original,original.toUpperCase().replace('0X','0x') as typeof original),inherited);
 assert.equal(inherited.artifact,'MigratingAgentCatalog');assert.equal(inherited.changed,false);
});
test('a real controller change selects the contract that invalidates old house verdicts',()=>{
 const plan=agentCatalogMigration(original,replacement);
 assert.equal(plan.artifact,'RebalancedAgentCatalog');assert.equal(plan.changed,true);
 assert.equal(plan.predecessorPolicyHash,original);assert.equal(plan.targetPolicyHash,replacement);
});
test('missing policy bytecode cannot be treated as an unchanged controller',()=>{
 assert.throws(()=>agentCatalogMigration(`0x${'0'.repeat(64)}`),/Verified/);
 assert.throws(()=>agentCatalogMigration(original,'0x'),/Verified/);
});

test('reused progressive code retains the versioned module needed by runtime guards',()=>{
 const policy='0x1234567890123456789012345678901234567890';
 assert.equal(agentCatalogMigration(original,original).changed,false);
 assert.deepEqual(migratedHousePolicyModules(policy,true),{HousePolicies:policy,ProgressiveHousePolicies:policy});
 assert.deepEqual(migratedHousePolicyModules(policy,false),{HousePolicies:policy});
 assert.throws(()=>migratedHousePolicyModules(`0x${'0'.repeat(40)}`,true),/Verified/);
});
