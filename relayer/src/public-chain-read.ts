import type {IncomingMessage} from 'node:http';
import type {PublicClient} from 'viem';

const hex=(v:unknown,bytes?:number):v is `0x${string}`=>typeof v==='string'&&/^0x[\da-f]*$/i.test(v)&&v.length%2===0&&(bytes===undefined||v.length===2+bytes*2);
const quantity=(v:unknown)=>typeof v==='string'&&/^0x(?:0|[1-9a-f][\da-f]*)$/i.test(v);
const tag=(v:unknown):boolean=>typeof v==='string'&&(['latest','pending','safe','finalized','earliest'].includes(v)||quantity(v))
 ||!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>['blockHash','requireCanonical'].includes(k))
 &&hex((v as any).blockHash,32)&&(v as any).requireCanonical===true;

/** Public reads share the existing upstream budget. No signed payload, write,
 * estimate, state override or unbounded history query reaches that gateway. */
export function validatePublicChainRead(value:unknown){
 const v=value as any;
 if(!v||Array.isArray(v)||v.jsonrpc!=='2.0'||!(typeof v.id==='string'&&v.id.length<=80||Number.isSafeInteger(v.id))
  ||typeof v.method!=='string'||v.params!==undefined&&!Array.isArray(v.params))throw Error('Invalid public read');
 // JSON-RPC permits params to be omitted for a zero-argument method. viem's
 // getChainId does this during account preparation; null is still invalid.
 const p=v.params??[];let valid=false;
 switch(v.method){
  case 'eth_chainId':case 'eth_blockNumber':valid=p.length===0;break;
  case 'eth_getBlockByNumber':valid=p.length===2&&typeof p[0]==='string'&&tag(p[0])&&p[1]===false;break;
  case 'eth_getBlockByHash':valid=p.length===2&&hex(p[0],32)&&p[1]===false;break;
  case 'eth_getCode':case 'eth_getBalance':case 'eth_getTransactionCount':valid=p.length===2&&hex(p[0],20)&&tag(p[1]);break;
  case 'eth_getTransactionReceipt':valid=p.length===1&&hex(p[0],32);break;
  case 'eth_getStorageAt':valid=p.length===3&&hex(p[0],20)&&(quantity(p[1])||hex(p[1],32))&&tag(p[2]);break;
  case 'eth_call':{
   const c=p[0];valid=p.length===2&&!!c&&typeof c==='object'&&!Array.isArray(c)&&tag(p[1])
    &&Object.keys(c).every(k=>['to','from','data','gas','value'].includes(k))&&hex(c.to,20)
    &&(c.from===undefined||hex(c.from,20))&&hex(c.data)&&c.data.length<=32770
    &&(c.value===undefined||c.value==='0x0')&&(c.gas===undefined||quantity(c.gas)&&BigInt(c.gas)<=30_000_000n);
   if(valid)return {id:v.id,method:v.method,params:[{...c,gas:c.gas??'0x1c9c380'},p[1]]};
   break;
  }
 }
 if(!valid)throw Error('Unsupported public read');
 return {id:v.id,method:v.method,params:p};
}

export async function publicChainReadBody(req:IncomingMessage){
 if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']??''))throw Error('JSON required');
 let size=0;const chunks:Buffer[]=[];
 for await(const chunk of req){size+=chunk.length;if(size>36000)throw Error('Public read too large');chunks.push(Buffer.from(chunk));}
 return validatePublicChainRead(JSON.parse(Buffer.concat(chunks).toString('utf8')));
}

export function publicChainReads(client:Pick<PublicClient,'request'>){
 const pending=new Map<string,Promise<unknown>>();
 return async(call:ReturnType<typeof validatePublicChainRead>)=>{
  const key=JSON.stringify([call.method,call.params]);let work=pending.get(key);
  if(!work){
   if(pending.size>=32)return {jsonrpc:'2.0',id:call.id,error:{code:-32005,message:'Public reads busy; retry shortly'}};
   work=client.request({method:call.method,params:call.params} as any);pending.set(key,work);
   void work.finally(()=>{if(pending.get(key)===work)pending.delete(key);}).catch(()=>{});
  }
  try{return {jsonrpc:'2.0',id:call.id,result:await work};}
  catch(error){
   let cause:any=error;
   for(let i=0;cause&&i<10;i++,cause=cause.cause){
    const message=String(cause.message??'');
    if(cause.code===3||/execution reverted/i.test(message))return {jsonrpc:'2.0',id:call.id,error:{code:3,message:'execution reverted',...(hex(cause.data)&&cause.data.length<=8194?{data:cause.data}:{})}};
   }
   // Never return upstream URLs, request bodies or credentials in diagnostics.
   return {jsonrpc:'2.0',id:call.id,error:{code:-32000,message:'Public chain read unavailable'}};
  }
 };
}
