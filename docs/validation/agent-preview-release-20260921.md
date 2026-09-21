# Agent Arcade public testnet preview, 21 September 2026

The owner requested immediate public deployment after being told that the final
endurance and tournament qualification remain incomplete. This release explicitly
uses `testnet-preview`; it does not relabel partial or failed tests as qualified.
Public configuration retains `verifiedCapacity: 0`, `qualificationEvidence: null`
and `qualified: false`. A separate preview review hash is bound to the exact
deployment and the contract admission switch. Invalid identities, unknown runtimes,
human arena reuse and signing keys in public metadata remain rejected.

## Evidence and limits

Eight house agents are contract-qualified in both modes. Classic elimination
completed in the real hosted engine. Chaos elimination encountered delayed
publication and exceeded its original 75-minute diagnostic; its original failure
remains published. The subsequent recovery captured the real result and continued
the same bracket. Neither run establishes uninterrupted service. The other two
tournament formats and the final unchanged 24-hour trial remain incomplete.

The human release and its financial contracts are unchanged. Agents have no
markets, entry fees or prizes. Agent services use only their dedicated arenas,
database, scoped gameplay keys and the existing shared operator nonce journal.

## Admission and release budget review

The reusable agent adapter confines delegated writes to one physical slot:
fields 0 through 66, plus 19 fixed epoch/accumulator words. Logical match IDs,
participants, learning states and authorization changes reuse these keys.
Common identities, ELO and tournament records are written on Monad outside the
physics delegation. This gives a conservative 86-key overlay envelope, independent
of match count. The sixteen-level result tree additionally bounds an epoch to
65,536 results.

The actual hub runtime `9380248d1c5debacf028290ca54271acd79f68eedfd91dbc9e605ec19937d8da`
released 16,000 synthetic batches over 86 reused keys in 1,451,957 gas before
refunds on the read-only fork. The dedicated reusable agent path also actually
released a 4,264-batch epoch in transaction
`0x52d51b311c127539ac61a5b9b3bb175572987da55933b814aa199049efef27da`,
using 1,509,550 gas. Those are release bounds/evidence, not a proof of hosted
publication latency or continuous availability.

The preview limits an epoch to 16,000 batches, reserves 8,000 before a new match,
and retains the contract's seven-minute admission time reserve for six minutes of
regulation/overtime plus margin. Rotation targets two hours of service, with a
reserve arena only when actually admitted and observed. A failed reserve opening
backs off without blocking the other admitted arenas. A closed or unhosted arena
never counts as the replacement needed to rotate another. Unpublished results
retain their participation until verified publication or protocol recovery.

The 8,000-batch reserve is an operational margin, not a measured maximum network
delay. A stalled publication may still delay the affected lane. Human games remain
independent. The preview notices and API expose the incomplete qualification.

## Deployment checks

The changed release validation passed root TypeScript and 629 TypeScript tests,
including rejection of a preview falsely claiming completed qualification,
mismatched on-chain evidence and leaked service-key metadata. Documentation builds
28 articles and 190 searchable sections. Production build, exact backups, public
API/browser checks and the deployment receipt are recorded after cutover below.
