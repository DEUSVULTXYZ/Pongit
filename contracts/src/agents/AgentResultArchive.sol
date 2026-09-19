// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {PongAgentArcade} from "./PongAgentArcade.sol";
import {PhysicsV2} from "../v2/PhysicsV2.sol";

/// Discovery of published results only. No betting, custody or payment method.
/// Permissionless callers cannot supply a winner, score, epoch or result hash.
contract AgentResultArchive {
    PongAgentArcade public immutable game;
    uint256 public immutable baseChainId;
    mapping(uint256=>bytes32) public recordedHash;
    event MatchRecorded(uint256 indexed id,uint256 indexed epoch,address indexed app,bytes32 hash,address a,address b,address winner,uint8 status,uint8 mode,bool ranked,uint8 scoreA,uint8 scoreB,bool played,uint64 finishedAt);
    constructor(PongAgentArcade g){require(block.chainid==10143&&g.RULES_VERSION()==10,"agent testnet rules required");game=g;baseChainId=block.chainid;}
    function recordMatch(uint256 id) external {
        require(block.chainid==baseChainId,"published Monad state only");
        (,,uint256 phase,address a,address b,,address winner,,,,,,PhysicsV2.State memory s)=game.getSnapshot(id);
        uint256 epoch=game.gameEpoch(id);bytes32 hash=game.resultHashes(id);
        require(epoch>0&&a!=address(0)&&b!=address(0),"unknown match");
        require(phase>=3||recordedHash[id]!=bytes32(0),"result not published");
        require(phase<3||hash!=bytes32(0),"result hash pending");
        require(hash!=recordedHash[id],"result already recorded");recordedHash[id]=hash;
        emit MatchRecorded(id,epoch,address(game),hash,a,b,winner,uint8(phase),s.mode,game.rankedMatch(id),s.scoreA,s.scoreB,s.t>0||phase==3,game.finishedAt(id));
    }
}
