# Hosted arena reachability, 20 September 2026

The new private PONGIT arenas initially could not be reached from our IPv4-only
VPS. Their A records subsequently appeared without a VPS networking change.
This is a historical provisioning diagnostic, **not an outstanding request to
change the VPS or allocate IPv4**. It does not establish a gameplay pass.

Observed at **08:02:55 UTC**:

| Application | Hosted domain | Public A record | Public AAAA record |
| --- | --- | --- | --- |
| `0x24caa0e6800204c415e3c046cb8e1da553e0c63d` | `il-24caa0e6800204c4.fly.dev` | No answer, DNS status 3 | `2a09:8280:1::194:d6fa:0` |
| `0x34467b8f00d3c929f8f0c327f7cdef3639656598` | `il-34467b8f00d3c929.fly.dev` | No answer, DNS status 3 | `2a09:8280:1::194:d78c:0` |

At **08:00:58 UTC**, a read-only GET of
`https://control.interludelayer.xyz/sessions/0x24caa0e6800204c415e3c046cb8e1da553e0c63d`
returned HTTP 200, the expected application/URL, and `status: live`.
The corresponding delegation has opened, but the game has not been exercised.
The second application's delegation admission and its DNS record are distinct:
an existing hostname alone does not prove successful admission.

Comparison: the earlier `il-df06ff134d0969bb.fly.dev` arena has both an A record
(`66.241.125.195`) and AAAA record. Three browsers reached it and observed the
same 5–7 result. The overall browser test still failed a control check and is
not counted as a successful release qualification.

The VPS has no global IPv6 address or IPv6 route. Public Google DNS confirms
the A/AAAA distinction. A diagnostic TLS request through another known Fly
IPv4 edge failed; no resolver, hosts file, routing or certificate validation
was changed as a workaround.

At **08:10:20 UTC**, public DNS returned A records `66.241.125.66` and
`66.241.124.18`, respectively. The private observer had reached each engine and
started its readiness allowance before then. The four-minute live driver had
already failed its identity wait, so neither player acknowledged readiness.
The resulting 0-0 cancellations were verified on Monad at **08:12:23 UTC**:
status 4, zero winner, two published batches each, captured by the result ledger.
Both delegations were closing under the actual one-hour hub deadline. They are
not successful played matches, and the failed report remains failed.

Follow-up: measure hosted provisioning latency and allow a bounded longer
qualification wait. Verify readiness cancellation and later recovery, rather
than interpreting a control-plane `live` response as player reachability.

PONGIT keeps public admissions closed. It retains the existing provisioning
journal and performs GET lookups after an acknowledged creation, never repeated
POST creation attempts. An engine still unreachable after five minutes is
reported as requiring intervention. Raw requests, keys and grants are excluded.
