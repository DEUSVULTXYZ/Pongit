# Hosted arena reachability, 20 September 2026

The new private PONGIT arena cannot yet be reached from our IPv4-only VPS.
This is separate from the application fixes and is not evidence that gameplay
or publication inside the new node has passed.

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

Requested action: allocate/enable shared IPv4 for the two hosted applications,
verify their public A records and HTTPS JSON-RPC reachability, and ensure
provisioning does not report a usable endpoint before that path works.
Alternatively, the VPS needs its provider-assigned IPv6 configuration; this
does not by itself make the direct endpoint reachable to IPv4-only players.

PONGIT keeps public admissions closed. It retains the existing provisioning
journal and performs GET lookups after an acknowledged creation, never repeated
POST creation attempts. An engine still unreachable after five minutes is
reported as requiring intervention. Raw requests, keys and grants are excluded.
