// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {IndependentLobby} from "./IndependentLobby.sol";
import {IndependentEventsArena} from "./IndependentEventsArena.sol";
import {IndependentTypes as T} from "./IndependentTypes.sol";
import {ArcadeFamily} from "./ArcadeFamily.sol";
import {IInterludeHub} from "../../vendor/interlude/interfaces/IInterludeHub.sol";

/// Capture the financial cutoff atomically with the first published result.
/// The inherited reuse gate cannot admit another match before this succeeds.
/// Corrections update the ranking ledger, never the original payment decision.
contract IndependentEventsLobby is IndependentLobby {
    mapping(uint256=>uint64) public bettingCutoff;
    event PaymentResultCaptured(uint256 indexed id,address indexed arena,uint256 indexed epoch,bytes32 hash,uint64 cutoff);

    constructor(ArcadeFamily f,IInterludeHub h,address admin,address bridge)
        IndependentLobby(f,h,admin,bridge) {}

    function capture(uint256 id) public override {
        bool first=ratings.indexOf(id)==0;
        super.capture(id);
        if(first){
            T.Result memory r=ratings.entry(id).first;
            IndependentEventsArena arena=IndependentEventsArena(r.arena);
            require(arena.RULES_VERSION()==12,"current human rules required");
            uint64 cutoff=arena.finishedAt(id);
            require(r.status==4 || cutoff>0 && cutoff<=block.timestamp,"published cutoff pending");
            bettingCutoff[id]=cutoff;
            emit PaymentResultCaptured(id,r.arena,r.epoch,r.hash,cutoff);
        }
    }
}
