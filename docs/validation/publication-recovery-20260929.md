# Public Agent Arcade recovery — 29 September 2026

The reported `Arcade is recovering` state reflected a real publication outage.
The shared Interlude publisher had 1.126185383116930335 test MON, below the
observed 2.448 MON cost of one publication. The page was not the cause.

This operation restored public human–agent play and corrected a second PONGIT
defect that prevented finished games from releasing their challenge lanes.
It does not qualify the entire release, the new bot difficulty policies or a
24-hour service guarantee.

## Funding and nonce recovery

Following the user's instruction to perform the previously proposed bounded
recovery, exactly 3,000 test MON were sent from the controlled operator
`0x369158Ac444278541322643E46e0D5b45ac21C4C` to the shared publisher
`0xB28E684815b095aB5Fb324214cfEa63d76F3d691`.

- Transaction: `0x46807aaa07b794b6992d33237cdc08adf16fa7e90fb52363f0c461ebb03708ab`.
- Block: 66692331; journal: `publisher-recovery-20260929-1247:bounded-funding`.
- This is not a repeat of the previous 6,000-MON funding operation.
- No automatic external top-up was enabled.

The scoped archive operator had separately exhausted its gas reserve. Ten test
MON were moved to that controlled service address,
`0x38078433f7a63b3e6abdef49a726599d655f42c5`, in transaction
`0x635f888446b9351224a2b69ba8cb625ea08fa091e85baca2ef278d1b77a1ddb8`, block
66694494. No player was charged.

An existing signed archive operation at nonce 2329 continued to receive
`Signer had insufficient balance` from two RPC routes after funding. Both latest
and pending nonces remained 2329; the funded transaction simulated successfully.
Under the original scoped lock, the exact journaled bytes were broadcast through
the recovery RPC. Transaction
`0x30bdf0a9bec40fca492a3b104830f52bc073097af132da5d3fe913b33e885f3e`
confirmed at block 66696130. No replacement signature, nonce or fee was created.

`eb0bd36` makes this recovery available to the archive role only, with an explicit
recovery endpoint, hash/signer/network validation and sufficient balance plus
unchanged latest/pending nonce checks on both endpoints. A lost response keeps
the existing journal. New transactions also check the full gas provision before
signing, preventing an unfunded operation from unnecessarily locking a nonce.

## PONGIT defects corrected

The archive service had submitted thousands of historical synchronization calls
even when the source ledger had not changed. It spent its reserve and then held
current result captures behind the unresolved transaction.

`8fee3f8` replaces unchanged-history writes with bounded, pinned read-only finality
inspection. Source revision changes and interrupted imports still trigger the
contract's synchronization. A failed, incomplete or misbound read is never treated
as proof of unchanged history. Current result captures precede the finality scan.

`eb0bd36` also batches independent qualification reads. The measured qualification
portion fell from approximately 6.5–7.5 seconds to 1.1–2.2 seconds in the first
post-deployment samples. Whole admission time remained substantially longer.

`9d1b37a` batches independent capacity, challenge and arena-entry reads without
removing the block-hash recheck, player/bot binding, full match reference or
historical URL protection. No contract, physics, visual rule or financial rule
changed in these patches.

## Runtime

Runtime Compose remains
`/opt/pongit/releases/arcade-d2c6033/five-runtime/compose.json`.
Public V5 pool remains `0x205d5739136d6cb73d732e1146e1ce034798a613`, with four
independent house challenges and one tournament lane. `qualified=false` remains
accurate. No migration was performed.

- Archive and admission: `eb0bd36`, image
  `sha256:932c135c5e9cb4c4aa7524eb79d8f3ffc52b2d0931cd47d3d9ddcbdc4c5f9da0`,
  deployed around 13:25 UTC.
- Reader: `9d1b37a`, image
  `sha256:23de88b8bd3b0973ab95b4975de4a45f41a377a15e5780672f1f95f35f2c6e0f`,
  deployed 13:38:57 UTC.
- Web remains `d6170ba`; engines, maintenance and sponsor remain `e4bd537`.
- The human relayer image and mounts were not replaced or restarted.

The shared RPC was also investigated. Four VPS header reads took 453–642 ms
through the existing route; the public Monad endpoint took 12–70 ms directly.
Both providers agreed on chain 10143, canonical block 66702475 and the pool code.
The local gateway now prefers the faster endpoint and retains the previous one
as fallback. Its combined configured dispatch ceiling is unchanged: one 50 ms
budget and one 85 ms budget. Existing cooldown, backpressure, read coalescing and
exact-transaction recovery remain in force. This does not change a provider quota.
Queueing inside the gateway still contributes latency; raw endpoint timing is
not presented as player admission timing.

## Actual public browser evidence

All runs below used the real public catalogue, production API, Monad sponsorship
and hosted Interlude engine. The Mera authenticator was virtual, not a physical
passkey. Successful control runs exercised at least 100 executed direction
commands, the real launch countdown, F5 without new passkey consent, and a
published result after conceding only the synthetic fixture.

| Run suffix | Mode/browser | Result | Local movement p95 | Executed receipt p95 |
| --- | --- | --- | --- | --- |
| 1256-chrome | Classic/Chrome | Original FAIL retained: capture timed out; later captured | 15.4 ms | 16.00 ms |
| 1313-edge | Chaos/Edge | PASS | 15.9 ms | 28.30 ms |
| 1316-chrome | Classic/Chrome, reused session | PASS | 15.6 ms | 17.52 ms |
| 1331-chrome | Classic/Chrome, reused session | PASS | 15.4 ms | 16.38 ms |
| 1335-chrome | Classic/Chrome, reused session | PASS | 15.1 ms | 15.66 ms |
| 1341-edge | Chaos/Edge, reused session | PASS | 15.5 ms | 16.35 ms |
| 1350-chrome | Classic/Chrome, reused session | PASS | 15.7 ms | 15.79 ms |

