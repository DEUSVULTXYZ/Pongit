import { readFile, mkdir, writeFile } from "node:fs/promises";

// This report cannot deploy anything. No key, RPC write or production env is loaded.
const names = [
  "AutonomousArena",
  "AuthorityActions",
  "ContractLobby",
  "AuthorityRating",
  "BaseAuthorization",
  "PlayerIndex",
  "AutonomousFinance",
  "ProfileRegistry",
  "PrivateDataStore",
  "UnsupportedChaosProof",
];
const contracts = await Promise.all(
  names.map(async (name) => {
    const source = name === "UnsupportedChaosProof" ? "ChaosProof" : name;
    const artifact = JSON.parse(
      await readFile(`contracts/out/${source}.sol/${name}.json`, "utf8"),
    );
    const runtimeBytes = (artifact.deployedBytecode.object.length - 2) / 2;
    const initBytes = (artifact.bytecode.object.length - 2) / 2;
    return {
      name,
      runtimeBytes,
      initBytes,
      withinSizeLimits: runtimeBytes <= 24576 && initBytes <= 49152,
    };
  }),
);
const report = {
  candidate: "contract-authority",
  productionActivation: false,
  checkedAt: new Date().toISOString(),
  contracts,
  gates: {
    size: contracts.every((c) => c.withinSizeLimits),
    chaosProof: false,
    hostedRoundtrip: false,
    hostedPublicationBudget: false,
    legacyMigration: false,
    browserAcceptance: false,
  },
  blockers: [
    "The only shipped proof module rejects every Interlude checkpoint.",
    "No hosted Interlude -> Monad -> Interlude cycle has been qualified.",
    "Publication accounting with two matches and lobby writes must fit the real node budget.",
    "Existing production accounts and encrypted payloads have not been migrated.",
    "The production client and sponsor remain on their current adapters.",
  ],
};
await mkdir("artifacts/authority", { recursive: true });
await writeFile(
  "artifacts/authority/preflight.json",
  JSON.stringify(report, null, 2) + "\n",
);
const combined = [];
const seen = new Set<string>();
const abiType = (input: {
  type: string;
  components?: Array<{ type: string; components?: unknown[] }>;
}): string =>
  input.type.startsWith("tuple")
    ? `(${input.components!.map((c) => abiType(c as typeof input)).join(",")})${input.type.slice(5)}`
    : input.type;
for (const name of ["AutonomousArena", "AuthorityActions"]) {
  const artifact = JSON.parse(
    await readFile(`contracts/out/${name}.sol/${name}.json`, "utf8"),
  );
  for (const item of artifact.abi) {
    if (item.type === "constructor") continue;
    const key = `${item.type}:${item.name ?? ""}(${(item.inputs ?? []).map(abiType).join(",")})`;
    if (!seen.has(key)) {
      seen.add(key);
      combined.push(item);
    }
  }
}
await writeFile(
  "artifacts/authority/arena-abi.json",
  JSON.stringify(combined, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
if (process.argv.includes("--require-ready") || !report.gates.size)
  process.exitCode = 1;
