# Agent admission latency, 4 October 2026

The user requested shorter waits after the sync fixes in `71afb6e`. Production
testing and necessary TEST MON spending are authorized. The recurring task
remains paused.

## Reproduction and cause

The existing actual public Edge Chaos 639 trial used a valid saved Mera session
and added 20 ms to each engine HTTP request and response. It took 14.035 seconds
from the catalogue click to the first real countdown digit. Sponsorship was
confirmed after 4.350 seconds; initial arena checks completed around 6.2 seconds.
The first command then waited for an unavailable send WebSocket. Its four-second
connection deadline was followed by journal recovery and a second handshake.
The eventual confirmed ready command arrived around 13.0 seconds.

A new local transport regression reproduces this mechanism with a real HTTP
server and an intentionally stalled WebSocket upgrade. Before the patch it
fails after 4,043 ms, without delivering a command. This failure is retained in
`artifacts/admission-cold-socket-before.log`.

## Correction

`4e2acb1` opens the optional send socket during existing arena verification.
Transport selection uses HTTP immediately until that socket is actually open.
This choice happens before any command is sent. An established socket's lost
response still requires the original journal owner to reconcile the exact
transaction; no write is automatically retried over another transport.
Epoch, permission, publication, nonce and Retry-After checks are unchanged.

The stalled-upgrade regression now completes in 107 ms with exactly one HTTP
write, one journal entry and one acknowledgement. The socket never later sends
that command. The established-but-unanswered socket test still waits for its
bounded response deadline, retains uncertainty and sends no fallback write.
Ninety-eight focused tests and root TypeScript pass. No unrelated contract
artifact or test allowlist was changed.

## Hosted verification

The web image was deployed at 06:08:43 UTC:
`sha256:342c8856e85960a1f5e0c1977c17236c12a201fe927b978f3309c82eb6865d08`.
Both existing Compose definitions agree; all backend start times are unchanged.

- Edge Chaos 655, same HTTP-only transport and 20 ms each-way delay as baseline:
  admission **7.845 seconds**, down from 14.035 seconds (44.1% shorter).
  219 confirmed inputs, input-to-receipt p95 81.9 ms, local p95 17.1 ms,
  player/spectator holds 150.2/116.4 ms, no correction jumps. Result 1–7 published.
- Chrome Classic 657, the same delayed HTTP conditions: admission **7.513 seconds**.
  218 confirmed inputs, input-to-receipt p95 67.6 ms, local p95 16.6 ms,
  player/spectator holds 167.1/133.7 ms, no correction jumps. Result 2–7 published.

Both pass every measured performance gate. Each uses the actual public
catalogue and saved Mera authorization, has more than 100 confirmed controls,
F5 and a spectator. The only resume request is the deliberate F5 recovery.
No gameplay state or contract result is mocked. These use a virtual PRF
authenticator, not a physical passkey or mobile-device test.

Chrome Chaos 659, without forced HTTP or artificial delay, also passes every
gate: **6.735 seconds** admission, 220 confirmed inputs, input-to-receipt p95
16.9 ms, local p95 16.3 ms, player/spectator holds 233.3/149.4 ms, and zero
correction jumps. The established send sockets delivered responses normally.
The only resume was again the deliberate F5; the 2–7 result was published.

All three final trials pass. These bounded matches establish the improvement
for a valid session with an available hosted arena. They do not establish a
population p95, 24-hour availability or wait time when every hosted arena is
occupied. The independent machine-capacity constraint is unchanged. No further
game or browser driver remains active. `agent-admission-20261004.json` includes
the exact measurements and hashes of all reports, traces and screenshots; the
complete copies are retained in `admission-browser-evidence.tar` on the VPS.

## Backup and rollback

Before deployment, all seven files in `play-recovery-20261004T0548Z` were copied
off VPS and checked by size and SHA256 at 06:08:14 UTC. The backup label is an
identifier; measured creation finished at 06:06:46 UTC. Manifest SHA256:
`cc016c00e726c091c996c0004fc23fa91c464832cfe4522f1b8dcd373fa1b12b`.

The prior web image remains
`sha256:4cc5769ca08672a58a9137ba3f099aff48af55c9411a6eb1a27e237eb9d41043`.
Rollback restores only the `arcade-web` image reference in the existing
`sync-public-214c95a/live-v3/compose.json` and `arcade-d2c6033/five-runtime/compose.json`,
then recreates that service with `--no-deps` and project `pongit-arcade-five`.
Exact prior configurations are saved privately as `compose-before-4e2acb1-*`.
Never restore old database contents or nonce journals for this transport change.

After the final published result, backup `play-recovery-20261004T0615Z` preserved
the updated databases, configurations, source patch and complete browser
evidence: seven files / 358,778,816 bytes. Every size and SHA256 matched the
off-VPS copy at 06:17:54 UTC. Manifest SHA256:
`b70aad2ab11bbca90eeeae470b1bf09128779c83097740e4c3facfa980f0894f`.
The usable disk measurement after backup is 78.85%. This is copy verification,
not a repeated restore exercise. Automation remains paused as requested.
