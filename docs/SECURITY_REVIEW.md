# Public repository security review — September 6, 2026

The owner authorized keeping **DEUSVULTXYZ/Pongit public** and publishing V2. This review covers publication inputs, available Git history, dependency advisories and selected live access controls. It is not an external penetration test or a guarantee that no vulnerability exists.

## Credentials and publication inputs

- Inspected every locally available Git branch/ref and historical commit, including commit messages, historical file blobs and the staged publication tree. Compared content against the operator's actual private keys and service secrets in memory without printing those values.
- Scanned with **Gitleaks 8.30.1**, plus exact-value and credential-pattern checks. No operator private key, GitHub PAT, SSH private key or deployed service credential was detected.
- Gitleaks' two initial history findings were the explicitly documented **public Anvil account-zero key** in the local setup example. `.gitleaks.toml` allows only that exact development fixture; other credentials remain subject to default rules.
- Credential-shaped URLs were reviewed as `CHANGE_ME`, environment-variable interpolation or the public `pong-local-only` development password. No deployed PostgreSQL or MongoDB credential was found.
- Runtime `.env` files, private operator storage, database dumps, local browser traces and temporary deployment archives are excluded from publication. Docker contexts exclude private environment files and temporary artifacts. The Git remote contains no embedded credential.
- Existing untracked planning drafts and the user's local quest draft were preserved outside the published tree. Repository documentation and current presentation are English; historical test outputs retain their original measurement data.

Public contract addresses, transaction hashes, revealed match randomness and public test fixtures are expected to be visible. They are not operator signing credentials. Keys for real deployments must never use the public Anvil fixture.

## Dependency fixes

The initial audit identified an outdated `ws` dependency and vulnerable transitive packages under Envio. The final dependency set uses `ws` 8.21.3, Express 4.22.2 with patched routing/body parsing, `qs` 6.16.0 and `tsx` 4.23.13 inside Envio. Envio itself remains **3.9.0**; overrides are explicit in its package manifest and both lockfiles are updated.

Relevant advisories include [WebSocket memory disclosure](https://github.com/advisories/GHSA-58qx-3vcg-4xpx), [WebSocket memory exhaustion](https://github.com/advisories/GHSA-96hv-2xvq-fx4p) and [path-to-regexp denial of service](https://github.com/advisories/GHSA-37ch-88jc-xwx2).

After updates, **npm audit reports zero known vulnerabilities** for both [application/relayer](evidence/v2/npm-audit-root.json) and [indexer](evidence/v2/npm-audit-indexer.json). This is the advisory database's result at the recorded time, not proof against undisclosed vulnerabilities. TypeScript tests/type checking and the Linux Envio code generation/build pass with the patched dependencies. Keep the overrides reviewed when upgrading Envio.

## Live access controls

The live review verified that `.env`, `.env.local`, `.git/config`, runtime configuration, backup paths and the direct GraphQL route are not served publicly. Unauthenticated notebook, invitation inbox and block-list requests return only an authentication error. The API currently uses HTTP 400 for this error; no private records are returned. [Recorded responses](evidence/v2/public-route-review.json).

Only Caddy HTTP/HTTPS and operator SSH are exposed by the VPS stack. PostgreSQL, Hasura, the RPC gateway and relayer are internal services. App sessions require a signed nonce and use HttpOnly/Secure/SameSite cookies. Notebook keys and decrypted notes are kept in memory; ciphertext storage is authenticated and revision-checked. Game keys cannot authorize financial operations.

## Recheck before future publication

```sh
npm audit
npm --prefix indexer audit
gitleaks git . --config .gitleaks.toml --redact --log-opts="--all --full-history"
```

Also inspect the staged tree, new generated assets and deployment archive. Never publish a dump, private runtime environment or operator credential to reproduce an issue. If a real credential is ever exposed, deleting it from the latest file alone is insufficient: revoke/rotate it and assess historical copies.
