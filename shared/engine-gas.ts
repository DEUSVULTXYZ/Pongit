import type {Address,Hex} from 'viem';

/** Gas limit of every command sent to the hosted Interlude game node, by the
 * relayer (tick, cancelMatch and the pressure and beacon submissions) and by the
 * browser (every compact game control).
 *
 * Default and maximum: exactly 30,000,000, the largest transaction the agent
 * arcade's hosted nodes accept from its coordinator. Larger ones are refused before
 * execution ("transaction gas limit is greater than the cap"), so it is never
 * raised. The human arcade's node runs the same software, but nobody has observed
 * it accept a 30 M command yet. If it refuses one, the relayer retires the
 * command, reports ENGINE_GAS_CAP and closes the arena (shared/engine-halt.ts);
 * the operator then sets ROOMS_ENGINE_COMMAND_GAS=15000000 and restarts the
 * relayer. No rebuild: the relayer serves the value in /api/interlude/config, and
 * an open tab signs its next control with it. Gas is free on this chain
 * (maxFeePerGas 0) and the limit is a ceiling, not a charge: a command that needs
 * 200,000 gas uses 200,000.
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
/** The release's limit, and the documented fallback. */
export const ENGINE_COMMAND_GAS_FALLBACK=15_000_000n;
/** Below this, even a plain tick could run out of gas. */
export const ENGINE_COMMAND_GAS_MIN=1_000_000n;
export const ENGINE_COMMAND_GAS_ENV='ROOMS_ENGINE_COMMAND_GAS';

/** A gas limit from configuration: a whole number from ENGINE_COMMAND_GAS_MIN to
 * ENGINE_COMMAND_GAS. Anything else is undefined, never clamped. */
export function parseEngineCommandGas(value:unknown):bigint|undefined{
 let gas:bigint;
 if(typeof value==='bigint')gas=value;
 else if(typeof value==='number'&&Number.isSafeInteger(value))gas=BigInt(value);
 else if(typeof value==='string'&&/^\d{1,12}$/.test(value.trim()))gas=BigInt(value.trim());
 else return undefined;
 return gas>=ENGINE_COMMAND_GAS_MIN&&gas<=ENGINE_COMMAND_GAS?gas:undefined;
}
/** The relayer's limit: ROOMS_ENGINE_COMMAND_GAS, or ENGINE_COMMAND_GAS when it
 * is unset. A value that is set but invalid stops startup, rather than signing
 * with a limit the operator did not choose. */
export function engineCommandGasFromEnv(env:Record<string,string|undefined>):bigint{
 const raw=env[ENGINE_COMMAND_GAS_ENV];
 if(raw===undefined||raw.trim()==='')return ENGINE_COMMAND_GAS;
 const gas=parseEngineCommandGas(raw);
 if(gas===undefined)throw new Error(`${ENGINE_COMMAND_GAS_ENV} must be a whole number from ${ENGINE_COMMAND_GAS_MIN} to ${ENGINE_COMMAND_GAS}`);
 return gas;
}
/** The browser's limit, as the relayer's config last served it. */
let configured=ENGINE_COMMAND_GAS;
export const engineCommandGas=()=>configured;
/** Adopt a served limit. An invalid or missing value keeps the current one. */
export function setEngineCommandGas(value:unknown){
 const gas=parseEngineCommandGas(value);
 if(gas===undefined)return false;
 configured=gas;return true;
}

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
export function engineCommandTransaction(to:Address,nonce:number,data:Hex,gas:bigint=configured){
 return {type:'eip1559',chainId:4242,to,nonce,data,value:0n,gas,maxFeePerGas:0n,maxPriorityFeePerGas:0n} as const;
}
