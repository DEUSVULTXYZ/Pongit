// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {IMatchResultV2} from "../v2/GameV2.sol";
import {IndependentEventsLobby} from "./IndependentEventsLobby.sol";
import {IndependentEventsArena} from "./IndependentEventsArena.sol";
import {IndependentArena} from "./IndependentArena.sol";
import {IndependentTypes as T} from "./IndependentTypes.sol";
import {PublishedRatings} from "./PublishedRatings.sol";
import {ContractLobby as L} from "../autonomous/ContractLobby.sol";
import {PhysicsV2} from "../v2/PhysicsV2.sol";
import {Types} from "../../vendor/interlude/interfaces/Types.sol";

/// Monad-only realtime betting for rules 12. No betting pause is added to play.
/// The first published result and its cutoff survive closure and arena reuse.
contract IndependentEventsSettlement is IMatchResultV2 {
    IndependentEventsLobby public immutable lobby;
    PublishedRatings public immutable ledger;
    struct MarketBinding {address arena;uint256 epoch;}
    mapping(uint256=>MarketBinding) public markets;
    event MarketBound(uint256 indexed id,address indexed arena,uint256 indexed epoch);
    constructor(IndependentEventsLobby l){
        require(block.chainid==10143&&l.setupSealed(),"sealed testnet lobby");
        IndependentArena[] memory arenas=l.arenaPage();
        for(uint256 i;i<arenas.length;i++)require(IndependentEventsArena(address(arenas[i])).RULES_VERSION()==12,"current human rules required");
        lobby=l;ledger=l.ratings();
    }
    modifier base(){require(block.chainid==10143,"Monad only");_;}
    function _live(uint256 id) private view returns(address at,T.Binding memory binding,uint256 phase,uint8 mode){
        at=lobby.arenaOf(id);if(at==address(0))return(at,binding,0,0);
        IndependentEventsArena arena=IndependentEventsArena(at);binding=arena.boundMatch();
        if(binding.id!=id)return(at,binding,0,0);
        PhysicsV2.State memory state;(,,phase,,,,,,,,,,state)=arena.getSnapshot(id);mode=state.mode;
    }
    function openRound(uint256 id) external base {
        require(ledger.indexOf(id)==0,"result captured");
        (address at,T.Binding memory b,uint256 phase,uint8 mode)=_live(id);
        require(phase==2&&mode==1&&b.epoch>0,"no live Chaos match");
        Types.Session memory s=lobby.hub().sessionOf(at,0);
        require(s.status==Types.Status.Active&&s.epoch==b.epoch&&s.expiresAt>block.timestamp,"engine unavailable");
        MarketBinding memory old=markets[id];
        require(old.arena==address(0)||old.arena==at&&old.epoch==b.epoch,"market binding changed");
        if(old.arena==address(0)){markets[id]=MarketBinding(at,b.epoch);emit MarketBound(id,at,b.epoch);}
    }
    function bettingWindow(uint256 id,uint64) external view returns(bool allowed,uint256 version){
        if(block.chainid!=10143||ledger.indexOf(id)!=0)return(false,0);
        MarketBinding memory market=markets[id];if(market.arena==address(0))return(false,0);
        (address at,T.Binding memory b,uint256 phase,uint8 mode)=_live(id);
        version=uint256(keccak256(abi.encode(uint256(10143),at,b.epoch,id,uint256(12))));
        if(phase!=2||mode!=1||at!=market.arena||b.epoch!=market.epoch)return(false,version);
        Types.Session memory s=lobby.hub().sessionOf(at,0);
        return(s.status==Types.Status.Active&&s.epoch==b.epoch&&s.expiresAt>block.timestamp,version);
    }
    function result(uint256 id) external view returns(address a,address b,address winner,uint8 status){
        if(ledger.indexOf(id)!=0){T.Result memory r=ledger.entry(id).first;return(r.a,r.b,r.winner,r.status);}
        L.Proposal memory p=lobby.proposal(id);return(p.a,p.b,address(0),p.status==0?0:p.status==1?1:2);
    }
    function bettingCutoff(uint256 id) external view returns(uint64){return lobby.bettingCutoff(id);}
    function finalizeResult(uint256 id) external base {
        // Captured payments are independent of later matches using the arena.
        if(ledger.indexOf(id)==0)lobby.capture(id);
    }
}
