import { advance, move, next, type State } from "../../shared/physics-v2";

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

export function previewPaddle(y: number, direction: number, elapsedMs: number, half=48) {
  return Math.max(half, Math.min(576-half, y + direction * 180 * Math.max(0, Math.min(elapsedMs, 50)) / 1000));
}
