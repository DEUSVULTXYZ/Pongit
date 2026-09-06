import {
  type Abi,
  type AbiParameter,
  type Address,
  type Hex,
  encodeFunctionData,
} from "viem";
import { gameAbi, marketAbi, vaultAbi, tournamentsAbi } from "./abis";
import { gameV2Abi, marketV2Abi, tournamentsV2Abi } from "./abis-v2";
import { gameV3Abi, arcadeSessionsAbi, tournamentsV3Abi } from "./abis-v3";
export type DeploymentId = "v1" | "v2" | "v3";
export type Deployment = {
  version?: 1 | 2 | 3;
  arcade?: Address;
  legacy?: Deployment;
  chainId: number;
  game: Address;
  vault: Address;
  market: Address;
  tournaments: Address;
  lmsr: Address;
  startBlock: string;
};
export const contracts = {
  arcade: arcadeSessionsAbi,
  game: gameAbi,
  market: marketAbi,
  vault: vaultAbi,
  tournaments: tournamentsAbi,
};
export type ContractName = keyof typeof contracts;
export type RelayRequest = {
  deployment?: DeploymentId;
  contract: ContractName;
  functionName: string;
  args: unknown[];
};
export const json = (value: unknown) =>
  JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v));
export const domain = (
  name: string,
  chainId: number,
  verifyingContract: Address,
) => ({ name, version: "1", chainId, verifyingContract });
export const joinTypes = {
  Join: [
    { name: "player", type: "address" },
    { name: "opponent", type: "address" },
    { name: "roomId", type: "bytes32" },
    { name: "commitment", type: "bytes32" },
    { name: "sessionKey", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint64" },
    { name: "sessionExpiry", type: "uint64" },
    { name: "maxInputs", type: "uint32" },
    { name: "tournamentId", type: "uint256" },
  ],
} as const;
export const joinV2Types = { Join: [...joinTypes.Join, {name:"mode",type:"uint8"}, {name:"ranked",type:"bool"}, {name:"rulesVersion",type:"uint16"}] } as const;
export const inputTypes = {
  Input: [
    { name: "matchId", type: "uint256" },
    { name: "player", type: "address" },
    { name: "direction", type: "int8" },
    { name: "nonce", type: "uint64" },
    { name: "observedBlock", type: "uint64" },
    { name: "validUntilBlock", type: "uint64" },
  ],
} as const;
export const betTypes = {
  Bet: [
    { name: "player", type: "address" },
    { name: "matchId", type: "uint256" },
    { name: "side", type: "uint8" },
    { name: "shares", type: "uint256" },
    { name: "maxCost", type: "uint256" },
    { name: "version", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint64" },
  ],
} as const;
export const actionTypes = {
  GameAction: [
    { name: "player", type: "address" },
    { name: "matchId", type: "uint256" },
    { name: "action", type: "uint8" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint64" },
  ],
} as const;
export const sessionTypes = {
  Session: [
    { name: "player", type: "address" },
    { name: "matchId", type: "uint256" },
    { name: "sessionKey", type: "address" },
    { name: "expiry", type: "uint64" },
    { name: "maxInputs", type: "uint32" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint64" },
  ],
} as const;
export const enterTypes = {
  Enter: [
    { name: "player", type: "address" },
    { name: "tournamentId", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint64" },
  ],
} as const;
export const withdrawTypes = {
  Withdraw: [
    { name: "player", type: "address" },
    { name: "recipient", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint64" },
  ],
} as const;
export function coerce(value: unknown, param: AbiParameter): unknown {
  if (param.type.endsWith("[]"))
    return (value as unknown[]).map((v) =>
      coerce(v, { ...param, type: param.type.slice(0, -2) } as AbiParameter),
    );
  if (param.type === "tuple" && "components" in param)
    return Object.fromEntries(
      param.components.map((p, i) => [
        p.name,
        coerce(
          Array.isArray(value)
            ? value[i]
            : (value as Record<string, unknown>)[p.name!],
          p,
        ),
      ]),
    );
  if (/^u?int/.test(param.type)) {
    const bits = Number(param.type.replace(/\D/g, "") || 256);
    return bits <= 48 ? Number(value) : BigInt(value as string);
  }
  return value;
}
export function encodeRequest(request: RelayRequest, deployment: Deployment) {
  deployment = resolveDeployment(request.deployment, deployment);
  const abi: Abi = contractsFor(deployment)[request.contract];
  const fn = abi.find(
    (e) => e.type === "function" && e.name === request.functionName,
  );
  if (!fn || fn.type !== "function" || request.args.length !== fn.inputs.length)
    throw new Error("Invalid contract call");
  const args = fn.inputs.map((p, i) => coerce(request.args[i], p));
  return {
    address: (() => { const address=deployment[request.contract]; if(!address) throw new Error("Contract unavailable in this deployment"); return address; })(),
    abi,
    args,
    data: encodeFunctionData({ abi, functionName: request.functionName, args }),
  };
}
export const queueMessage = (
  player: string,
  expires: number,
  tournamentId = "0",
) =>
  `PONG matchmaking\nPlayer: ${player.toLowerCase()}\nExpires: ${expires}\nTournament: ${tournamentId}`;

export const cancelQueueMessage = (player: string, ticket: string, expires: number, chainId: number, game: string) =>
  `PONG cancel matchmaking\nPlayer: ${player.toLowerCase()}\nTicket: ${ticket}\nExpires: ${expires}\nChain: ${chainId}\nGame: ${game.toLowerCase()}`;

export const deploymentId = (d:Deployment): DeploymentId => `v${d.version || 1}` as DeploymentId;
export function allDeployments(d:Deployment):Deployment[] { return [d,...(d.legacy?allDeployments(d.legacy):[])]; }
export function resolveDeployment(id: DeploymentId | undefined,d:Deployment):Deployment {
  const result=allDeployments(d).find(x=>!id || deploymentId(x)===id);
  if(!result)throw new Error("Unknown contract deployment");return result;
}
export function contractsFor(d:Deployment) {
  return d.version === 3 ? {arcade:arcadeSessionsAbi,game:gameV3Abi,market:marketV2Abi,vault:vaultAbi,tournaments:tournamentsV3Abi} : d.version === 2 ? {arcade:arcadeSessionsAbi,game:gameV2Abi,market:marketV2Abi,vault:vaultAbi,tournaments:tournamentsV2Abi} : contracts;
}
export const arcadeGrantTypes={ArcadeGrant:[{name:"player",type:"address"},{name:"key",type:"address"},{name:"game",type:"address"},{name:"expires",type:"uint64"},{name:"nonce",type:"uint256"}]} as const;
export const arcadeRevokeTypes={ArcadeRevoke:[{name:"player",type:"address"},{name:"key",type:"address"},{name:"nonce",type:"uint256"},{name:"deadline",type:"uint64"}]} as const;
export function matchRef(d:Deployment,id:string|bigint) { return `${deploymentId(d)}:${id}`; }
export const queueV2Message = (player:string,expires:number,tournamentId:string,mode:number,d:Deployment) =>
  `${queueMessage(player,expires,tournamentId)}\nMode: ${mode}\nRanked: true\nRules: 2\nChain: ${d.chainId}\nGame: ${d.game.toLowerCase()}`;
