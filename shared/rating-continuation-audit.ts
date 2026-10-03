import assert from 'node:assert/strict';
import {keccak256,toHex} from 'viem';
import type {HistoricalArtifact} from './historical-runtime';

// Reviewed ContinuingAgentRatings build: seed and seedPairCounts always revert,
// and only finishImport can seal the ledger. Pin the masks as well as the code;
// an arbitrary artifact must not be able to hide changed opcodes as immutables.
const reviewedTemplate='0x2b5bca7d87c8ad5c971bb3616e66ca053ed1b163eb10dab81544baf8fb041ddf';
export function assertReviewedRatingContinuation(artifact:HistoricalArtifact){
 const d=artifact.deployedBytecode;
 const fingerprint=keccak256(toHex(JSON.stringify({object:d.object,immutableReferences:d.immutableReferences,linkReferences:d.linkReferences})));
 assert.equal(fingerprint,reviewedTemplate,'Continuation artifact has not been reviewed for seed rejection');
 assert.equal(Object.keys(d.linkReferences??{}).length,0,'Unexpected rating library');
 return fingerprint;
}
