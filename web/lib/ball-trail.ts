type Sample = { x: number; y: number; at: number; clock: bigint; rally: string };

/** A short history of rendered positions, never another simulation of the ball. */
export class BallTrail {
  private points: Sample[] = [];
  reset() { this.points = []; }
  sample(point: Sample, enabled: boolean) {
    if (!enabled) { this.reset(); return []; }
    const previous = this.points.at(-1);
    if (previous && (point.rally !== previous.rally || point.clock < previous.clock ||
      point.at - previous.at > 160 || Math.hypot(point.x - previous.x, point.y - previous.y) > 100)) this.reset();
    this.points = this.points.filter(p => point.at - p.at < 120);
    const last = this.points.at(-1);
    if (!last || point.at - last.at >= 6 && Math.hypot(point.x - last.x, point.y - last.y) >= 1) {
      this.points.push(point);
      if (this.points.length > 20) this.points.shift();
    }
    return this.points.map(p => ({ x: p.x, y: p.y, strength: Math.max(0, 1 - (point.at - p.at) / 120) }));
  }
}
