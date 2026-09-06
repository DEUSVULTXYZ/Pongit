import type { Hex } from "viem";
export const SCALE = 1_000_000n;
export const WIDTH = 1024n * SCALE,
  HEIGHT = 576n * SCALE,
  RADIUS = 6n * SCALE;
export const HALF_PADDLE = 48n * SCALE,
  PLANE = 40n * SCALE,
  PADDLE_SPEED = 180n * SCALE;
export const BLOCK_US = 300_000n;
export type State = {
  x: bigint;
  y: bigint;
  vx: bigint;
  vy: bigint;
  left: bigint;
  right: bigint;
  leftDir: number;
  rightDir: number;
  t: bigint;
  scoreA: number;
  scoreB: number;
  seed: Hex;
  finished: boolean;
  mode: number;
  halfA: bigint;
  halfB: bigint;
  awaitingServe: boolean;
  resumeAt: bigint;
};
export type GameEvent = { at: bigint; kind: number };
const abs = (n: bigint) => (n < 0n ? -n : n);
const clamp = (y: bigint, half: bigint) =>
  y < half
    ? half
    : y > HEIGHT - half
      ? HEIGHT - half
      : y;
const travel = (d: bigint, v: bigint) =>
  (abs(d) * SCALE + abs(v) - 1n) / abs(v);
function serve(s: State): State {
  const point = s.scoreA + s.scoreB;
  return {
    ...s,
    x: WIDTH / 2n,
    y: HEIGHT / 2n,
    vx: (point % 2 === 0 ? 128n : -128n) * SCALE,
    vy: ((BigInt(s.seed) >> BigInt(point)) & 1n ? -64n : 64n) * SCALE,
  };
}
export function initial(seed: Hex, mode = 0): State {
  if (mode !== 0 && mode !== 1) throw new Error("mode");
  return serve({
    x: 0n,
    y: 0n,
    vx: 0n,
    vy: 0n,
    left: HEIGHT / 2n,
    right: HEIGHT / 2n,
    leftDir: 0,
    rightDir: 0,
    t: 0n,
    scoreA: 0,
    scoreB: 0,
    seed,
    finished: false, mode, halfA: HALF_PADDLE, halfB: HALF_PADDLE, awaitingServe: false, resumeAt: 0n,
  });
}
export function next(s: State): GameEvent {
  if (s.finished) return { at: (1n << 64n) - 1n, kind: 0 };
  if (s.awaitingServe) return { at: s.resumeAt, kind: 7 };
  let e = {
    at: s.t + travel(s.vx < 0n ? -RADIUS - s.x : WIDTH + RADIUS - s.x, s.vx),
    kind: s.vx < 0n ? 5 : 6,
  };
  if (s.vx < 0n && s.x >= PLANE)
    e = { at: s.t + travel(PLANE - s.x, s.vx), kind: 3 };
  if (s.vx > 0n && s.x <= WIDTH - PLANE)
    e = { at: s.t + travel(WIDTH - PLANE - s.x, s.vx), kind: 4 };
  const wall =
    s.t + travel(s.vy < 0n ? RADIUS - s.y : HEIGHT - RADIUS - s.y, s.vy);
  if (wall <= e.at) e = { at: wall, kind: s.vy < 0n ? 1 : 2 };
  return e;
}
export function move(s: State, to: bigint): State {
  if (to < s.t) throw new Error("time reversal");
  if (s.awaitingServe || s.finished) return { ...s };
  const dt = to - s.t;
  return {
    ...s,
    x: s.x + (s.vx * dt) / SCALE,
    y: s.y + (s.vy * dt) / SCALE,
    left: clamp(s.left + (BigInt(s.leftDir) * PADDLE_SPEED * dt) / SCALE, s.halfA),
    right: clamp(s.right + (BigInt(s.rightDir) * PADDLE_SPEED * dt) / SCALE, s.halfB),
    t: to,
  };
}
function collide(s: State, kind: number): State {
  s = { ...s };
  if (kind === 1 || kind === 2) {
    s.y = kind === 1 ? RADIUS : HEIGHT - RADIUS;
    s.vy = -s.vy;
  } else if (kind === 3 || kind === 4) {
    const paddle = kind === 3 ? s.left : s.right;
    s.x = kind === 3 ? PLANE : WIDTH - PLANE;
    const half = kind === 3 ? s.halfA : s.halfB;
    if (
      s.y + RADIUS >= paddle - half &&
      s.y - RADIUS <= paddle + half
    )
      s.vx = -s.vx;
    else s.x += s.vx < 0n ? -1n : 1n;
  } else {
    if (kind === 5) s.scoreB++;
    else s.scoreA++;
    s.finished = s.scoreA === 7 || s.scoreB === 7;
    if (!s.finished) {
      s = serve(s);
      if (s.mode === 1) { s.awaitingServe = true; s.resumeAt = s.t + 3000000n; s.vx = 0n; s.vy = 0n; }
    }
  }
  return s;
}
export function advance(
  state: State,
  target: bigint,
  limit = 128,
): [State, boolean] {
  let s = { ...state };
  if (target < s.t) throw new Error("time reversal");
  for (let i = 0; i < limit; i++) {
    if (s.finished || s.awaitingServe) return [s, true];
    const e = next(s);
    if (e.at > target) return [move(s, target), true];
    s = collide(move(s, e.at), e.kind);
  }
  return [s, s.finished || s.awaitingServe || (next(s).at > target && s.t === target)];
}
export const stateComponents = [
  ...(["x", "y", "vx", "vy", "left", "right"] as const).map((name) => ({
    name,
    type: "int256" as const,
  })),
  { name: "leftDir", type: "int8" },
  { name: "rightDir", type: "int8" },
  { name: "t", type: "uint64" },
  { name: "scoreA", type: "uint8" },
  { name: "scoreB", type: "uint8" },
  { name: "seed", type: "bytes32" },
  { name: "finished", type: "bool" },
  { name: "mode", type: "uint8" },
  { name: "halfA", type: "int256" },
  { name: "halfB", type: "int256" },
  { name: "awaitingServe", type: "bool" },
  { name: "resumeAt", type: "uint64" },
] as const;

export function handicap(paidA: bigint, paidB: bigint): [bigint, bigint] {
  const total = paidA + paidB;
  if (total < 2000000000000000n) return [HALF_PADDLE, HALF_PADDLE];
  const favorite = paidA > paidB ? paidA : paidB;
  const shareBps = favorite * 10000n / total;
  if (shareBps <= 6000n) return [HALF_PADDLE, HALF_PADDLE];
  const reduction = (shareBps - 6000n) * 2500n / 4000n;
  const half = HALF_PADDLE * (10000n - reduction) / 10000n;
  return paidA > paidB ? [half, HALF_PADDLE] : [HALF_PADDLE, half];
}
export function resume(state: State, at: bigint, paidA: bigint, paidB: bigint): State {
  if (!state.awaitingServe || at < state.resumeAt) throw new Error("serve not ready");
  const [halfA, halfB] = handicap(paidA, paidB);
  return serve({ ...state, halfA, halfB, awaitingServe: false, resumeAt: 0n, t: at, left: HEIGHT/2n, right: HEIGHT/2n });
}
