import { advance, move, next, type State } from "../../shared/physics-v2";
import { advance as advanceInterlude } from "../../shared/physics-interlude";

export type SnapshotCursor = { id: string; head: bigint; version: bigint; clock: bigint };
export function acceptsSnapshot(previous: SnapshotCursor | null, incoming: SnapshotCursor) {
  if (!previous || previous.id !== incoming.id) return true;
  return incoming.head >= previous.head && incoming.version >= previous.version &&
    (incoming.version > previous.version || incoming.clock > previous.clock || incoming.head > previous.head);
}

// Wall bounces are deterministic. Paddle impacts and points depend on commands
// still awaiting inclusion: hold at that boundary until the contract resolves it.
export function projectConfirmed(state: State | import("../../shared/physics").State, target: bigint): { state: State; waiting: boolean } {
  let s: State = { mode:0,halfA:48000000n,halfB:48000000n,awaitingServe:false,resumeAt:0n,...state };
  if (s.finished || s.awaitingServe || target <= s.t) return { state: s, waiting: false };
  for (let i = 0; i < 64; i++) {
    const event = next(s);
    if (event.at > target) return { state: move(s, target), waiting: false };
    if (event.kind >= 3) {
      const before = event.at > s.t ? event.at - 1n : s.t;
      return { state: move(s, before), waiting: true };
    }
    s = advance(s, event.at, 1)[0];
  }
  return { state: s, waiting: true };
}

// The low-latency lab can preview paddle collisions using the latest engine
// trajectory. Do not stall a rally waiting for its next snapshot. A goal is
// still a confirmation boundary: this function never awards points or serves.
export function projectLive(state: State, target: bigint): { state: State; waiting: boolean } {
  let s = { ...state };
  if (s.finished || s.awaitingServe || target < s.t) return { state: s, waiting: false };
  for (let i = 0; i < 64; i++) {
    const event = next(s);
    if (event.at > target) return { state: move(s, target), waiting: false };
    if (event.kind >= 5) {
      return { state: move(s, event.at > s.t ? event.at - 1n : s.t), waiting: true };
    }
    // Only walls and paddle planes reach the lab collision routine. Preview
    // uses the same uncapped per-return acceleration as the engine.
    s = advanceInterlude(s, event.at, 1)[0];
  }
  return { state: s, waiting: true };
}

export function previewPaddle(y: number, direction: number, elapsedMs: number, half=48) {
  return Math.max(half, Math.min(576-half, y + direction * 180 * Math.max(0, Math.min(elapsedMs, 50)) / 1000));
}

export type PendingInput = { nonce: bigint; direction: number; at: number };
// Rebuild from an authoritative position every frame. Pending input timestamps
// are local monotonic observations, never timestamps submitted to the contract.
export function predictPaddle(base: number, confirmedDirection: number, half: number, from: bigint, target: bigint,
  confirmedNonce: bigint, inputs: {nonce:bigint;direction:number;at:bigint}[]) {
  let y=base,t=from,dir=confirmedDirection;
  const travel=(until:bigint)=>{if(until>t)y=Math.max(half,Math.min(576-half,y+dir*180*Number(until-t)/1e6));t=until;};
  const latest=new Map<bigint,typeof inputs[number]>();
  for(const input of inputs)if(input.nonce>confirmedNonce)latest.set(input.nonce,input);
  for(const input of [...latest.values()].sort((a,b)=>a.nonce<b.nonce?-1:1)) {
    const at=input.at<t?t:input.at;if(at>target)break;travel(at);dir=input.direction;
  }
  travel(target<t?t:target);return y;
}
export function boundedClock(clock:bigint,ageMs:number,elapsedMs:number,limitMs=600){
  const age=Math.max(0,ageMs)+Math.max(0,elapsedMs);
  return {target:clock+BigInt(Math.floor(Math.min(age,limitMs)*1000)),stale:age>=limitMs,ageMs:age};
}
