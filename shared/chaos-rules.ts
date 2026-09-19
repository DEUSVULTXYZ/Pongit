/**
 * Rules numbers of the human Chaos events application (PongChaosEvents). Offers, the finance
 * binding (ChaosEventsSettlement) and result hashes carry the number.
 *  6: the kernel deployed on 13 September 2026. In a microsecond with several contacts it
 *     resolves only the tie-break winner, so a second Multiball ball can pass a paddle.
 *  8: the corrected kernel, which resolves every one (docs/validation/chaos-corrected.md).
 * 7 is the Agent Arcade's, a separate application that still links the rules-6 kernel.
 */
export const CHAOS_EVENTS_RULES=[6,8] as const;
export type ChaosEventsRules=(typeof CHAOS_EVENTS_RULES)[number];
export const isChaosEventsRules=(rules:unknown):rules is ChaosEventsRules=>rules===6||rules===8;
/** Whether the kernel behind these rules resolves every contact of a microsecond. */
export const chaosResolvesEveryContact=(rules:unknown)=>rules===8;
