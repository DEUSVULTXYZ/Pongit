// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {IMatchResultV2} from "../v2/GameV2.sol";
import {IndependentLobby} from "./IndependentLobby.sol";
import {IndependentArena} from "./IndependentArena.sol";
import {IndependentTypes as T} from "./IndependentTypes.sol";
import {PublishedRatings} from "./PublishedRatings.sol";
import {ContractLobby as L} from "../autonomous/ContractLobby.sol";
import {PhysicsV2} from "../v2/PhysicsV2.sol";
import {Types} from "../../vendor/interlude/interfaces/Types.sol";

/// Shared Monad financial adapter. A reused or unavailable engine is never needed to pay
/// an already captured result. Early testnet payment decisions survive later corrections.
contract IndependentSettlement is IMatchResultV2 {
    IndependentLobby public immutable lobby;
    PublishedRatings public immutable ledger;
    uint256 public constant WINDOW_BLOCKS = 40;
    uint256 public constant CONFIRMATION_BLOCKS = 2;
    struct Round { uint64 closeBlock; uint64 resumeAt; uint8 rally; bytes32 stateHash; uint256 epoch; address arena; }
    mapping(uint256=>mapping(uint8=>Round)) public rounds;
    event RoundOpened(uint256 indexed id,uint8 indexed rally,uint64 closeBlock,uint64 resumeAt,address arena,uint256 epoch);
    constructor(IndependentLobby l) {
        require(block.chainid == 10143 && address(l.ratings()) != address(0), "testnet lobby");
        lobby=l; ledger=l.ratings();
    }
    modifier base() { require(block.chainid == 10143,"Monad only"); _; }
    function _live(uint256 id) private view returns (IndependentArena a,T.Binding memory b,PhysicsV2.State memory s,uint256 phase) {
        a=IndependentArena(lobby.arenaOf(id)); if(address(a)==address(0)) return(a,b,s,0);
        b=a.boundMatch(); if(b.id!=id) return(a,b,s,0);
        (,,phase,,,,,,,,,,s)=a.getSnapshot(id);
    }
    function openRound(uint256 id) external base {
        require(ledger.indexOf(id)==0,"result captured");
        (IndependentArena a,T.Binding memory b,PhysicsV2.State memory s,uint256 phase)=_live(id);
        require(phase==2 && s.mode==1 && s.awaitingServe && b.epoch>0,"not a Chaos pause");
        require(lobby.hub().statusOf(address(a),0)==Types.Status.Active,"engine unavailable");
        uint8 rally=s.scoreA+s.scoreB; require(rounds[id][rally].closeBlock==0,"round already opened");
        require(block.number+WINDOW_BLOCKS<=type(uint64).max,"block range");
        uint64 closeBlock=uint64(block.number+WINDOW_BLOCKS);
        rounds[id][rally]=Round(closeBlock,s.resumeAt,rally,keccak256(abi.encode(address(a),b.epoch,id,s.seed,rally,s.resumeAt)),b.epoch,address(a));
        emit RoundOpened(id,rally,closeBlock,s.resumeAt,address(a),b.epoch);
    }
    function bettingWindow(uint256 id,uint64) external view returns(bool allowed,uint256 version) {
        if(block.chainid!=10143 || ledger.indexOf(id)!=0) return(false,0);
        (IndependentArena a,T.Binding memory b,PhysicsV2.State memory s,uint256 phase)=_live(id);
        if(phase==0) return(false,0);
        uint8 rally=s.scoreA+s.scoreB; Round memory r=rounds[id][rally];
        version=(uint256(r.closeBlock)<<8)|rally;
        allowed=phase==2 && s.mode==1 && s.awaitingServe && r.resumeAt==s.resumeAt && r.closeBlock>block.number
            && r.epoch==b.epoch && r.arena==address(a) && lobby.hub().statusOf(address(a),0)==Types.Status.Active
            && r.stateHash==keccak256(abi.encode(address(a),b.epoch,id,s.seed,rally,s.resumeAt));
    }
    function checkpointReady(uint256 id,uint8 rally,uint64 resumeAt) external view returns(bool ready,uint64 sourceBlock) {
        Round memory r=rounds[id][rally]; sourceBlock=r.closeBlock;
        if(block.chainid!=10143 || r.closeBlock==0 || ledger.indexOf(id)!=0) return(false,sourceBlock);
        T.Binding memory b=IndependentArena(r.arena).boundMatch();
        ready=b.id==id && b.epoch==r.epoch && r.resumeAt==resumeAt && block.number>=uint256(r.closeBlock)+CONFIRMATION_BLOCKS
            && lobby.hub().statusOf(r.arena,0)==Types.Status.Active;
    }
    function result(uint256 id) external view returns(address a,address b,address winner,uint8 status) {
        if(ledger.indexOf(id)!=0) {
            T.Result memory r=ledger.entry(id).first; return(r.a,r.b,r.winner,r.status);
        }
        L.Proposal memory p=lobby.proposal(id);
        return(p.a,p.b,address(0),p.status==0?0:p.status==1?1:2);
    }
    function finalizeResult(uint256 id) external base { lobby.capture(id); }
}
