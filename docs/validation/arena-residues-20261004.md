# Retiring abandoned private arenas — 4 October 2026

The user asked whether old PONGIT trials were consuming hosted capacity. Existing
authorization covers retiring unused trials, normal contract recovery and necessary
test-MON fees. The recurring qualification automation remains paused.

## Findings

A scoped scan of deployment manifests under the VPS test and release directories
identified 75 unique hub/application pairs. This is not a claim that every historic
deployment was found. At Monad block 68015831, 41 belonged to the v3 hub: 24 were
already released and 17 were active. The legacy hub had 29 released, four active
and one closing session among its 34 inventoried applications.

Nine v3 sessions belonged to stopped private trials:

- Seven rules-15 agent arenas owned by private pool
  `0x550ff3c22e20fc760af9afd68fba2cb531140dc6`.
- Two rules-14 human arenas owned by private lobby
  `0xe4cdf97e582282879219d7a888f8cd0ae629bd31`.

All nine hosted nodes still returned the exact application and canonical epoch.
Their last games were terminal. Hosted and Monad result commitments matched,
as did the published-result verifier. All nine normal close simulations passed.
The agent pool had 75 issued results, closed admission gates, five empty lanes
and zero pending engine jobs. Both human arena reservations were zero. No
running container used either private source directory. The final private
championship driver had exited successfully on 1 October with 28 fixtures.

The first local inspection failed after a burst of public-RPC requests and a
missing explicit node URL for a human arena. It sent no transaction. The second
inspection paced Monad reads, derived the documented v3 node origins and
completed. Missing reads are not treated as empty matches or settled results.

## Normal retirement

`scripts/retire-private-residues-20261004.ts` permits only these nine exact apps,
the original two private authorities and the v3 hub. It verifies the fresh
off-VPS backup, rechecks all nine published/hosted results before any close,
uses the original operator nonce journal and never calls forceClose or open.
The root TypeScript check passed. The executable script hash is
`35d424f86cd43bf9db93a9e124a82b2b106098b3cdb5068b8e26fb4d97c8b347`.

The sole worker `pongit-residue-retirement-20261004-1` started at 04:22:52 UTC.
Its original deadline is 05:40:52 UTC. All nine normal closures confirmed by
04:24:03 UTC. Actual hub release deadlines range from 05:23:33 to 05:24:03 UTC
(07:23:33–07:24:03 in Paris). It waits for the canonical block timestamp, then
releases and verifies each exact finalized result root. Human root sealing is a
separate journaled transaction. No match cancellation or public mutation occurs.

At this checkpoint the worker is waiting for the real challenge window. This is
**not** a completed release or proof of recovered hosting capacity. Do not start
another writer, repeat closes, change the live script or extend its deadline.
After exit, inspect `/opt/pongit/tests/arena-residue-audit-20261004/retirement-1.json`
and canonical status/root evidence before taking another action.

## Hosting and preservation

The v3 control's `/health` reported 50/50 hosted machines before closure and
still 50/50 immediately afterward. Its separate validator limit is 128. A
contract release must not be presented as a freed hosted-machine slot until
the hosting service and actual admission prove it. The documented SDK exposes
session create/get/opt-in; no authenticated owner stop/delete operation was
found. No undocumented provider endpoint or credentials were tried.

The existing public v3 arenas, public human relayer and historical incidents
are excluded. In particular, the old `4cecc7…` closing incident, other legacy
balances/results and all failed trials remain preserved. A private test lobby
is never substituted for public human history.

Backup `arena-residue-20261004T0425Z` contains four files, 62,787,136 bytes:
the original operator DB, both private test DBs and private runtime/evidence.
Every file was copied to Windows and SHA256-verified at 04:21:26 UTC; the label
is a backup identifier, not its measured creation time. Manifest SHA256:
`b01d64b4d7dc1233be2d7d2ad00084e67977066e17e02221704ff62e3d4e023b`.
No database was restored or deleted during retirement. A post-close backup
`arena-residue-20261004T0426Z` also preserves the newly journaled transactions:
four files, 62,588,014 bytes, SHA-verified off VPS at 04:27:23 UTC, manifest
`4f2632cf2ea36eac02ed8a006cf1cb9025801e16dfca4c385daf9c2c7d1ef09c`.
At 04:28:15 UTC the sole worker remained running without error, nine closed and
zero released; the hosting counter still reported 50/50. Original runtime image,
databases, reports and historical replay routes remain intact.

References: [Interlude deployment terms](https://github.com/Veenoway/interlude-sdk/blob/main/docs/DEPLOYMENTS.md),
[session closure and release](https://github.com/Veenoway/interlude-sdk/blob/main/docs/04-security.md),
[hosted limits](https://github.com/Veenoway/interlude-sdk/blob/main/docs/LIMITS.md).
The measured live hosting limit of 50 takes precedence over the documentation's
default 40; neither is the validator's 128-delegation limit.
