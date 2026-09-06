import test from "node:test";
import assert from "node:assert/strict";
import {
  createPasskeyWithPrfOutput,
  getPasskeyPrfOutput,
  createSecp256k1SigningSession,
  type WebAuthnClient,
} from "@category-labs/mera";
import { toViemAccount } from "@category-labs/mera/viem";
import {
  verifyTypedData,
  decodeAbiParameters,
  encodeAbiParameters,
  toHex,
} from "viem";
import { domain, inputTypes, json } from "../shared/protocol";
import { initial, advance, stateComponents } from "../shared/physics";
import { stateFromJson } from "../web/lib/api";

test("Mera PRF creation and recovery preserve identity; ending a session disables signing", async () => {
  // Only the authenticator is mocked. Mera PRF processing, memory session, and viem signatures are real.
  const output = new Uint8Array(32).fill(42);
  let assertions = 0;
  const client: WebAuthnClient = {
    createCredential: async (r) => {
      assert.equal(r.userVerification, "required");
      return { credentialId: new Uint8Array([1, 2, 3]), prfEnabled: true };
    },
    getCredential: async (r) => {
      assert.equal(r.rpId, "pong.example");
      assert.equal(r.prfSalt.length, 32);
      assertions++;
      return {
        credentialId: new Uint8Array([1, 2, 3]),
        prfOutput: output.slice(),
      };
    },
  };
  const created = await createPasskeyWithPrfOutput({
    rp: { id: "pong.example", name: "PONG" },
    user: { name: "Player", displayName: "Player" },
    webAuthnClient: client,
  });
  const restored = await getPasskeyPrfOutput({
    rpId: "pong.example",
    webAuthnClient: client,
  });
  const s = createSecp256k1SigningSession({ privateKey: created.prfOutput });
  created.prfOutput.fill(0);
  const r = createSecp256k1SigningSession({ privateKey: restored.prfOutput });
  restored.prfOutput.fill(0);
  const account = toViemAccount(s);
  assert.equal(account.address, toViemAccount(r).address);
  assert.equal(assertions, 2);
  const d = domain("PONG", 10143, "0x0000000000000000000000000000000000000001");
  const message = {
    matchId: 1n,
    player: account.address,
    direction: 1,
    nonce: 1n,
    observedBlock: 123n,
    validUntilBlock: 127n,
  };
  const signature = await account.signTypedData({
    domain: d,
    types: inputTypes,
    primaryType: "Input",
    message,
  });
  assert(
    await verifyTypedData({
      address: account.address,
      domain: d,
      types: inputTypes,
      primaryType: "Input",
      message,
      signature,
    }),
  );
  assert.equal(
    await verifyTypedData({
      address: account.address,
      domain: { ...d, chainId: 31337 },
      types: inputTypes,
      primaryType: "Input",
      message,
      signature,
    }),
    false,
  );
  s.end();
  r.end();
  await assert.rejects(account.signMessage({ message: "after end" }), /ended/i);
});
test("Mera rejects a passkey provider without PRF", async () => {
  await assert.rejects(
    createPasskeyWithPrfOutput({
      rp: { id: "pong.example", name: "PONG" },
      user: { name: "p", displayName: "p" },
      webAuthnClient: {
        createCredential: async () => ({
          credentialId: new Uint8Array([1]),
          prfEnabled: false,
        }),
        getCredential: async () => {
          throw new Error("must not get called");
        },
      },
    }),
    { code: "PRF_UNAVAILABLE" },
  );
});
test("Indexed ABI snapshots round-trip through JSON without losing integer precision", () => {
  const state = advance(
    { ...initial(toHex(3n, { size: 32 })), leftDir: -1, rightDir: 1 },
    7_300_000n,
    64,
  )[0];
  const encoded = encodeAbiParameters(
    [{ type: "tuple", components: stateComponents }],
    [state],
  );
  const [decoded] = decodeAbiParameters(
    [{ type: "tuple", components: stateComponents }],
    encoded,
  );
  assert.deepEqual(stateFromJson(JSON.parse(json(decoded))), state);
});
