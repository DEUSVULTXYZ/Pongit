/** Presentation only. The engine still owns movement, bounds and collisions. */
const PREVIEW_BOUND = 108;
export class LivePaddle {
  private y: number | null = null;

  reset() { this.y = null; }

  step(confirmed: number, direction: number, confirmedDirection: number, half: number,
    elapsedMs: number, stale: boolean, pending: boolean, speed=180) {
    const clamp = (y: number) => Math.max(half, Math.min(576 - half, y));
    if (this.y === null) this.y = clamp(confirmed);
    const before = this.y;
    const dt = Math.max(0, Math.min(50, elapsedMs)) / 1000;
    const held = direction !== 0;
    // Input moves immediately from the last displayed position. A receipt must
    // not restart a held direction from an older engine position. A held key
    // also keeps moving while the stream is stale: freezing only this paddle
    // let the opponent, still extrapolated along its confirmed direction,
    // visibly outrun the player. The unconfirmed excursion stays bounded.
    const advanced = this.y + direction * speed * dt;
    this.y = clamp(stale && held ? Math.max(confirmed - PREVIEW_BOUND, Math.min(confirmed + PREVIEW_BOUND, advanced)) : stale ? this.y : advanced);
    const error = confirmed - this.y;
    // Never reconcile against a direction whose successor is still in flight.
    // Small engine corrections blend more slowly than player movement, so a
    // held key cannot visibly reverse when a snapshot arrives. While stale a
    // held key owns the paddle; reconciling at the same speed it moves would
    // cancel it out and freeze the preview again. A release still snaps back.
    if ((stale ? !held : !pending && confirmedDirection === direction)) {
      const limit = (stale ? 180 : 60) * dt;
      const adjustment = Math.abs(error) < 0.15 ? 0 : error * (1 - Math.exp(-dt / 0.18));
      this.y = clamp(this.y + Math.max(-limit, Math.min(limit, adjustment)));
    }
    // Bound local preview during a slow/lost acknowledgement. Stop extending
    // the preview instead of jumping backwards at a snapshot boundary.
    if (!stale && Math.abs(error) > 108 && Math.sign(error) !== direction && direction !== 0) {
      this.y = clamp(before);
    }
    return { y: this.y, correction: Math.abs(error) };
  }
}

/** A newer observation can slow the presentation clock, never reverse it. */
export class LiveClock {
  private target = 0n;
  reset() { this.target = 0n; }
  sample(target: bigint) {
    if (target > this.target) this.target = target;
    return this.target;
  }
}
