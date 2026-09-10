import {
  decodeFunctionResult,
  encodeFunctionData,
  isAddress,
  parseAbi,
  toHex,
  zeroHash,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { executionNames } from "./authority-client";
import { decodeHubDelegation } from "./rooms-hub";
import { roomsLifecycleHubAbi } from "./abi-rooms-lifecycle";
import {
  decideRecovery,
  type ExecutionObservation,
} from "./authority-recovery";

const controllerAbi = parseAbi([
  "function generation() view returns(uint256)",
  "function executionState() view returns(uint8)",
  "function hub() view returns(address)",
]);
type BaseRpc = Pick<PublicClient, "getChainId" | "getBlock" | "request">;
const phases = ["None", "Active", "Exiting", "Challenged"] as const;

/** Monad-only observation. A node's live overlay can never authorize its own fallback. */
export function authorityRecoverySource(options: {
  base: BaseRpc;
  app: Address;
  hub: Address;
  health(at: bigint): Promise<ExecutionObservation["health"]>;
}) {
  const { base, app, hub } = options;
  if (!isAddress(app) || !isAddress(hub))
    throw new Error("Invalid recovery deployment");
  const canonical = async (number: bigint, hash: Hex) => {
    const b = await base.getBlock({ blockNumber: number });
    return b.hash?.toLowerCase() === hash.toLowerCase();
  };
  const observe = async (): Promise<ExecutionObservation> => {
    if ((await base.getChainId()) !== 10143)
      throw new Error("Recovery must observe Monad Testnet");
    const block = await base.getBlock({ blockTag: "latest" });
    if (block.number === null || block.hash === null)
      throw new Error("Canonical Monad block unavailable");
    const read = (to: Address, data: Hex) =>
      base.request({
        method: "eth_call",
        params: [{ to, data }, toHex(block.number)],
      });
    const [generationData, executionData, hubData, delegationData] =
      await Promise.all([
        read(
          app,
          encodeFunctionData({
            abi: controllerAbi,
            functionName: "generation",
          }),
        ),
        read(
          app,
          encodeFunctionData({
            abi: controllerAbi,
            functionName: "executionState",
          }),
        ),
        read(
          app,
          encodeFunctionData({ abi: controllerAbi, functionName: "hub" }),
        ),
        read(
          hub,
          encodeFunctionData({
            abi: roomsLifecycleHubAbi,
            functionName: "delegationOf",
            args: [app, zeroHash],
          }),
        ),
      ]);
    const actualHub = decodeFunctionResult({
      abi: controllerAbi,
      functionName: "hub",
      data: hubData,
    });
    if (actualHub.toLowerCase() !== hub.toLowerCase())
      throw new Error("Recovery hub mismatch");
    const generation = decodeFunctionResult({
      abi: controllerAbi,
      functionName: "generation",
      data: generationData,
    });
    const execution =
      executionNames[
        decodeFunctionResult({
          abi: controllerAbi,
          functionName: "executionState",
          data: executionData,
        })
      ];
    const delegation = decodeHubDelegation(delegationData);
    if (
      !execution ||
      !phases[delegation.status] ||
      (delegation.status !== 0 &&
        (delegation.app.toLowerCase() !== app.toLowerCase() ||
          delegation.partition !== zeroHash))
    )
      throw new Error("Invalid controller or delegation state");
    const health = await options.health(block.timestamp);
    if (!(await canonical(block.number, block.hash)))
      throw new Error("Recovery observation reorganized");
    const observation: ExecutionObservation = {
      chainId: 10143,
      app,
      generation,
      execution,
      block: block.number,
      blockHash: block.hash,
      timestamp: block.timestamp,
      hub: {
        phase: phases[delegation.status],
        epoch: delegation.epoch,
        lastCommitAt: delegation.lastCommitAt,
        maxBatchInterval: delegation.maxBatchInterval,
        expiresAt: delegation.expiresAt,
        stakeUnlockAt: delegation.stakeUnlockAt,
      },
      health,
    };
    decideRecovery(observation); // Validate before any client or worker can route a command.
    return observation;
  };
  return { observe, canonical };
}
