// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {IMatchResultV2} from "../v2/GameV2.sol";
import {ReusableEventsLobby} from "./ReusableEventsLobby.sol";
import {ReusableEventsArena} from "./ReusableEventsArena.sol";
import {ReusableAdmission as Admission} from "./ReusableAdmission.sol";
import {IndependentTypes as T} from "./IndependentTypes.sol";
import {PublishedRatings} from "./PublishedRatings.sol";
import {ContractLobby as L} from "../autonomous/ContractLobby.sol";
import {RoomsState} from "../labs/RoomsState.sol";
import {Types} from "../../vendor/interlude/interfaces/Types.sol";

/// Candidate Monad financial boundary. The live published slot must carry the
/// exact authoritative admission, and the first proven payment result is kept
/// independently of reuse, closure and later rating corrections.
contract ReusableEventsSettlement is IMatchResultV2 {
    ReusableEventsLobby public immutable lobby;
    PublishedRatings public immutable ledger;
    uint256 public constant rulesVersion=14;
    struct MarketBinding {address arena;uint256 epoch;}
    mapping(uint256=>MarketBinding) public markets;
    event MarketBound(uint256 indexed id,address indexed arena,uint256 indexed epoch);
    constructor(ReusableEventsLobby authority){
        require(block.chainid==10143&&authority.setupSealed()&&authority.arenaRulesVersion()==14,"sealed rules14 lobby");
        lobby=authority;ledger=authority.ratings();
    }
    modifier base(){require(block.chainid==10143,"Monad only");_;}
    function _live(uint256 id) private view returns(bool,address,uint256){
        address at=lobby.arenaOf(id);if(at==address(0))return(false,at,0);
        (Admission.Ticket memory ticket,)=lobby.ticketOf(id);
        (uint256 epoch,uint256 currentId,uint256 sequence,bytes32 hash)=ReusableEventsArena(at).currentAdmission();
        if(epoch!=ticket.epoch||currentId!=id||sequence!=ticket.sequence||hash!=Admission.digest(ticket))return(false,at,ticket.epoch);
        Types.Session memory session=lobby.hub().sessionOf(at,0);
        if(session.status!=Types.Status.Active||session.epoch!=epoch||session.batchIndex==0||session.expiresAt<=block.timestamp)return(false,at,epoch);
        RoomsState.Header memory state=ReusableEventsArena(at).getSnapshot(id);
        return(state.phase==2&&state.state.mode==1,at,epoch);
    }
    function openRound(uint256 id) external base {
        require(ledger.indexOf(id)==0,"result captured");(bool live,address at,uint256 epoch)=_live(id);require(live,"no published authorized Chaos match");
        MarketBinding memory prior=markets[id];require(prior.arena==address(0)||prior.arena==at&&prior.epoch==epoch,"market binding changed");
        if(prior.arena==address(0)){markets[id]=MarketBinding(at,epoch);emit MarketBound(id,at,epoch);}
    }
    function bettingWindow(uint256 id,uint64) external view returns(bool,uint256){
        MarketBinding memory market=markets[id];if(block.chainid!=10143||ledger.indexOf(id)!=0||market.arena==address(0))return(false,0);
        (bool live,address at,uint256 epoch)=_live(id);uint256 version=uint256(keccak256(abi.encode(uint256(10143),market.arena,market.epoch,id,rulesVersion)));
        return(live&&at==market.arena&&epoch==market.epoch,version);
    }
    function result(uint256 id) external view returns(address a,address b,address winner,uint8 status){
        if(ledger.indexOf(id)!=0){T.Result memory r=ledger.entry(id).first;return(r.a,r.b,r.winner,r.status);}
        L.Proposal memory p=lobby.proposal(id);return(p.a,p.b,address(0),p.status==0?0:p.status==1?1:2);
    }
    function bettingCutoff(uint256 id) external view returns(uint64){return lobby.bettingCutoff(id);}
    function finalizeResult(uint256 id) external view base {
        // A keeper/browser first submits the published proof permissionlessly.
        // An absent proof never becomes a guessed result or an automatic retry
        // against whatever different match now occupies the physical slot.
        require(ledger.indexOf(id)!=0,"published result proof pending");
    }
}
