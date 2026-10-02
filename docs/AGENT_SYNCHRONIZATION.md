# Agent synchronization, rules 16

This is the candidate protocol. Historical rules-15 matches keep their original
behavior. A successful local test or a running container does not authorize a
public migration. See [current qualification](validation/sync-release-20261002.md).

## Player and ball

The participant projects its paddle, the ball and the official bot from the same
fixed-point state and timed input intentions. The public bot controller state is
part of the atomic snapshot. Prediction never supplies a result or an unrevealed
Chaos draw. A confirmed input includes its actual physical application time;
transaction acceptance time is not substituted for that time.

Every instance is identified by network, arena, epoch and match. Its input log,
controller memory, nonce journal and result belong to that reference. Reconnecting
one friendly instance cannot reset another instance or release its competitive
tournament identity.

## Interrupted friendly play

Rules 16 protect friendly matches between a human and an official PONGIT bot.
Community agents, tournaments and human-versus-human rules are unchanged.

- A human input or heartbeat grants at most 500 ms of further physical time.
- The browser sends a heartbeat every 200 ms only while visible, ready and
  recently rendered. Transport success alone does not prove the player can see.
- Once the credit expires, every physics entry point obeys the same contractual
  time cap. A late heartbeat does not retroactively advance the interrupted game.
- Resumption requires fresh human heartbeats and a three-second countdown.
  Physical time resumes from the frozen state rather than catching up the outage.
- An interruption exceeding the cancellation deadline ends with no winner and
  no competitive ELO change. The cancellation is still published and archived.

The engine currently measures these deadlines as 50, 300 and 3,000 blocks,
respectively, using its nominal 10 ms clock. Exact wall-time behavior must pass
the hosted clock gate; the earlier Chaos samples at 95.69% and 96.32% failed.
Do not describe those nominal durations as a verified wall-clock guarantee.

## Recovery and transport

Interlude SDK/CLI 0.2.2 are pinned. The send router selects transport but does not
retry a signed game command. The existing journal owns its exact bytes and nonce
until receipt or canonical epoch-closure evidence resolves it. An HTTP timeout,
missing response or local cooldown is not evidence that execution did not occur.

Recovery checks chain, immutable runtime, arena epoch, match binding and current
scoped permission. A short canonical hub observation bounds ongoing controls;
network failure does not request a replacement passkey. Stalled HTTP bodies are
also bounded, so they cannot retain a shared read lane indefinitely.

Spectators consume the ordered processed-state stream. A gap is reported as
synchronization rather than fabricated confirmed movement. The local optional
warm-up uses a browser monotonic clock and pauses while hidden.

## Evidence required before release

Retain failed attempts. Measure actual catalogue admission, browser input and
rendering, hosted Classic/Chaos wall time, publication and independent renewal.
Test outage, late response, revocation, F5 and separate instances. Preserve old
URLs, permissions, competitive ratings and result history during continuation.
The final unchanged 24-hour trial includes five agent matches and human play;
Node projection tests do not substitute for Chrome/Edge or physical passkey tests.
