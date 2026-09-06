import {
  createPasskeyWithPrfOutput,
  getPasskeyPrfOutput,
  createSecp256k1SigningSession,
  type Secp256k1SigningSession,
} from "@category-labs/mera";
import { toViemAccount } from "@category-labs/mera/viem";
import { hexToBytes, type LocalAccount, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
const rpId = () => process.env.NEXT_PUBLIC_RP_ID || location.hostname;
export type Identity = {
  account: LocalAccount;
  end: () => void;
  local: boolean;
};
export async function connect(create = false): Promise<Identity> {
  if (!window.isSecureContext || !window.PublicKeyCredential)
    throw new Error("Passkeys require HTTPS and a compatible browser.");
  try {
    const result = create
      ? await createPasskeyWithPrfOutput({
          rp: { id: rpId(), name: "PONGIT" },
          user: { name: "PONGIT player", displayName: "PONGIT player" },
        })
      : await getPasskeyPrfOutput({ rpId: rpId() });
    const session = createSecp256k1SigningSession({
      privateKey: result.prfOutput,
    });
    result.prfOutput.fill(0);
    return {
      account: toViemAccount(session),
      end: () => session.end(),
      local: false,
    };
  } catch (error) {
    if ((error as { code?: string }).code === "PRF_UNAVAILABLE")
      throw new Error(
        "This passkey provider does not support PRF. Use a compatible synced passkey provider. See the compatibility link.",
      );
    throw error;
  }
}
export function localIdentity(operator = false): Identity {
  const key: Hex = operator
    ? "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
    : generatePrivateKey();
  return { account: privateKeyToAccount(key), end: () => {}, local: true };
}
export function gameSession() {
  const bytes = hexToBytes(generatePrivateKey());
  const session = createSecp256k1SigningSession({ privateKey: bytes });
  bytes.fill(0);
  return { account: toViemAccount(session), end: () => session.end() };
}
