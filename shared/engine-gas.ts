import type {Address,Hex} from 'viem';

/** Gas limit of every command sent to the hosted Interlude game node, by the
 * relayer (tick, cancelMatch and the pressure and beacon submissions) and by the
 * browser (every compact game control).
 *
 * Exactly 30,000,000: the largest transaction the hosted node accepts. Larger
 * ones are refused before execution, so never raise it. Gas is free on this chain
 * (maxFeePerGas 0) and the limit is a ceiling, not a charge: a command that needs
 * 200,000 gas still uses 200,000.
 *
 * Why the ceiling matters: a Chaos advance simulates, in one call, the whole gap
 * since the last successful advancing command. During a force-grid state (wind,
 * a ball inside the gravity well, a curve shot's kicks) that costs about 2 M gas
 * per 100 ms of gap. A command that runs out of gas reverts without progress, so
 * the next one needs even more: the match freezes until the contract's 30-minute
 * cancel. At 15,000,000 the largest wind gap that fitted was 730 ms (600 ms with
 * two balls); at 30,000,000 it is CHAOS_WIND_GAP_TOLERANCE_MS below. Lowering the
 * limit lowers that tolerance with it. This is an interim: the complete fix is
 * gas-bounded slicing inside ChaosGameFlow, which needs a new app.
 */
export const ENGINE_COMMAND_GAS=30_000_000n;

/** Largest gap, in ms of engine time, that one tick absorbs under
 * ENGINE_COMMAND_GAS during the costliest force-grid states. Measured on the
 * production class by contracts/test/HumanChaosTickGas.t.sol
 * (HumanChaosInterimGasTest). Documentation for the guard's timing budget. */
export const CHAOS_WIND_GAP_TOLERANCE_MS={oneBall:1410,twoBalls:1140} as const;

/** The only transaction shape either side signs for the game node. */
export function engineCommandTransaction(to:Address,nonce:number,data:Hex){
 return {type:'eip1559',chainId:4242,to,nonce,data,value:0n,gas:ENGINE_COMMAND_GAS,maxFeePerGas:0n,maxPriorityFeePerGas:0n} as const;
}