Reports, input traces and captures are in
`artifacts/qualification/catalogue-recovery-20260929-<suffix>/`. Private browser
recovery material is stored separately outside the repository and never included
in these reports. Initial timing used the beginning of Playwright's click action,
which includes actionability waiting. The 1341 Edge run records the actual DOM
click and first countdown: **29.841 seconds**, so the eight-second admission target
was NOT met. This run preceded the RPC preference change. A successful gameplay
test must not be mislabeled as a successful admission-latency gate.
The post-change 1350 Chrome run measured **31.884 seconds**. It does not demonstrate
an admission improvement. Timing-only public evidence is retained in
`docs/validation/evidence/publication-recovery-20260929.json`.

779 TypeScript tests, root typecheck and the 34 focused recovery/reader tests
passed. Gitleaks found no secret in the three implementation commits. No Solidity
code changed; this operation does not claim a new full physical comparison suite.

## Preserved tournament incident

Arena `0xf202862714f61d6f6b8b14c1d2f5d3ca7ea3e41b`, epoch 1, match 190 remains an
independent unresolved incident. Its archived terminal score is 6–1. Canonical
state still has batch 914 and only two published results. Its hosted node is
unreachable from both VPS and desktop, while the directory returns 404.

One bounded, journaled same-epoch rehost attempt on 29 September around 13:17 UTC
returned HTTP 409: `this app is not Active on the hub`. The canonical hub read
still reported status 1, epoch 1. Operation `node-recovery-20260929-f202-e1` retained
both sending and refusal evidence without replacing the original provisioning
record. Do not loop this POST, force-close the arena, discard the result or move
its live participation to another match. Other challenge arenas remain usable.

This unresolved publication prevents claiming that tournaments and the next
immutable difficulty migration are complete.

A read-only `forceClose` simulation passed at block 66703848 with an estimated
100,924 gas. This would abandon the unpublished result, so a concrete approval
question is pending. The participants are DRIFT and a community strategy, not
two disposable house fixtures. No closure was sent; the protected result and
original journal remain. Recovery would then respect the hub's real delay, with
release/sealing owned by the existing keeper. The follow-up remains paused for
that decision, not for the now-resolved initial funding request.

## Backups and rollback

Fresh backup `publication-recovery-20260929T1344Z` contains operator and agent
dumps, runtime metadata/journals and shared RPC Compose configuration. All four
files have SHA-verified off-VPS copies in the private backup directory:

- agents.dump: `5a30958104ca746361dc10c76d90a21584bf5bc9abdffe31ae96b98fa87d5421`
- operator.dump: `2dcbac7e81014874e936365e41488fc9069a0e2f8c87fef5252be85bb2773b68`
- runtime.tar.gz: `7c0e3059b814d12cfbc900ec64f974bf4f6748a250ccda4e6a0b8567f2bce4df`
- rpc-compose.tar.gz: `6d4e88e083d9c2249110f9baeaa96fee25bfef661cc3ce38b97818d5fc44b0fb`

Earlier 12:50/13:05 backups and all failed reports remain. Previously tested
restores are recorded in the catalogue recovery report; copying a new dump is
not itself a new restore test.

Rollback service images/configuration independently. Retain all current databases
and transaction journals. The previous reader is `71b535e3062d`; the previous
archive image `d88a91c8adcd` retains the history-write fix. Returning all the way
to the original archive would reintroduce unnecessary writes and is not advised.
The RPC preference has its own pre-change Compose backup. Never restore old
databases over transactions created after these snapshots.

At 13:39 UTC the shared publisher held 1,980.310185383116930335 MON, the archive
operator 9.103986976 MON and the controlled main operator 631.439243918 MON.
Shared balance changes cannot all be attributed to PONGIT, and this funding is
not an adequate guarantee for the still-pending continuous 24-hour qualification.

## Final backup and runtime observations

`publication-recovery-final-20260929T1357Z` includes the latest runtime and RPC
configuration. All files have SHA-verified off-VPS copies:

- agents.dump: `9a7f3dfba9f2e1df81fb99004202f87798f6b4b1ea539e97f2180ab5bb5f5986`
- operator.dump: `2bd6a6afb31826d657b400eba027a25f24444f4b5531cf4d37bfcda6b4732fc2`
- runtime.tar.gz: `877a155de61971d0e8dc36b4b5911c14bac19854d166ed282c06166e0c81df92`
- rpc-compose.tar.gz: `b14bedd9b33fde509110f5fdaed5fbe31b33059bfb6a6487866f8258103479b5`

Both exact database dumps were restored into explicitly named scratch databases
and queried. The restored operator dump contained 2,340 archive jobs and the
confirmed funding transaction. The agent dump contained all three f202 epoch-1
archived results, including match 190 and its unpublished root. Only those new
scratch databases were removed. Source databases were not restored or modified.

At 13:54 UTC, five arenas reported available. The existing keeper had renewed
028f to epoch 4 and 4017 to epoch 5; 76ca and a5f7 were closing normally. These
status observations are not a new complete post-renewal gameplay qualification.
The archive had no unresolved signed operation. Temporary profiling was removed
and the archive/admission services restarted cleanly.

The shared gateway observed three throttles in the short post-preference window
and automatically slowed its primary dispatch interval. No zero-throttle claim
is made. The configuration rollback remains independent from all databases.
The human relayer's sorted runtime fingerprint stayed unchanged; its shared RPC
dependency was restarted and reconfigured, so human transport was not untouched.
