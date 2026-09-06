import test from "node:test";import assert from "node:assert/strict";import {parseEther,parseGwei} from "viem";import {needsMonadValueWindow} from "../relayer/src/budget";
test("funded Monad sponsorship skips quiet windows without dipping into the reserve",()=>{
 const cap=parseGwei("200"),value=parseEther("0.02");
 assert.equal(needsMonadValueWindow(10143,value,parseEther("198"),parseEther("1"),cap),false);
 assert.equal(needsMonadValueWindow(10143,value,parseEther("16.52"),parseEther("0.5"),cap),false);
 assert.equal(needsMonadValueWindow(10143,value,parseEther("16.519"),parseEther("0.5"),cap),true);
 assert.equal(needsMonadValueWindow(10143,value,parseEther("5"),0n,cap),true);
 assert.equal(needsMonadValueWindow(10143,0n,parseEther("5"),0n,cap),false);
 assert.equal(needsMonadValueWindow(31337,value,parseEther("5"),0n,cap),false);
});
