import { readFile, writeFile } from "node:fs/promises";
const names = [
  ["PongRoomsTestnet", "roomsChaosAbi"],
  ["RoomsMarketAdapter", "roomsMarketAdapterAbi"],
  ["RoomsEarlySettlement", "roomsEarlySettlementAbi"],
  ["RoomsVault", "roomsVaultAbi"],
] as const;
for (const [name, variable] of names) {
  const artifact = JSON.parse(
    await readFile(`contracts/out/${name}.sol/${name}.json`, "utf8"),
  );
  await writeFile(
    `shared/abi-${name}.ts`,
    `// Generated from ${name}.sol.\nexport const ${variable}=${JSON.stringify(artifact.abi)} as const;\n`,
  );
}
const hub=JSON.parse(await readFile("node_modules/@interludelayer-sdk/cli/artifacts/InterludeHub.sol/InterludeHub.json","utf8"));
const auditEvents=['DelegationOpened','Challenged','AvailabilityChallenged','ChallengeResolved','ChallengeTimedOut','AvailabilityTimedOut','BatchLogServed','StateUnwound','StakeReleased'];
await writeFile("shared/abi-rooms-settlement-audit.ts",`// Generated public hub events for persistent settlement audits.\nexport const roomsSettlementAuditAbi=${JSON.stringify(hub.abi.filter((item:any)=>item.type==='event'&&auditEvents.includes(item.name)))} as const;\n`);
await writeFile("shared/abi-rooms-lifecycle.ts",`// Generated public hub lifecycle ABI. No operator credentials.\nexport const roomsLifecycleHubAbi=${JSON.stringify(hub.abi.filter((item:any)=>item.type==='function'&&['delegationOf','releaseStake','sessionOf'].includes(item.name)))} as const;\n`);
