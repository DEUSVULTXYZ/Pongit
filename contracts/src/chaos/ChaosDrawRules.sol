// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @notice Stateless draw derivation. The game must store the commitment before
/// the round is published and must verify the beacon with immutable DrandEvmnet.
/// This module never accepts a caller-signed substitute for a beacon.
contract ChaosDrawRules {
    bytes32 public constant CHAIN_HASH = 0x04f1e9062b8a81f848fded9c12306733282b2727ecced50032187751166ec8c3;
    bytes32 public constant DOMAIN = keccak256("PONGIT_CHAOS_EVENTS_6");
    struct Request {
        address app; uint64 epoch; uint256 matchId; uint32 index; uint64 round; uint24 excluded;
    }
    struct Draw { uint8 eventId; uint8 target; uint32 variant; uint16 intervalMs; }
    error InvalidDrawContext();
    function commitment(Request calldata r) public pure returns(bytes32) {
        if(r.app==address(0)||r.epoch==0||r.matchId==0||r.round==0)revert InvalidDrawContext();
        return keccak256(abi.encode(DOMAIN,uint256(10143),CHAIN_HASH,r));
    }
    function durationMs(uint8 eventId) external pure returns(uint16) {
        if(eventId==0||eventId>24)revert InvalidDrawContext();
        uint16[24] memory values=[uint16(6000),5000,12000,8000,8000,8000,6000,5000,8000,7000,6000,6000,10000,10000,8000,8000,8000,10000,12000,8000,12000,12000,8000,12000];
        return values[eventId-1];
    }
    function weight(uint8 eventId) public pure returns(uint8) {
        if(eventId==0||eventId>24)revert InvalidDrawContext();return eventId<=20?4:1;
    }
    function reveal(Request calldata r,bytes32 storedCommitment,bytes32 verifiedRandomness) external pure returns(Draw memory d) {
        bytes32 c=commitment(r);if(c!=storedCommitment)revert InvalidDrawContext();
        uint256 total;for(uint8 i=1;i<=24;i++)if((r.excluded&(uint24(1)<<(i-1)))==0)total+=weight(i);
        if(total==0)revert InvalidDrawContext();
        uint256 choice=_uniform(keccak256(abi.encode(c,verifiedRandomness,"event")),total);
        for(uint8 i=1;i<=24;i++)if((r.excluded&(uint24(1)<<(i-1)))==0){
            uint256 w=weight(i);if(choice<w){d.eventId=i;break;}choice-=w;
        }
        d.target=uint8(uint256(keccak256(abi.encode(c,verifiedRandomness,"target")))&1);
        d.variant=uint32(uint256(keccak256(abi.encode(c,verifiedRandomness,"variant"))));
        // Align to the 10 ms physics grid; include both interval endpoints.
        d.intervalMs=uint16(8000+10*_uniform(keccak256(abi.encode(c,verifiedRandomness,"interval")),401));
    }
    function _uniform(bytes32 seed,uint256 bound) private pure returns(uint256) {
        uint256 minimum=addmod(type(uint256).max,1,bound);
        uint256 n=uint256(seed);
        // Rejection sampling avoids modulo bias. The pathological probability is
        // negligible, but bounded execution must remain explicit on every input.
        for(uint256 attempt;attempt<8;attempt++){
            if(n>=minimum)return n%bound;
            n=uint256(keccak256(abi.encode(seed,attempt)));
        }
        revert InvalidDrawContext();
    }
}
