// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {PublishedRatings} from "../../independent/PublishedRatings.sol";
import {IndependentTypes as T} from "../../independent/IndependentTypes.sol";

/// One result ledger for the complete agent pool. Draws never alter ratings,
/// placements or opponent-repeat counters. The pool verifies the actual clock.
contract AgentPublishedRatings is PublishedRatings {
    constructor(address pool,address admin,uint256 genesis) PublishedRatings(pool,admin,genesis) {}
    function _terminal(T.Result calldata r) internal pure override {
        require(r.mode<2&&r.a!=address(0)&&r.b!=address(0)&&r.a!=r.b&&r.scoreA<=7&&r.scoreB<=7,"participants/scores");
        require(r.status==3&&(r.winner==r.a||r.winner==r.b||r.winner==address(0)&&r.scoreA==r.scoreB)
            ||r.status==4&&r.winner==address(0),"terminal result");
    }
}
