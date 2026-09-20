/** Read-only qualification rules. HTTP liveness and an elapsed clock are not
 * evidence that an arena can play. Unknown samples always remain unavailable. */
export type ArenaSample = {
  app: string;
  epoch: string;
  hubStatus: number;
  expiresAt: number;
  available: boolean;
  batches: string;
  stage: string;
  healthAt: number;
  healthEpoch: string | null;
  healthMatchId: string | null;
  /** Verified publication budget and contract eligibility for a hosted idle slot. */
  admissionReady?: boolean;
  matchId: string | null;
  progressAt: number | null;
  pendingCommandAgeMs: number;
};
export type PoolSample = {
  at: number;
  blockTimestamp: number;
  admissions: boolean;
  apiReadable: boolean;
  arenas: ArenaSample[];
  error?: string;
};
export type PoolAvailability = {
  progressing: number;
  ready: number;
  reusable: number;
  closing: number;
  expired: number;
  unavailable: boolean;
  reasons: string[];
};

function hostedFresh(sample: PoolSample, arena: ArenaSample) {
  return arena.hubStatus === 1 && arena.expiresAt > sample.blockTimestamp && arena.healthEpoch === arena.epoch
    && Number.isFinite(arena.healthAt) && arena.healthAt <= sample.at + 2000 && sample.at - arena.healthAt <= 15000
    && Number.isFinite(arena.pendingCommandAgeMs) && arena.pendingCommandAgeMs >= 0 && arena.pendingCommandAgeMs < 10000;
}
function progressing(sample: PoolSample, arena: ArenaSample) {
  return hostedFresh(sample, arena) && arena.stage === 'playing' && !!arena.matchId && arena.healthMatchId === arena.matchId
    && arena.progressAt !== null && Number.isFinite(arena.progressAt)
    && arena.progressAt <= sample.at + 2000 && sample.at - arena.progressAt <= 10000;
}
export function poolAvailability(sample: PoolSample): PoolAvailability {
  const view: PoolAvailability = {progressing: 0, ready: 0, reusable: 0, closing: 0, expired: 0, unavailable: false, reasons: []};
  if (sample.error) view.reasons.push('sample-failed');
  if (!sample.admissions) view.reasons.push('admissions-closed');
  if (!sample.apiReadable) view.reasons.push('published-api-unreadable');
  if (!sample.arenas.length) view.reasons.push('no-arena-evidence');
  for (const arena of sample.arenas) {
    if (arena.hubStatus === 2) view.closing++;
    if (arena.hubStatus === 1 && arena.expiresAt <= sample.blockTimestamp) view.expired++;
    // Reusable means the contract permits admission, not that the provider has
    // accepted a new delegation. Keep it separate from actually progressing.
    if (arena.hubStatus === 0 && arena.available) view.reusable++;
    if (progressing(sample, arena)) view.progressing++;
    if (arena.matchId && arena.stage === 'playing' && !progressing(sample, arena))
      view.reasons.push('assigned-game-not-progressing');
    if (hostedFresh(sample, arena) && arena.stage === 'available' && !arena.matchId && arena.available
      && arena.admissionReady === true && arena.pendingCommandAgeMs === 0) view.ready++;
  }
  // A released contract is only potential capacity. It cannot keep service
  // green through an hour of closure or an unsuccessful hosted provisioning.
  if (!view.progressing && !view.ready) view.reasons.push('no-progressing-or-ready-arena');
  view.unavailable = view.reasons.length > 0;
  return view;
}

export type PoolQualification = {
  startedAt: number;
  lastAt: number;
  samples: number;
  maxGapMs: number;
  measuredMs: number;
  unavailableMs: number;
  unknownMs: number;
  maxProgressing: number;
  renewalOutageSamples: number;
  epochs: Record<string, string[]>;
};
export function newPoolQualification(startedAt: number): PoolQualification {
  return {startedAt, lastAt: startedAt, samples: 0, maxGapMs: 0, measuredMs: 0, unavailableMs: 0,
    unknownMs: 0, maxProgressing: 0, renewalOutageSamples: 0, epochs: {}};
}
export function recordPoolSample(state: PoolQualification, sample: PoolSample, previous?: PoolSample) {
  if (!Number.isFinite(sample.at) || sample.at < state.lastAt) throw Error('Qualification clock moved backwards');
  const gap = sample.at - state.lastAt;
  state.maxGapMs = Math.max(state.maxGapMs, gap);
  // Attribute an interval only when both ends were actually sampled recently.
  // A stopped monitor never fabricates healthy time on its next invocation.
  if (previous && gap <= 45000) {
    state.measuredMs += gap;
    if (poolAvailability(previous).unavailable || poolAvailability(sample).unavailable) state.unavailableMs += gap;
  } else state.unknownMs += gap;
  const view = poolAvailability(sample);
  if (view.unavailable && (view.closing || view.expired)) state.renewalOutageSamples++;
  state.maxProgressing = Math.max(state.maxProgressing, view.progressing);
  for (const arena of sample.arenas) {
    const epochs = state.epochs[arena.app] ??= [];
    if (progressing(sample, arena) && !epochs.includes(arena.epoch)) epochs.push(arena.epoch);
  }
  state.samples++;
  state.lastAt = sample.at;
  return view;
}
export function poolQualificationVerdict(state: PoolQualification, input: {
  last: PoolSample | undefined; stopped: boolean; sourcesUnchanged: boolean; durationMs: number;
}) {
  const reasons: string[] = [];
  if (input.durationMs < 86400000 || state.lastAt - state.startedAt < input.durationMs) reasons.push('full-24-hours-not-observed');
  if (input.stopped) reasons.push('monitor-stopped');
  if (!input.sourcesUnchanged) reasons.push('source-changed-or-unresolved');
  if (state.maxGapMs > 45000 || state.unknownMs > 45000) reasons.push('sample-gaps');
  if (state.maxProgressing < 2) reasons.push('two-simultaneous-games-not-observed');
  if (state.renewalOutageSamples) reasons.push('global-interruption-during-renewal');
  if (state.unavailableMs) reasons.push('service-interruptions-observed');
  if (!Object.values(state.epochs).some(epochs => epochs.length >= 2)) reasons.push('renewal-not-observed');
  if (!input.last || poolAvailability(input.last).unavailable) reasons.push('ended-unavailable');
  // This is deliberately not a deployment decision: actual capacity, published
  // results, costs, traffic, all effects and browser evidence need a full review.
  return {continuousServiceChecksPassed: reasons.length === 0, reasons, publicOpeningAuthorized: false as const};
}
