import { initial as classicInitial, advance as classicAdvance, next, type State } from "./physics-v2";
import type { Hex } from "viem";
const serveSpeed = (s: State): State => ({ ...s, vx: s.vx * 3n / 2n, vy: s.vy * 3n / 2n });
export const initial = (seed: Hex) => serveSpeed(classicInitial(seed));
export function accelerate(s: State): State {
  const speed = (s.vx < 0n ? -s.vx : s.vx) * 110n / 100n;
  return {...s,vx:s.vx<0n?-speed:speed,vy:s.vy<0n?-(speed/2n):speed/2n};
}
export function advance(state: State, target: bigint, limit = 128): [State, boolean] {
  let s = { ...state };
  if (s.mode !== 0 || target < s.t) throw new Error("classic clock");
  for (let i = 0; i < limit; i++) {
    if (s.finished) return [s, true];
    const event = next(s), at = event.at;
    if (at > target) return classicAdvance(s, target, 1);
    const points = s.scoreA + s.scoreB;
    const incomingVX = s.vx;
    [s] = classicAdvance(s, at, 1);
    if ((event.kind === 3 || event.kind === 4) && s.vx !== incomingVX) s = accelerate(s);
    if (!s.finished && s.scoreA + s.scoreB !== points) s = serveSpeed(s);
  }
  return [s, s.finished || s.t === target && next(s).at > target];
}
