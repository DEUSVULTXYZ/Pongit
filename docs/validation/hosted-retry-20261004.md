# Actual PONGIT hosting retry — 4 October 2026

At the user's explicit request, one owner-authenticated `POST /sessions` was
sent to `https://control.interludelayer.xyz` at **08:02:08 UTC**. This was an
actual provisioning attempt for an existing new-hub PONGIT arena, not another
health-only check or a duplicate contract deployment.

**Result: HTTP 503. No hosted node was confirmed.**

> hosted capacity is full (50 nodes). try again later or run your own node

The accompanying control health response reports 50 live machines, a maximum
of 50 and zero queued. Its validator reports 9 estimated active delegations
against a maximum of 128. Hosted compute is therefore the demonstrated blocker
for this attempt; sending more test MON does not remove that limit.

## Exact scope and safeguards

- Application: `0xbfc44e0cdb647689c138445e6e4796e71c425235`, epoch 3.
- Hub: `0x98922c6E5e4Bea62761C71D2401c7ec2c26eC43e`, Monad Testnet 10143.
- Canonical preflight block: 68062411; active delegation, zero batches.
- The production metadata's owner and runtime hash were checked against the
  chain before signing the epoch-scoped hosting consent. The signature remained
  in memory and was neither logged nor saved.
- The existing per-application advisory lock, seed 701351, serialized this
  manually authorized retry with the production provisioner. No chain
  transaction or command nonce was issued.
- The prior uncertain creation remains preserved. A sending event was committed
  before the POST and a response event afterward. The current state remains
  uncertain with two attempts; the refusal was not used to erase old ambiguity
  or authorize an automatic retry loop.
- One earlier script-copy launch failed because the container root filesystem
  is read-only. It sent no HTTP request. Its failure is retained; the successful
  bounded script was passed through standard input without changing that image.
- No service restart, image deployment, admission change, machine deletion,
  game driver or scheduled task was performed. Existing working nodes continue.

## Retention and next action

The sanitized response is in `hosted-retry-20261004.json`. The script, launch
records, response, two lifecycle-table backups and journal response are retained
under `/opt/pongit/tests/arena-residue-audit-20261004/hosting-retry-1`.
All seven files, totaling 158,076,228 bytes, have SHA-256-verified off-VPS copies
in the private Windows backup directory. Manifest SHA-256:
`0d2422498b3fd59c717972650288c8cb4ac847604f18c7cb0bb2c10a9de21a81`.

Interlude's hosting operator needs to retire or recycle the already released
PONGIT nodes and reconcile the control-plane capacity. The exact nine eligible
applications and preservation instructions are in `node-reset-20261004.md`.
Their chain releases are already verified; do not send those transactions again.
No message was sent to Interlude. The global counter does not establish which
specific Fly machines still exist. This result does not restore legacy PvP.
