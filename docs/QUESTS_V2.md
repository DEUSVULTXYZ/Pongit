# PONGIT V2 bounty evidence

Primary track: **Consumer Products & Payments**. Present passkey access, sponsored gas, funded spectator markets and tournament payouts as the consumer/payment experience. Final track fit depends on the portal's complete rules.

| Bounty | Delivered functionality and evidence | Status |
|---|---|---|
| Best Mera-Powered UX on Monad: $2,500 shown | Mera account creation/recovery, owner signatures and scoped game authorization. `web/lib/wallet.ts`; HTTPS flows in the delivery report. | Relevant technical integration; complete a real-device demonstration. |
| Mera: One Passkey, Many Keys: $2,500 shown | Private rivals, nicknames, timestamped replay notes and preferences encrypted through a PRF namespace separate from the wallet. `web/lib/notebook.ts`, `web/components/Notebook.tsx`, `relayer/src/social.ts`. AES-GCM keys and plaintext stay in memory. | Non-wallet functionality delivered. Recovery with the same synchronized passkey on a second physical device still needs demonstration. |
| Best Use of Envio: $1,000 shown | V1/V2 contract indexing, ladders, replays, Chaos pressure and review signals without automatic sanctions. `indexer/src/handlers.ts`, schema and explicit RPC configuration. | Real self-hosted integration; indexing recovery and replay evidence are included in the delivery report. |
| Best Community Team Project: $5,000 shown | Team membership in an eligible partner community. | External eligibility condition; code does not prove affiliation. |

Amounts are from the supplied screenshots. No award or final eligibility is guaranteed. Alchemy and Interlude are not claimed as integrated: the live release uses public Monad RPC and only prepares a future Interlude transport boundary.

## Demonstrating the non-wallet notebook

1. Create or recover a Mera passkey on `https://pongit.xyz`, open Rivals and unlock the notebook.
2. Add a private rival and a replay note using **Note this moment**. Save the encrypted notebook.
3. Lock it and disconnect. Private content must disappear from the interface and must not be present in localStorage/sessionStorage.
4. On a second physical device with access to the same synchronized passkey, recover the account and unlock the notebook. Verify the same wallet address and notes.
5. Show only technical server fields such as IV, ciphertext and revision, never a key or private content.
6. Attempt concurrent saves from two sessions. The second save must report a revision conflict without overwriting the first.

The Chromium tests use actual Mera/WebAuthn calls with a virtual PRF authenticator. They verify derivation and recovery but do not replace step 4 with a real passkey provider. See the [delivery report](V2_DELIVERY.md) for transaction evidence and remaining limits.
