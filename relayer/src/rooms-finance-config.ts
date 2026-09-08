import { readFile } from "node:fs/promises";
import {
  encodeFunctionData,
  isAddress,
  keccak256,
  toHex,
  type Abi,
  type Address,
} from "viem";
import type { Pool } from "pg";
import { marketV4Abi } from "../../shared/abis-v4";
import { roomsVaultAbi } from "../../shared/abi-RoomsVault";
import { roomsMarketAdapterAbi } from "../../shared/abi-RoomsMarketAdapter";
import { coerce, type RelayRequest } from "../../shared/protocol";
export type RoomsFinanceManifest = {
  app: Address;
  adapter: Address;
  market: Address;
  vault: Address;
  pressureSigner: Address;
  startBlock: string;
  chainId: 10143;
};
export async function bindRoomsFinance(
  db: Pick<Pool, "query">,
  entries: RoomsFinanceManifest[],
) {
  await db.query(
    "CREATE TABLE IF NOT EXISTS rooms_finance_bindings(app text PRIMARY KEY,fingerprint text NOT NULL)",
  );
  for (const m of entries) {
    const app = m.app.toLowerCase();
    const fingerprint = keccak256(
      toHex(
        JSON.stringify({
          app,
          chainId: m.chainId,
          adapter: m.adapter.toLowerCase(),
          market: m.market.toLowerCase(),
          vault: m.vault.toLowerCase(),
          pressureSigner: m.pressureSigner.toLowerCase(),
          startBlock: BigInt(m.startBlock).toString(),
        }),
      ),
    );
    await db.query(
      "INSERT INTO rooms_finance_bindings(app,fingerprint) VALUES($1,$2) ON CONFLICT DO NOTHING",
      [app, fingerprint],
    );
    const row = (
      await db.query(
        "SELECT fingerprint FROM rooms_finance_bindings WHERE app=$1",
        [app],
      )
    ).rows[0];
    if (row?.fingerprint !== fingerprint)
      throw new Error(
        "Rooms finance bindings changed. Preserve the original manifest and pending journal.",
      );
  }
}
export async function loadRoomsFinance() {
  const file = process.env.ROOMS_FINANCE_MANIFEST;
  const entries: RoomsFinanceManifest[] = file
    ? JSON.parse(await readFile(file, "utf8"))
    : [];
  for (const m of entries)
    if (
      m.chainId !== 10143 ||
      ![m.app, m.adapter, m.market, m.vault, m.pressureSigner].every((a) =>
        isAddress(a),
      ) ||
      !/^\d+$/.test(m.startBlock)
    )
      throw new Error("Invalid rooms finance manifest");
  if (new Set(entries.map((m) => m.app.toLowerCase())).size !== entries.length)
    throw new Error("Duplicate finance deployment");
  const find = (app: string) => {
    const m = entries.find((x) => x.app.toLowerCase() === app.toLowerCase());
    if (!m) throw new Error("Rooms finance unavailable");
    return m;
  };
  const encode = (r: RelayRequest) => {
    if (r.deployment !== "rooms" || !r.roomApp)
      throw new Error("Versioned rooms request required");
    const m = find(r.roomApp),
      contract = r.contract;
    if (!["game", "market", "vault"].includes(contract))
      throw new Error("Unsupported rooms financial contract");
    const abi: Abi =
      contract === "game"
        ? roomsMarketAdapterAbi
        : contract === "market"
          ? marketV4Abi
          : roomsVaultAbi;
    const address =
      contract === "game"
        ? m.adapter
        : contract === "market"
          ? m.market
          : m.vault;
    const fn = abi.find(
      (x) => x.type === "function" && x.name === r.functionName,
    );
    if (!fn || fn.type !== "function" || fn.inputs.length !== r.args.length)
      throw new Error("Invalid rooms financial call");
    const args = fn.inputs.map((p, i) => coerce(r.args[i], p));
    return {
      abi,
      address,
      args,
      data: encodeFunctionData({ abi, functionName: r.functionName, args }),
    };
  };
  return {
    entries,
    find,
    encode,
    bind: (db: Pick<Pool, "query">) => bindRoomsFinance(db, entries),
  };
}
