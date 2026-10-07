import assert from 'node:assert/strict';
import {keccak256,toHex} from 'viem';
import type {HistoricalArtifact} from './historical-runtime';

// Reviewed ContinuingAgentRatings build: seed and seedPairCounts always revert,
// and only finishImport can seal the ledger. Pin the masks as well as the code;
// an arbitrary artifact must not be able to hide changed opcodes as immutables.
const reviewedTemplates=new Set([
 '0x67d3c0a58fe5131de9cd58ed5baf5c7050209d7bbe3ae8c79a287f04f1a44334',
 // Public f4f8fef build: identical executable bytes and immutable positions;
 // only imported-source metadata/AST ids differ. Both full templates remain
 // pinned, including metadata and every immutable mask (7 October audit).
 '0xac3223592681e156f5985f4ccda7047cb51695c8b49d8d45757b8db19e462367',
]);
export function assertReviewedRatingContinuation(artifact:HistoricalArtifact){
 const d=artifact.deployedBytecode;
 const fingerprint=keccak256(toHex(JSON.stringify({object:d.object,immutableReferences:d.immutableReferences,linkReferences:d.linkReferences})));
 // solc AST ids change when an unrelated test joins the compilation. They do
 // not identify runtime bytes: preserve the full bytecode and exact sorted
 // offsets/lengths, including duplicates, instead of those incidental labels.
 const positions=Object.values(d.immutableReferences??{}).flat().sort((a,b)=>a.start-b.start||a.length-b.length);
 const template=keccak256(toHex(JSON.stringify({object:d.object,positions,linkReferences:d.linkReferences})));
 assert(reviewedTemplates.has(template),'Continuation artifact has not been reviewed for seed rejection');
 assert.equal(Object.keys(d.linkReferences??{}).length,0,'Unexpected rating library');
 return fingerprint;
}
