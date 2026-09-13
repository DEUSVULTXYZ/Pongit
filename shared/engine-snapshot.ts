import {decodeErrorResult, decodeFunctionResult, encodeFunctionData, type Abi, type Address, type Hex} from "viem";
import {decodeChaosRead} from './chaos-codec';

export class EngineSnapshotError extends Error {
  constructor(public readonly app: Address, public readonly matchId: bigint, public readonly returnData: Hex, reason: string) {
    // Only a read's return bytes belong here. Never include session grants or signed calls.
    super(`Game state unavailable (${reason}). Waiting for the engine to recover.`);
    this.name = "EngineSnapshotError";
  }
}

export function decodeEngineSnapshot(abi: Abi, app: Address, matchId: bigint, data: Hex): readonly unknown[] {
  try {
    if(abi.some(x=>x.type==='function'&&x.name==='chaosState'))return decodeChaosRead(abi,decodeFunctionResult({abi,functionName:'chaosState',data}) as Hex);
    return decodeFunctionResult({abi, functionName: "getSnapshot", data}) as readonly unknown[];
  } catch {
    let reason = `invalid snapshot, ${(data.length - 2) / 2} bytes`;
    try {
      const decoded = decodeErrorResult({abi, data});
      reason = decoded.errorName + (decoded.args?.length ? ` ${decoded.args.map(String).join(", ")}` : "");
    } catch { /* Preserve malformed read bytes for an operator diagnostic. */ }
    throw new EngineSnapshotError(app, matchId, data, reason);
  }
}

/** No write, retry or fallback to settled state: the arena must read its live deployment. */
export async function readEngineSnapshot(client: {
  app: Address; abi: Abi;
  node: {request: (args: {method: "eth_call"; params: [{to: Address; data: Hex}, "latest"]}) => Promise<Hex>};
}, matchId: bigint): Promise<readonly unknown[]> {
  const fn=client.abi.some(x=>x.type==='function'&&x.name==='chaosState')?'chaosState':'getSnapshot';
  const data = encodeFunctionData({abi: client.abi, functionName: fn, args: [matchId]});
  const result = await client.node.request({method: "eth_call", params: [{to: client.app, data}, "latest"]});
  return decodeEngineSnapshot(client.abi, client.app, matchId, result);
}
