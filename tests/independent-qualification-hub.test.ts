import test from 'node:test';
import assert from 'node:assert/strict';
import {independentQualificationHub,independentQualificationOpeningFee} from '../shared/independent-qualification-hub';
import {NO_LEASE_HUB} from '../shared/hub-lease';
import {LEGACY_HOSTED_HUB} from '../shared/hosted-control';
test('v3 human deployment requires explicit fresh qualification and preserves legacy selection',()=>{
 assert.equal(independentQualificationHub(14,undefined,false),LEGACY_HOSTED_HUB);
 assert.equal(independentQualificationHub(14,undefined,true),LEGACY_HOSTED_HUB);
 assert.equal(independentQualificationHub(14,'isolated-testnet',false),NO_LEASE_HUB);
 for(const rules of [4,12,13])assert.throws(()=>independentQualificationHub(rules,'isolated-testnet',false));
 assert.throws(()=>independentQualificationHub(14,'isolated-testnet',true));
 assert.throws(()=>independentQualificationHub(14,'true',false));
});

test('private v3 opening accepts only the reviewed fee and explicit scope',()=>{
 const ceiling=10_000_000_000_000_000n;
 assert.equal(independentQualificationOpeningFee(LEGACY_HOSTED_HUB,0n,undefined),0n);
 assert.equal(independentQualificationOpeningFee(NO_LEASE_HUB,ceiling,'isolated-testnet'),ceiling);
 assert.equal(independentQualificationOpeningFee(NO_LEASE_HUB,0n,'isolated-testnet'),0n);
 assert.throws(()=>independentQualificationOpeningFee(NO_LEASE_HUB,ceiling,undefined));
 assert.throws(()=>independentQualificationOpeningFee(NO_LEASE_HUB,ceiling+1n,'isolated-testnet'));
 assert.throws(()=>independentQualificationOpeningFee(LEGACY_HOSTED_HUB,1n,'isolated-testnet'));
 assert.throws(()=>independentQualificationOpeningFee(NO_LEASE_HUB,-1n,'isolated-testnet'));
 assert.throws(()=>independentQualificationOpeningFee('0x'+'1'.repeat(40),0n,'isolated-testnet'));
});
