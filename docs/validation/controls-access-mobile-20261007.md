# Controls, shared arcade login and mobile headers — 7 October 2026

## Reproduction before this correction

Production starts at the completed `04aa0c7` reship. No contract, delegation,
result, financial module or nonce journal is replaced by this correction.

Actual public Chrome Chaos/NOVA match 863 ended naturally. Its input receipt
p95 was 16.16 ms, with no protective pause. The old movement-only gate passed,
but a new release analysis found up to 1.24 pixels of additional movement
between 50 and 250 ms after key release. The 100 ms exponential reconciliation
tail kept a confirmed stationary paddle visibly moving.

Match 864 added 75 ms in each HTTP direction and explicitly disabled the
WebSocket. This is a degraded scenario, not ordinary European latency. It ended
naturally, but input-to-confirmation p95 was 421 ms versus receipt p95 192.54 ms.
Release drift reached 22.07 pixels and a protective pause lasted 3.216 seconds.
The command lane awaited a full Chaos hydration after a verified input receipt;
another intention could replace a still-unsent release during that delay.
Both original failed performance reports are retained under
`artifacts/qualification/catalogue-stop-{baseline,delay-baseline}-oct7`.

## Compatible changes

- A matching successful rules-16 `ControlQueued` receipt immediately releases
  the input lane. Secondary Chaos metadata hydration continues independently.
  Only the owned input sequence and receipt block are reused; no physics is
  invented. A receipt never extends the visible snapshot's 500 ms freshness.
  Missing responses still use the existing signed-command journal and recovery.
- Local intention changes are no longer classified as authoritative corrections.
  A stopped local paddle consumes small acknowledgement errors at the existing
  bounded 120 px/s rate instead of retaining an exponential tail. Ball contact
  geometry remains linked to the same corrected paddle.
- One explicit login prepares the two existing two-hour gameplay families with
  the same short-lived Mera root session, which is then ended. Financial and
  profile permissions remain separate. The UI describes the scope before login.
  Existing human-only sessions still need one confirmation to add agent access.
  Human grant validation now checks actual chain expiry and the renewal margin.
- Mobile header actions use equal flexible widths. The logo and sound control
  occupy a separate first row. All actions retain at least 44 px height.

## Research and limits

The installed Interlude SDK 0.2.2 documentation separates live applied events
from settled state and documents WebSocket recovery. The renderer and gameplay
commands continue to consume live state, never wait for Monad settlement.
[Interlude SDK](https://github.com/Veenoway/interlude-sdk).

Mera's PRF signing session does not itself represent an application gameplay
authorization. PONGIT previously prepared only one of its two family grants on
login, then ended the root session. That explains the second prompt.
[Mera documentation](https://github.com/category-labs/mera).

Pointer release, cancellation, lost capture, blur and page hiding remain stop
signals. The browser can cancel a pointer when it takes over a gesture.
[Pointer events](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events).

## Verification status

Before deployment: 1,031 TypeScript tests passed; the final focused control and
render suite passed 64 tests; root typecheck passed. A new regression holds the
Chaos hydration unresolved and verifies that movement and release both receive
unique confirmed nonces. It then expires the visible snapshot and verifies that
commands stop awaiting a genuine fresh observation.

Actual post-deployment measurements and screenshots are still pending. These
changes are not a claim that degraded networking or provider pauses are solved.
The scheduled task remains paused.
