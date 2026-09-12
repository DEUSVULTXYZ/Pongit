const url=process.argv[2];if(!/^http:\/\/(127\.0\.0\.1|independent-web):3000\/rooms\/0x[\da-f]{40}(:|%3A)\d+$/.test(url))throw Error('Private room URL only');
export {};
const r=await fetch(url),body=await r.text();console.log(JSON.stringify({status:r.status,bytes:body.length,roomIncluded:body.includes('IndependentHub'),notFound:body.includes('could not be found'),title:body.match(/<title>(.*?)<\/title>/)?.[1]}));
