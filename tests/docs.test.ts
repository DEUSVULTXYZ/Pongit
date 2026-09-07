import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {searchDocs,type SearchEntry} from "../web/lib/docs-search";
import docs from "../web/lib/docs.generated.json";
test("documentation covers unique routes and finds phrases and recovery concepts",async()=>{
 const index=JSON.parse(await readFile(new URL("../web/public/search/docs-v1.json",import.meta.url),"utf8")) as SearchEntry[];
 assert.equal(docs.pages.length,24);assert.equal(new Set(docs.pages.map(p=>p.slug)).size,24);
 for(const [query,path] of [["payout","betting/payments"],["Interlude","technical/architecture"],["username avatar","account/profile"],["renew","getting-started/passkeys"],["nonce","technical/permissions"]])assert.ok(searchDocs(index,query).some(r=>r.href.includes(path)),query);
 assert.deepEqual(searchDocs(index,"zzzxq-nothing-matches"),[]);assert.ok(searchDocs(index,"").length>0);
 assert.deepEqual(searchDocs(index,"<script>alert(1)</script>"),[]);
 for(const result of index){const [slug,hash]=result.href.slice(6).split("#"),page=docs.pages.find(p=>p.slug===slug);assert.ok(page);if(hash)assert.ok(page.headings.some(h=>h.id===hash));}
 assert.deepEqual(docs.contracts.map(d=>d.version),[4,3,2,1]);for(const d of docs.contracts){assert.equal(d.chainId,10143);for(const a of d.addresses)assert.match(a.address,/^0x[\da-fA-F]{40}$/);}
});
