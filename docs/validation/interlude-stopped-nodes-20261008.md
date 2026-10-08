# Interlude hosting incident — 8 October 2026, 06:17 UTC

Seven newly delegated PONGIT apps remain `stopped` in the public control directory.
Four other new apps on the same hub successfully execute and publish with the
same provisioning code. No request to change capacity or protocol configuration.
Please inspect/restart the existing seven hosted machines without undelegating.

Hub: `0x98922c6E5e4Bea62761C71D2401c7ec2c26eC43e`. SDK 0.2.3, Node 24.21.0.
Canonical Monad block 69182024: all seven Active, epoch 1, expiresAt 0, zero batches.
They have received no gameplay writes. Four active peers have 3–10 batches.
No missing player funds, publication gas load, or gameplay rate limit is involved.

| Role | App |
| --- | --- |
| agent | `0x077df08fa9ff9bbfcba2a3c6879bcf3b21efd3df` |
| agent | `0xcc4fbf1df9b4bf61353660c40e8f05c5135c3b23` |
| agent | `0x4e9fa437576b1b2b386fe1ec24d26839434effb2` |
| agent | `0x21a573b3c39265d27ad98f70e8942fd55af54391` |
| human | `0xc8e978e3c6581eb5454e486eb247c503ffbc0e3d` |
| human | `0x58a5f04bbad06061eab3a7a27c75291d5fa63084` |
| human | `0x417236584b76a00a8c19b792fc3896f149b0055e` |

Read-only reproduction (no credential needed):

```sh
curl --max-time 10 https://control.interludelayer.xyz/sessions/0x077df08fa9ff9bbfcba2a3c6879bcf3b21efd3df
curl --connect-timeout 5 --max-time 10 https://il2-eu-077df08fa9ff9bbf.fly.dev/health
```

Directory HTTP 200 returns `status: stopped`, `hubStatus: Active`, the correct app
and pinned URL. The node resolves to IPv4, then times out in TLS before HTTP
(curl 28, SSL connection timeout). Healthy peer:
`https://il2-eu-264101ca1936cfd1.fly.dev/health`, HTTP 200.

At 05:52 UTC, one official owner-consented POST /sessions per stopped agent app
was acknowledged HTTP 200, but still returned stopped. Each attempt is durably
journalled; no repeated creation, closing, forceClose or credential guessing.
Human original create attempts were retained; their lookup also says stopped.
The official CLI exposes create/get/opt-in, no documented restart operation:
[official sessions source](https://github.com/Veenoway/interlude-sdk/blob/main/cli/src/sessions.ts).

PONGIT-side DNS caching was separately fixed and HTTPS checked on healthy peers.
Human Compose's entrypoint was separately corrected. Neither accounts for these
control-directory stopped states and TLS failures. Four healthy agent apps serve
public evaluation with failed apps explicitly excluded per epoch. PvP remains
closed while its three nodes are stopped. No five-lane or full-release claim.

Local evidence: `artifacts/responsive-20261008-r2/hosting-readonly-0607.json`,
`hosting-canonical-0617.json`, `empty-node-recovery-20261008-1.json`.
All these reports contain public identifiers only; no credentials or signatures.


## Recheck at 08:23 UTC

All seven direct pinned HTTPS health endpoints still fail before HTTP with
`curl: (28) SSL connection timeout`. TCP connection succeeds in19-24ms, then
TLS times out at5seconds. The known healthy2641 peer returnsHTTP200 in198ms.
The public directory still reported stopped/Active at07:59. Canonical69203457
at08:06:57 retains all11Active epoch1 delegations without expiry. The7unreachable
apps retain0batches; the4healthy ones have33-42batches. No additional hosting
creation, restart request, undelegation, forceClose or provider change was sent.
PONGIT's seven natural visible browser games on healthy nodes now pass their
strict latency, movement, collision and no-pause gates. This isolates the
remaining PvP/parallel-capacity blocker from those repaired gameplay defects.
Read-only evidence: `artifacts/responsive-20261008-r2/hosting-tls-0823.json` and
`canonical-0806.json`. The required action remains provider recovery of the
existing stopped machines without closing their delegations.


## Final recheck at 11:19 UTC

The directory still returns stopped/Active for all seven. Canonical69240837
confirms epoch1, no expiry and zero batches on each. From the production VPS
over IPv4, all seven establish TCP in18-22ms then fail TLS after5s (curl28).
Healthy2641 returnsHTTP200 in250ms with the same check. Operator reserve is
49,569.57387803 testMON: additional funding does not address these stopped nodes.

Read-only evidence: `artifacts/responsive-20261008-r2/canonical-final-1120.json`,
`hosting-final-1118.json`, `hosting-ipv4-final-1119.json`. No new provider write,
undelegation or force-close was submitted. Seven normal visible agent matches
and two recovery trials passed on the latest public build; PvP and full capacity
remain blocked. Please recover the existing hosted machines without closing
the delegations.
