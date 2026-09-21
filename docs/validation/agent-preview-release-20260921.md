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

## Public cutover and verification

Public Agent Arcade and tournaments opened on 21 September. The final web source
is `9bcb8b4`, image `aa990dfb336487d4fec0ff93adff16f704c116e4d228a7faea3db42c0bfe19b9`;
dedicated services use `16cf0fa`, image
`cf81dca8a781221bd2b9c95fe1a8eae3e95f746456e9611127df074f0736fce5`.
Human backend `e4eceb6` and its admission switch remain unchanged and open.
The original dedicated database and maintenance journal were promoted in place;
the private writers were stopped before their permanent replacements started.
The existing shared indexer was also made persistent on its existing database.
Replay retention reads that shared index; indexing may still be incomplete.

The public API reports `enabled: true`, `qualified: false`,
`validation: "testnet-preview"`. Both the catalogue and tournaments display this
status. The signed admission gate is tied to review hash
`fde2fc1bc34727fb81ede76580ddbccb71c1b62525eb217a7c17c889cc47b51d`.
See the sanitized activation receipts and public deployment record under
`artifacts/qualification/20260921/agent-preview`.

Real public HTTPS checks, without intercepted API or engine replies:

- Chrome and Edge passed home navigation, eight house identities, tournament
  rendering and no page overflow at 360, 390, 768 and 1440 pixels.
- A Chrome spectator rendered changing court frames on the renewed dedicated
  arena `0x1c5ec4b86149249e0b1a24aa2605eda6cb3f267b`, epoch 2, match 31.
- Chrome and Edge subsequently passed the live observer check on match 32 with
  a twelve-second delay injected into the second real published-result request.
  Both recorded changing court frames during eight samples of that delay. No
  response or engine state was fabricated. The first delay attempts did not
  intercept the API subdomain and remain recorded as failed, unexercised checks.
- A new virtual Mera PRF account created a sponsored public challenge, restored
  it after F5 without another ceremony and cancelled it with contract confirmation.
  This is a queue/session test, not a physical-device or completed human-bot duel.
- Chaos elimination completed after recovery; the permanent keeper automatically
  began Classic championship #3. The original timed Chaos trial remains failed.
  A full championship, all four uninterrupted formats and the final unchanged
  24-hour run are still outstanding.

The browser checks found and corrected a tablet card overflow, a tournament
read timeout and a live-court freeze while checking published results. Canonical
reads can take over ten seconds, so the UI now lets those reads complete, keeps
engine observations independent and does not wait for optional identity labels
to show the bracket.
The initial image packaging incorrectly retained an absolute self-referencing
`node_modules` symlink. The previous web was restored promptly; the corrected
image reuses the dependency layer and is privately smoke-tested before cutover.
Failed packaging and browser reports remain retained.

The obsolete September 18 test arena was released after its actual hub deadline,
with all 18 results archived. Receipt
`0x0dcb4c7f1995491668992275ab55adcbd107cace9edc8f9b04c0db5ac8772a8c`
at block 64455057 freed one of PONGIT's own slots. The permanent keeper then opened
the reserve and admitted match 31 there. No provider quota was changed and no human
arena was used. This demonstrates that transition, not continuous 24-hour capacity.

## Operations and rollback

Permanent role configuration is
`/opt/pongit/releases/agents-preview-16cf0fa/compose.json`. The reader and sponsor
have private Docker network aliases used by Caddy; no new public service ports
were opened. Keys, private browser recovery material and environment files are
outside the repository. The operator retains the original `il_lifecycle_jobs`
journal and advisory lock 701340.

Backups `agent-preview-20260921T1228Z` (ten files) and
`agent-public-live-20260921T1304Z` (eight files) have verified off-VPS SHA-256 copies.
The final web/proxy/service configuration is also backed up in
`agent-public-final-20260921T1320Z` (five files), verified off VPS.
They preserve the dedicated database, original operator journal, keys, exact
metadata, proxy and service configuration. Only unused build caches were removed;
production/rollback images, database volumes, reports and historical rights remain.

To withdraw public access, close the pool's public/general admissions and the
challenge/tournament admission switches through the same operator journal. Hide
the three optional web gates and restore the previous web/proxy configuration if
needed. Keep engines, observation and recovery running for already admitted games.
Never restore an old database over new results or restart a private writer beside
its permanent replacement. The previous human web image `human-0c44f08` is retained.
