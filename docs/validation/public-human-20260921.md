# Human production reopening, 21 September 2026

Human admissions are open at https://pongit.xyz. Agent Arcade and automatic
tournaments remain private. Their remaining qualification and final unchanged
24-hour trial are not implied by this human release.

Production uses backend commit `e4eceb6` and web build `0c44f08`. The backend
image is `sha256:e6fa5f722906a48093b89d29c059bc75c44c10cb0c197273798c61882567ac97`.
The relayer is the sole human lifecycle, admission and physics service; the
human business database is `pong_human_rules14` and the original operator nonce
journal remains in `pong_relayer`. No competing private human writer was resumed.

## Public gameplay evidence

The Chrome Classic trial completed at 10:24:47 UTC through the real public
HTTPS site and API, with three fresh Mera accounts and virtual PRF authenticators.
It verified contract matchmaking, dual consent, all three countdown digits,
F5 without another owner ceremony, 153/154 accepted controls, and a 7:6 result
matching both players and the neutral spectator. This is not a physical-device
passkey recovery claim.

The Edge Chaos third trial completed gameplay at 10:49:02 UTC: real room creation,
two consents, an automatic spectator, all three countdown digits, F5, 163/153
accepted controls and a matching 7:6 result. Its financial assertion was
insufficient: it treated a re-enabled button as purchase confirmation. The
actual transaction reverted after the betting window closed. Its original
report remains intact and cannot be used as a passing financial proof.

The fourth trial correctly checked purchased shares against Monad and failed
that check. Gameplay reached 7:4 but the late bet again reverted, leaving the
credit unspent. A fifth trial submits the spectator's financial action in
parallel with the player reload checks, retaining the real contract window and
checking actual positions. That fifth trial passed at 11:04:37 UTC with 165/159
accepted controls and a matching 7:6 result. Purchased shares were verified
against the financial contract. The disconnected beneficiary then received
0.006 test MON automatically, confirmed by `PayoutPaid` in canonical block
64,431,716, transaction
`0x0288e66e88df2bdf8da9dbeeb27275499e9d2155662590c100cc8612d99b2c7d`.
The six retained browser verdicts and separate canonical payout proof are in
`artifacts/qualification/20260921/public-human`. No original failed result was
overwritten or upgraded to a pass.

## Corrected room discovery

The first public Chaos attempt exposed sequential scanning and simulation of
empty historical rooms. The service now reads up to four rooms concurrently,
prioritizes recent event hints, preserves a rotating durable page for missed
notifications, and skips rooms without two present players. Room maintenance
is independent of ranked assignment. The contract still chooses participants
and checks blocks, capacity and consent.

619 TypeScript tests and root type checking passed before deployment. The
second browser attempt also showed about 25 seconds of sponsor contention
during private tournament initialization. The fixture now records the actual
offer delay and uses the same 120-second discovery timeout as the Classic
fixture; the contract consent window is still 20 seconds. In the third trial,
offers became visible 8.0 and 10.0 seconds after the second player joined.
Both original timeout reports remain failed evidence.

The deployed reserve guard also prevents an opening refusal or RPC failure
for a replacement from disabling admission on an existing healthy arena. It
backs off retries and still checks that arena's real epoch, availability and
publication budget. It does not assume a new delegation or discard an uncertain
transaction. All 621 TypeScript tests and root type checking passed before this
last backend deployment, including capacity refusal and failed-read regressions.

## Capacity and recovery limits

At reopening, only arena `0x596562d63e678a2b391ff01f63cf7ded99fc2c25`, epoch 2,
was available. A preceding lifecycle policy incorrectly closed the two fully
published idle arenas. The correction in `748215d` is included in this release.
Their real hub release deadlines are 11:12:32 and 11:12:46 UTC; production owns
their release, sealing and renewal. Until that recovery is observed, there is
one available lane, not a verified continuous two-lane service.

A separate private agent renewal at 10:56 UTC was rejected with
`ValidatorAtCapacity()` (`0xe90bcd65`). Its selected arena was already released;
there was no new delegation or public agent opening. The two existing agent
arenas continue their separate qualification. No human slot is assigned to a bot.

## Backup and rollback

The 10-file pre-update backup `human-room-admission-20260921T1037Z` was verified
off the VPS, including the live human and original operator databases and
runtime configuration. The earlier complete backup and rollback images remain.
Only exact, hash-verified duplicate dumps and unused source archives were
offloaded, bringing disk use to 79.931% before the small backend image build.
Before the final reserve guard, the refreshed 10-file backup
`human-reserve-guard-20260921T1106Z` was verified off the VPS. Disk use was
79.963% before that small image build. Both deployed source hashes were checked
inside their containers against the audited worktree files.

Rollback restores the preceding service image/configuration after stopping the
new writer. Keep the current databases, operation journal, published results,
financial rights and historical contracts; do not restore an old data snapshot
over subsequent user transactions or renew the retired human source deployment.
