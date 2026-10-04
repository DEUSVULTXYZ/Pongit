# PONGIT hosted-node reset — 4 October 2026

The project owner explicitly authorizes retiring the old PONGIT hosted nodes
and starting with fresh hosting. This does not erase Monad contracts, financial
rights, results, replay archives or nonce journals.

**Blocked: no provider administration access. No machine was deleted.**
Neither the Windows workstation nor the authorized VPS has a Fly CLI, a Fly
configuration file, or either standard Fly access-token environment variable.
Only credential-presence booleans were inspected; no credential was printed.
The available Interlude SDK documents session creation, lookup and owner
opt-in, with no owner-authenticated machine deletion method.

## Ready for the Interlude hosting operator

Please remove the compute instances for the following nine retired PONGIT
applications from your Fly account and reconcile their control-plane entries
and capacity accounting. They no longer have an active delegation. Preserve
their volumes and logs for now; this request is not permission to delete shared
control services, other projects or on-chain contracts.

| Fly application previously serving the node | Exact Monad application |
| --- | --- |
| `il2-eu-8194191a762a54f2` | `0x8194191a762a54f2a2bc05fe159e8f418cffe36e` |
| `il2-eu-5f81f9fcc7d97e77` | `0x5f81f9fcc7d97e77c8edda8da103a03db043603b` |
| `il2-eu-064b85b76e37538f` | `0x064b85b76e37538f8750c5313b0e66d718744265` |
| `il2-eu-e79709cddb0cbf21` | `0xe79709cddb0cbf21c3e080b30dc9a74628bde54a` |
| `il2-eu-3b435d6e84b0a9a8` | `0x3b435d6e84b0a9a852ce06f5d0fa873638ebeb38` |
| `il2-eu-05b901fb1423a54d` | `0x05b901fb1423a54d0692730d694126f3eb9f1809` |
| `il2-eu-5472e6b3638a6f26` | `0x5472e6b3638a6f26a1e181b490e9fe5cde005522` |
| `il2-eu-2b85a8ae733bbd71` | `0x2b85a8ae733bbd713159f446e4781caa0f9d6110` |
| `il2-eu-c63aecc4bb92b9e1` | `0xc63aecc4bb92b9e13906b75b951b09b2f918c0b3` |

Hub: `0x98922c6E5e4Bea62761C71D2401c7ec2c26eC43e`, Monad Testnet 10143.
Normal closure/release and exact finalized roots were verified at block
68031323. A fresh read at **68058727**, 07:43:18 UTC, confirms all nine still
have status `None` and unchanged epochs. Original reports and verified off-VPS
backup `arena-residue-20261004T0527Z` remain available. Do not repeat those
on-chain releases.

The node URLs served matching applications and epochs before retirement. At
07:44 UTC they timed out; several directory reads returned HTTP 429, while one
still described its node as live. Neither a timeout nor the global machine
counter proves a particular machine has been deleted. The hosting operator
must resolve exact machine IDs and verify their current configuration against
the addresses above before removal. No machine IDs have been guessed.

## Remaining reset scope

The accompanying JSON contains the 75 PONGIT arena addresses identified from
the existing deployment inventory, their current canonical states and the
nine ready targets. It is a contract inventory, **not** proof of 75 hosted
machines. The other 66 addresses are an inventory for reconciliation, not a
blind deletion list: some never obtained a node, some are current public
arenas, and historical recovery incidents remain unresolved.

The complete reset needs hosting access first, followed by coordinated
admission drain, result publication/backup, writer shutdown and retirement of
the remaining current nodes. No current public writer was stopped merely to
wait for missing access, and no healthy agent game was interrupted in this
diagnostic. The automation remains paused. No message was sent to Interlude.

The requested missing capability is either an authenticated Fly session scoped
to PONGIT applications, configured locally without sending a secret in chat,
or execution of the scoped cleanup by Interlude's hosting operator.
