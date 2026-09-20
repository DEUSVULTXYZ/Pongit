// Diagnose the browser fixture itself. No chain, Mera account, service or
// gameplay request is made. Credential/PRF material stays in memory only.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
assert.equal(process.env.PONG_VIRTUAL_PRF_CHECK,'isolated-vps');
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const report:any={at:new Date().toISOString(),scope:'Chrome virtual authenticator export/import diagnostic, no physical passkey or chain calls'};
try{
 const page=await browser.newPage();
 await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:'<title>Private PRF diagnostic</title>'}));
 await page.goto('https://pongit.xyz/');
 const cdp=await page.context().newCDPSession(page);await cdp.send('WebAuthn.enable');
 const options={protocol:'ctap2' as const,transport:'internal' as const,hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true,hasPrf:true};
 const {authenticatorId}=await cdp.send('WebAuthn.addVirtualAuthenticator',{options});
 report.created=await page.evaluate(async()=>{
  const credential=await navigator.credentials.create({publicKey:{rp:{id:'pongit.xyz',name:'Private test'},user:{id:crypto.getRandomValues(new Uint8Array(32)),name:'fixture',displayName:'fixture'},challenge:crypto.getRandomValues(new Uint8Array(32)),pubKeyCredParams:[{type:'public-key',alg:-7}],authenticatorSelection:{residentKey:'required',userVerification:'required'},extensions:{prf:{eval:{first:new Uint8Array(32)}}}}}) as PublicKeyCredential;
  (window as any).diagnosticId=credential.rawId;
  return !!credential.getClientExtensionResults().prf?.enabled;
 });
 const read=()=>page.evaluate(async()=>{
  const credential=await navigator.credentials.get({publicKey:{rpId:'pongit.xyz',challenge:crypto.getRandomValues(new Uint8Array(32)),allowCredentials:[{type:'public-key',id:(window as any).diagnosticId}],userVerification:'required',extensions:{prf:{eval:{first:new Uint8Array(32)}}}}}) as PublicKeyCredential;
  const first=credential.getClientExtensionResults().prf?.results?.first;
  if(!first)return {available:false,same:false};
  const bytes=ArrayBuffer.isView(first)?new Uint8Array(first.buffer,first.byteOffset,first.byteLength):new Uint8Array(first),previous=(window as any).diagnosticPrf as Uint8Array|undefined;
  const same=!previous||bytes.every((n,i)=>n===previous[i]);
  if(!previous)(window as any).diagnosticPrf=bytes;
  return {available:true,same};
 });
 report.original=await read();report.originalRepeated=await read();
 const {credentials}=await cdp.send('WebAuthn.getCredentials',{authenticatorId});
 assert.equal(credentials.length,1);
 report.exportedFieldNames=Object.keys(credentials[0]);
 await cdp.send('WebAuthn.removeVirtualAuthenticator',{authenticatorId});
 const imported=await cdp.send('WebAuthn.addVirtualAuthenticator',{options});
 await cdp.send('WebAuthn.addCredential',{authenticatorId:imported.authenticatorId,credential:credentials[0]});
 report.imported=await read();
 assert(report.created&&report.original.available&&report.originalRepeated.same,'Fresh virtual PRF control failed');
 report.restoresPrf=report.imported.available&&report.imported.same;
}finally{
 await browser.close();await writeFile('/diagnostics/virtual-prf-import.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify(report));
}
