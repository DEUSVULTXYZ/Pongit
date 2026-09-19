import type {Address,Hex} from 'viem';

/** Gas limit of every command sent to the hosted Interlude game node, by the
 * relayer (tick, cancelMatch and the pressure and beacon submissions) and by the
 * browser (every compact game control).
 *
 * Exactly 30,000,000: the largest transaction the agent arcade's hosted nodes
 * accept from its coordinator. Larger ones are refused before execution
 * ("transaction gas limit is greater than the cap"), so never raise it. The human
 * arcade's node runs the same software, but nobody has observed it accept a 30 M
 * command yet. A command it refuses before execution is now retired from the
 * journals (relayer/src/rooms-engine-recovery.ts, web/lib/rooms-command-journal.ts)
 * instead of blocking its signer, but a node that refused every 30 M command would
 * still refuse every command. Gas is free on this chain (maxFeePerGas 0) and the
 * limit is a ceiling, not a charge: a command that needs 200,000 gas uses 200,000.
 *
 * Why the ceiling matters: a Chaos advance simulates, in one call, the whole gap
 * since the last successful advancing command. During a force-grid state (wind,
 * a ball inside the gravity well, a curve shot's kicks) that costs about 2.5 to
 * 3 M gas per 100 ms of gap. A command that runs out of gas reverts without
 * progress, so the next one needs even more: the match freezes until the
 * contract's 30-minute cancel. At 15,000,000 the largest gap that fitted was
 * 540 ms (both balls inside the well) to 730 ms (one ball in the wind); at
 * 30,000,000 it is CHAOS_GAP_TOLERANCE_MS below. Lowering the limit lowers that
 * tolerance with it. This is an interim: the complete fix is gas-bounded slicing
 * inside ChaosGameFlow, which needs a new app.
 */
export const ENGINE_COMMAND_GAS=30_000_000n;

/** Largest gap, in ms of engine time, that one tick absorbs under
 * ENGINE_COMMAND_GAS, per force-grid state. Measured on the production class by
 * contracts/test/HumanChaosTickGas.t.sol (HumanChaosInterimGasTest) at the 10 ms
 * engine-block resolution, with cold storage. */
export const CHAOS_GAP_TOLERANCE_MS={oneBallWind:1410,curveShot:1350,twoBallWind:1140,twoBallWell:1030} as const;
/** The smallest measured tolerance: both balls inside the gravity well. Every
 * timing claim about the relayer guard and the browser backup is checked against
 * this one, not against the wind. */
export const CHAOS_WORST_GAP_TOLERANCE_MS=CHAOS_GAP_TOLERANCE_MS.twoBallWell;

/** The only transaction shape either side signs for the game node. */
export function engineCommandTransaction(to:Address,nonce:number,data:Hex){
 return {type:'eip1559',chainId:4242,to,nonce,data,value:0n,gas:ENGINE_COMMAND_GAS,maxFeePerGas:0n,maxPriorityFeePerGas:0n} as const;
}
