import test from "node:test";
import assert from "node:assert/strict";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  recoverTypedDataAddress,
  zeroHash,
  type Address,
  type Hex,
} from "viem";
import {
  pressureTypes,
  pressureDomain,
  pressureCheckpoint,
  roomsCreditMessage,
} from "../shared/rooms-pressure";
const app = "0x0000000000000000000000000000000000000011" as Address;
const market = "0x0000000000000000000000000000000000000022" as Address;
const blockHash = ("0x" + "12".repeat(32)) as Hex;
test("checkpoint commits paid MON, canonical source, app, market and exact rally boundary", () => {
  const hash = pressureCheckpoint(
    app,
    market,
    9n,
    3,
    6000000n,
    200n,
    blockHash,
    2000000000000000n,
    0n,
  );
  const cases = [
    pressureCheckpoint(
      market,
      market,
      9n,
      3,
      6000000n,
      200n,
      blockHash,
      2000000000000000n,
      0n,
    ),
    pressureCheckpoint(
      app,
      app,
      9n,
      3,
      6000000n,
      200n,
      blockHash,
      2000000000000000n,
      0n,
    ),
    pressureCheckpoint(
      app,
      market,
      10n,
      3,
      6000000n,
      200n,
      blockHash,
      2000000000000000n,
      0n,
    ),
    pressureCheckpoint(
      app,
      market,
      9n,
      4,
      6000000n,
      200n,
      blockHash,
      2000000000000000n,
      0n,
    ),
    pressureCheckpoint(
      app,
      market,
      9n,
      3,
      6000001n,
      200n,
      blockHash,
      2000000000000000n,
      0n,
    ),
    pressureCheckpoint(
      app,
      market,
      9n,
      3,
      6000000n,
      201n,
      blockHash,
      2000000000000000n,
      0n,
    ),
    pressureCheckpoint(
      app,
      market,
      9n,
      3,
      6000000n,
      200n,
      zeroHash,
      2000000000000000n,
      0n,
    ),
    pressureCheckpoint(
      app,
      market,
      9n,
      3,
      6000000n,
      200n,
      blockHash,
      0n,
      2000000000000000n,
    ),
  ];
  for (const other of cases) assert.notEqual(hash, other);
});
test("pressure signature cannot become a player consent, another deployment or a different cutoff", async () => {
  const signer = privateKeyToAccount(generatePrivateKey()),
    message = {
      matchId: 9n,
      rally: 3,
      resumeAt: 6000000n,
      paidA: 2000000000000000n,
      paidB: 0n,
      sourceBlock: 200n,
      checkpoint: blockHash,
      expires: 1030n,
    };
  const typed = {
    domain: pressureDomain(app),
    types: pressureTypes,
    primaryType: "Pressure" as const,
    message,
  };
  const signature = await signer.signTypedData(typed);
  assert.equal(
    await recoverTypedDataAddress({ ...typed, signature }),
    signer.address,
  );
  assert.notEqual(
    await recoverTypedDataAddress({
      ...typed,
      domain: pressureDomain(market),
      signature,
    }),
    signer.address,
  );
  assert.notEqual(
    await recoverTypedDataAddress({
      ...typed,
      message: { ...message, sourceBlock: 201n },
      signature,
    }),
    signer.address,
  );
  assert.notEqual(
    await recoverTypedDataAddress({
      ...typed,
      message: { ...message, expires: 2000n },
      signature,
    }),
    signer.address,
  );
  assert.notEqual(
    roomsCreditMessage(signer.address, app, 1000),
    roomsCreditMessage(signer.address, market, 1000),
  );
});
