import assert from "node:assert/strict";
import test from "node:test";
import { hashTypedData, toHex, type Address } from "viem";
import { CHAOS_ROOMS_RULES, chaosOfferDomain, chaosOfferTypes, type ChaosRoomsOffer } from "../shared/rooms-chaos";
import { offerTypes } from "../shared/rooms";

const address = (n: number) => toHex(n, { size: 20 }) as Address;
const domain = chaosOfferDomain(10143, address(99));
const message: ChaosRoomsOffer = {
  id: 1n, room: toHex(2, {size:32}), a: address(1), b: address(2),
  mode: 1, ranked: true, expires: 2000n, rules: CHAOS_ROOMS_RULES, entropy: toHex(3,{size:32}),
};
const digest = (m = message, d = domain) => hashTypedData({domain:d,types:chaosOfferTypes,primaryType:"MatchOffer",message:m});
test("candidate consent binds mode, opponent, ranking, expiry and deployment", () => {
  const signed = digest();
  for(const patch of [{mode:0 as const},{b:address(3)},{ranked:false},{expires:2001n},{rules:3n},{room:toHex(4,{size:32})}]) {
    assert.notEqual(digest({...message,...patch}),signed);
  }
  assert.notEqual(digest(message,chaosOfferDomain(4242,address(99))),signed);
  assert.notEqual(digest(message,chaosOfferDomain(10143,address(100))),signed);
});
test("original Classic consent is not interchangeable with candidate consent", () => {
  const old = hashTypedData({domain:{...domain,version:"1"},types:offerTypes,primaryType:"MatchOffer",message:{...message,rules:3n}});
  assert.notEqual(old,digest({...message,mode:0}));
});
