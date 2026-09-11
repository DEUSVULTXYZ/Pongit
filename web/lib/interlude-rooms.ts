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
import {measuredFetch,recordRpc} from "../../shared/rpc-metrics";
import {RoomsCommandJournal} from './rooms-command-journal';
import {readHubDelegation} from '../../shared/rooms-hub';
import {assertRoomsEngineAvailable} from '../../shared/rooms-availability';
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
  const journal=new RoomsCommandJournal(sessionStorage,manifest.app as Address,(roomsChaos?roomsChaosAbi:roomsAbi) as Abi);
  const client=createInterludeClient({
    app: manifest.app as Address,
    abi: (roomsChaos ? roomsChaosAbi : roomsAbi) as Abi,
    node: manifest.node,
    base: createPublicClient({
      chain: monadTestnet,
      transport: http("https://testnet-rpc.monad.xyz", {
        retryCount: 0,
        timeout: 8000,
        fetchFn:measuredFetch("monad"),
      }),
    }),
    store: webStorageStore(sessionStorage),
    expirySeconds: 7200,
    transport: engineTransport(manifest.node,journal),
    fastPath: true,
  });
  return Object.assign(client,{commandJournal:journal});
}
export type RoomsClient = ReturnType<typeof createRoomsClient>;
export type RoomsSession = Session<Abi>;
/** Reads first, then reuses only the same signed bytes if a response was lost. */
export async function recoverRoomsCommands(client:RoomsClient,player:Address){
  const [node,hub]=await Promise.all([client.status(),readHubDelegation(client.base,manifest.hub as Address,manifest.app as Address)]);
  assertRoomsEngineAvailable(manifest.app,node,hub,Math.floor(Date.now()/1000));
  client.commandJournal.retirePrevious(player,hub.epoch);
  const pending=client.commandJournal.pending(player);
  if(!pending)return;
  if(pending.epoch!==String(hub.epoch))throw Error('The uncertain command belongs to another engine epoch');
  let receipt=await client.node.getTransactionReceipt({hash:pending.hash}).catch(()=>null);
  if(!receipt){
    // Explicit recovery can resend these bytes, never synthesize a replacement.
    receipt=await client.node.request({method:'interlude_sendTransaction',params:[pending.raw]} as any) as any;
  }
  if(!receipt || client.commandJournal.pending(player))throw Error('Waiting for confirmation of the existing game command');
}
export async function roomsApi<T = any>(
  path: string,
  body?: unknown,
): Promise<T> {
  const player = sessionStorage.getItem(roomsAccountKey);
  const at=Date.now(),method=path.split("?")[0].replace(/0x[\da-f]+/gi,"item").replace(/[^\w]/g,".").slice(0,80);
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
  recordRpc({at,target:"pongit",method,status:response.status,ms:Date.now()-at,source:"network"});
  const result = await response.json().catch(() => {
    throw new Error("Connection interrupted. Please retry.");
  });
  if (!response.ok) {
    const error = new Error(result.error || "Service unavailable");
    Object.assign(error, {status: response.status, headers: response.headers,code:result.code,source:result.source,retryAt:result.retryAt,requestId:result.requestId});
    throw error;
  }
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
