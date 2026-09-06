"use client";
import { useEffect, useRef } from "react";
import { advance, SCALE, type State } from "../../shared/physics";
type Props = {
  state: State | null;
  clock: bigint;
  observedAt: number;
  direction: number;
  side: number;
  replay: boolean;
  onStats: (fps: number, extrapolated: boolean) => void;
};
export function Court({
  state,
  clock,
  observedAt,
  direction,
  side,
  replay,
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
    onStats,
  });
  current.current = {
    state,
    clock,
    observedAt,
    direction,
    side,
    replay,
    onStats,
  };
  useEffect(() => {
    const el = canvas.current!;
    const ctx = el.getContext("2d")!;
    let frame = 0,
      count = 0,
      last = performance.now();
    function draw(now: number) {
      const p = current.current;
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
      const target = p.clock + BigInt(Math.floor(elapsed * 1000));
      if (s) {
        let predicted = { ...s };
        if (p.side === 0) predicted.leftDir = p.direction;
        if (p.side === 1) predicted.rightDir = p.direction;
        [s] = advance(predicted, target > s.t ? target : s.t, 64);
      }
      const yA = s ? Number(s.left) / Number(SCALE) : 288,
        yB = s ? Number(s.right) / Number(SCALE) : 288;
      ctx.fillStyle = "#f4f4f4";
      ctx.fillRect(22, yA - 48, 12, 96);
      ctx.fillRect(990, yB - 48, 12, 96);
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
