// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {RoomsEarlySettlement} from "../labs/RoomsEarlySettlement.sol";
import {PongInterludeRoomsChaos} from "../labs/PongInterludeRoomsChaos.sol";
import {PhysicsV2} from "../v2/PhysicsV2.sol";
import {Types} from "../../vendor/interlude/interfaces/Types.sol";

/// Rules-8 binding of the existing testnet early-payment policy. Betting stays
/// on Monad, and the published finish timestamp excludes late stakes. Jackpot
/// changes score points only; no payout multiplier is introduced here.
contract ChaosEventsSettlement is RoomsEarlySettlement {
    /// A rules-6 game is bound by its own, already deployed, settlement.
    uint256 public constant RULES=9;
    mapping(uint256=>uint64) public bettingCutoff;
    mapping(uint256=>bytes32) public recordedHash;
    event MatchRecorded(uint256 indexed id,uint256 indexed epoch,address indexed app,bytes32 hash,address a,address b,address winner,uint8 status,uint8 mode,bool ranked,uint8 scoreA,uint8 scoreB,bool played,uint64 finishedAt);
    constructor(PongInterludeRoomsChaos g)RoomsEarlySettlement(g){require(g.RULES_VERSION()==RULES,"events rules required");}
    function openRound(uint256 id) public override onlyBase {
        require(finalResults[id].status==0,"result already accepted");
        (uint256 phase,,,,PhysicsV2.State memory s)=_snapshot(id);require(phase==2&&s.mode==1,"no live Chaos match");
        Types.Session memory session=hub.sessionOf(address(game),Types.GLOBAL);
        require(session.status==Types.Status.Active&&session.epoch>0,"engine unavailable");
        require(matchEpoch[id]==0||matchEpoch[id]==session.epoch,"match epoch changed");matchEpoch[id]=session.epoch;
    }
    function bettingWindow(uint256 id,uint64) external view override returns(bool allowed,uint256 version){
        if(block.chainid!=baseChainId||finalResults[id].status!=0)return(false,0);
        (uint256 phase,,,,PhysicsV2.State memory s)=_snapshot(id);Types.Session memory session=hub.sessionOf(address(game),Types.GLOBAL);
        version=(matchEpoch[id]<<8)|RULES;
        allowed=phase==2&&s.mode==1&&matchEpoch[id]>0&&session.epoch==matchEpoch[id]&&session.status==Types.Status.Active&&session.expiresAt>block.timestamp;
    }
    function finalizeResult(uint256 id) public override onlyBase {
        uint64 cutoff=IChaosFinished(address(game)).finishedAt(id);require(cutoff>0&&cutoff<=block.timestamp,"result timestamp pending");
        super.finalizeResult(id);bettingCutoff[id]=cutoff;
    }
    /// Make the published contract result discoverable by Envio. This has no
    /// financial side effect and can record Classic without opening a market.
    function recordMatch(uint256 id) external onlyBase {
        (uint256 phase,address a,address b,address winner,PhysicsV2.State memory s)=_snapshot(id);
        uint256 epoch=IChaosFinished(address(game)).gameEpoch(id);require(epoch>0&&a!=address(0)&&b!=address(0),"unknown match");
        bytes32 hash=game.resultHashes(id);
        require(phase>=3||recordedHash[id]!=bytes32(0),"result not published");
        require(phase<3||hash!=bytes32(0),"result hash pending");
        require(hash!=recordedHash[id],"result already recorded");recordedHash[id]=hash;
        emit MatchRecorded(id,epoch,address(game),hash,a,b,winner,uint8(phase),s.mode,game.rankedMatch(id),s.scoreA,s.scoreB,s.t>0||phase==3,IChaosFinished(address(game)).finishedAt(id));
    }
}
interface IChaosFinished {function finishedAt(uint256 id) external view returns(uint64);function gameEpoch(uint256 id) external view returns(uint256);}
