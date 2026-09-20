/** Only a confirmed InvalidMatch receipt can race the final point. A missing
 * response, uncleared journal or another contract error remains a failure.
 * The caller must read/validate the same arena and epoch as its command lane. */
export async function terminalAfterRevert<T extends {id:bigint;phase:number}>(
 error:unknown,id:bigint,pending:()=>unknown,read:()=>Promise<T>,
):Promise<T|undefined>{
 const e=error as {name?:string;errorName?:string}|undefined;
 if(e?.name!=='AppRevertError'||e.errorName!=='InvalidMatch'||pending())return;
 const state=await read();
 if(state.id===id&&state.phase>=3)return state;
}
