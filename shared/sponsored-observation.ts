import type {ChainOperation} from './independent';

/** Read-only recovery. A timeout never retires an uncertain signed operation. */
export async function observeSponsoredOperation(port:{
 saved:()=>string|null;
 read:(id:string)=>Promise<ChainOperation>;
 clear:()=>void;
}){
 const id=port.saved();if(!id)return null;
 const operation=await port.read(id);
 if(operation.id!==id)throw Error('Sponsored operation identity mismatch');
 if(!['queued','pending','confirmed','failed'].includes(operation.status))throw Error('Unknown sponsored operation status');
 if((operation.status==='confirmed'||operation.status==='failed')&&port.saved()===id)port.clear();
 return operation;
}
