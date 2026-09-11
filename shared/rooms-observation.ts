/** Idle invitations do not need a gameplay-rate observer. The coordinator's
 * lobby notification still starts a fresh read as soon as the match starts. */
export function roomSnapshotPollMs(status: string | undefined, phase: number | undefined, hidden: boolean): number | null {
  if (phase !== undefined && phase !== 1 && phase !== 2 && (status === "cancelled" || status === "complete" || phase >= 3)) return null;
  if (hidden || phase !== 2) return 2000;
  return 500;
}
