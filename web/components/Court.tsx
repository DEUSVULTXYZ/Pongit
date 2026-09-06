"use client";
import { useEffect, useRef } from "react";
import { move, SCALE, type State } from "../../shared/physics-v2";
import { previewPaddle, projectConfirmed } from "../lib/presentation";
type Props = {
  state: State | null;
  clock: bigint;
  observedAt: number;
  direction: number;
  side: number;
  replay: boolean;
  matchId: string;
  controllable: boolean;
  pending: boolean;
  onStats: (fps: number, extrapolated: boolean, waiting: boolean) => void;
};
export function Court({
  state,
  clock,
  observedAt,
  direction,
  side,
  replay,
  matchId,
  controllable,
  pending,
  onStats,
}: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const current = useRef({
    state,
    clock,
    observedAt,
    direction,
    side,
    replay,
    matchId, controllable, pending,
    onStats,
  });
  current.current = {
    state,
    clock,
    observedAt,
    direction,
    side,
    replay,
    matchId, controllable, pending,
    onStats,
  };
  useEffect(() => {
    const el = canvas.current!;
    const ctx = el.getContext("2d")!;
    let frame = 0,
      count = 0,
      last = performance.now();
    let lastDraw = last, renderedClock = 0n, visualY: number | null = null, context = "";
    function draw(now: number) {
      const p = current.current;
      const identity = `${p.matchId}:${p.side}:${p.replay}:${p.controllable}`;
      if (identity !== context) { context = identity; visualY = null; renderedClock = 0n; }
      const dt = Math.max(0, Math.min(50, now - lastDraw));
      lastDraw = now;
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const width = el.clientWidth;
      const height = (width * 576) / 1024;
      if (el.width !== Math.round(width * dpr)) {
        el.width = Math.round(width * dpr);
        el.height = Math.round(height * dpr);
      }
      ctx.setTransform(el.width / 1024, 0, 0, el.height / 576, 0, 0);
      ctx.fillStyle = "#050505";
      ctx.fillRect(0, 0, 1024, 576);
      ctx.strokeStyle = "#242424";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 12]);
      ctx.beginPath();
      ctx.moveTo(512, 0);
      ctx.lineTo(512, 576);
      ctx.stroke();
      ctx.setLineDash([]);
      let s = p.state;
      const elapsed = p.replay
        ? 0
        : Math.min(Math.max(0, Date.now() - p.observedAt), 600);
      let target = p.clock + BigInt(Math.floor(elapsed * 1000));
      if (!p.replay && target < renderedClock) target = renderedClock;
      renderedClock = target;
      let waiting = false;
      if (s) {
        const projected = p.replay ? { state: s, waiting: false } : projectConfirmed(s, target);
        s = projected.state;
        waiting = projected.waiting;
      }
      let yA = s ? Number(s.left) / Number(SCALE) : 288,
        yB = s ? Number(s.right) / Number(SCALE) : 288;
      if (p.state && !p.replay && target > p.state.t) {
        // Paddles keep moving along their confirmed directions even while the
        // ball waits at an unresolved impact; their bounds are independent.
        const paddles = move(p.state, target);
        yA = Number(paddles.left) / Number(SCALE);
        yB = Number(paddles.right) / Number(SCALE);
      }
      const halfA=Number(s?.halfA || 48000000n)/1e6, halfB=Number(s?.halfB || 48000000n)/1e6;
      const half=p.side===0?halfA:halfB;
      const confirmedY = p.side === 0 ? yA : yB;
      if (s && !s.awaitingServe && p.controllable && !p.replay && p.side >= 0) {
        // Integrate only time since the last rendered frame. Never apply a new
        // key direction retroactively from an old onchain snapshot.
        visualY = previewPaddle(visualY ?? confirmedY, p.direction, dt, half);
        const confirmedDir = p.side === 0 ? s.leftDir : s.rightDir;
        if (!p.pending && confirmedDir === p.direction)
          visualY += (confirmedY - visualY) * (1 - Math.exp(-dt / 140));
        if (p.side === 0) yA = visualY; else yB = visualY;
        if (Math.abs(visualY - confirmedY) > 3) {
          ctx.strokeStyle = "#858585";
          ctx.strokeRect(p.side === 0 ? 22 : 990, confirmedY - half, 12, 2*half);
        }
      } else visualY = null;
      ctx.fillStyle = "#8df5ff";
      ctx.fillRect(22, yA - halfA, 12, halfA*2);
      ctx.fillStyle = "#c6a1ff";
      ctx.fillRect(990, yB - halfB, 12, halfB*2);
      if(s?.awaitingServe && !s.finished) {
        const remaining=Math.max(0,Number(s.resumeAt-p.clock)/1e6);
        ctx.fillStyle="#e5e1ff";ctx.textAlign="center";ctx.font=`30px ${getComputedStyle(document.body).fontFamily}`;
        ctx.fillText(remaining>0?remaining.toFixed(1):"SYNCING SERVE",512,230);
        ctx.font=`12px ${getComputedStyle(document.body).fontFamily}`;ctx.fillText("CHAOS / NEXT RALLY",512,190);ctx.textAlign="left";
      }
      if (s) {
        ctx.fillStyle = "#666";
        ctx.fillRect(
          Number(s.x) / 1e6 - 6 - (Number(s.vx) / 1e6) * 0.02,
          Number(s.y) / 1e6 - 6 - (Number(s.vy) / 1e6) * 0.02,
          12,
          12,
        );
        ctx.fillStyle = "#fff";
        ctx.fillRect(Number(s.x) / 1e6 - 6, Number(s.y) / 1e6 - 6, 12, 12);
      } else {
        ctx.strokeStyle = "#777";
        ctx.strokeRect(506, 282, 12, 12);
      }
      ctx.fillStyle = "#222";
      ctx.font = `10px ${getComputedStyle(document.body).fontFamily}`;
      ctx.fillText("0,0", 12, 20);
      ctx.fillText("1024 × 576", 912, 560);
      count++;
      if (now - last > 1000) {
        p.onStats(
          Math.round((count * 1000) / (now - last)),
          !!s && !p.replay && target > (p.state?.t || 0n),
          waiting,
        );
        count = 0;
        last = now;
      }
      frame = requestAnimationFrame(draw);
    }
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <canvas
      ref={canvas}
      aria-label="Pong court. Use W and S or arrow keys to move your paddle."
      role="img"
    />
  );
}
