import {
  createInterludeClient,
  webStorageStore,
  decodeSession,
  storageKey,
  type Session,
} from "@interludelayer-sdk/sdk";
import { createPublicClient, http, type Abi, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";
import manifest from "../../deployments/interlude-rooms.json";
import { roomsAbi } from "../../shared/abi-rooms";
import { roomsChaosAbi } from "../../shared/abi-PongRoomsTestnet";
import { api, API } from "./api";
import {engineTransport} from "../../shared/engine-transport";
export const roomsManifest = manifest;
export const roomsChaos = Number(manifest.rulesVersion) === 4;
export const roomsScope = [
  "acceptMatch",
  "input",
  "tick",
  "cancelMatch",
  "concede",
] as const;
export const roomsAccountKey = `pongit:rooms:${manifest.app}:account`;
export function createRoomsClient() {
  return createInterludeClient({
    app: manifest.app as Address,
    abi: (roomsChaos ? roomsChaosAbi : roomsAbi) as Abi,
    node: manifest.node,
    base: createPublicClient({
      chain: monadTestnet,
      transport: http("https://testnet-rpc.monad.xyz", {
        retryCount: 0,
        timeout: 8000,
      }),
    }),
    store: webStorageStore(sessionStorage),
    expirySeconds: 1800,
    transport: engineTransport(manifest.node),
    fastPath: true,
  });
}
export type RoomsClient = ReturnType<typeof createRoomsClient>;
export type RoomsSession = Session<Abi>;
export async function roomsApi<T = any>(
  path: string,
  body?: unknown,
): Promise<T> {
  const player = sessionStorage.getItem(roomsAccountKey);
  const response = await fetch(API + path, {
    credentials: "include",
    method: body === undefined ? "GET" : "POST",
    headers: {
      "content-type": "application/json",
      ...(player ? { "x-pongit-player": player.toLowerCase() } : {}),
    },
    body:
      body === undefined
        ? undefined
        : JSON.stringify(body, (_, v) =>
            typeof v === "bigint" ? v.toString() : v,
          ),
    signal: AbortSignal.timeout(15000),
  });
  const result = await response.json().catch(() => {
    throw new Error("Connection interrupted. Please retry.");
  });
  if (!response.ok) throw new Error(result.error || "Service unavailable");
  return result;
}
export async function authenticateRooms(player: Address) {
  const stored = decodeSession(
    sessionStorage.getItem(
      storageKey(roomsManifest.app as Address, 10143, player),
    ),
  );
  if (!stored) throw new Error("Renew your arcade session to continue.");
  const challenge = await api("/interlude/auth/challenge", { player });
  const signature = await privateKeyToAccount(stored.privateKey).signMessage({
    message: challenge.message,
  });
  await api("/interlude/auth/session", {
    player,
    nonce: challenge.nonce,
    signature,
    grant: stored.grant,
    grantSignature: stored.signature,
  });
}
export async function roomsAction(
  path: string,
  body: Record<string, unknown> = {},
  operation = crypto.randomUUID(),
) {
  return roomsApi(`/interlude/${path}`, { ...body, operation });
}
