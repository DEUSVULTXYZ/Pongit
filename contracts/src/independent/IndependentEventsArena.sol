// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {PongChaosEvents} from "../chaos/PongChaosEvents.sol";
import {ChaosEngine} from "../chaos/ChaosEngine.sol";
import {PhysicsV2} from "../v2/PhysicsV2.sol";
import {IndependentTypes as T} from "./IndependentTypes.sol";
import {ArenaAuthorizations as Auth} from "./ArenaAuthorizations.sol";
import {AgentArenaTypes as A} from "../agents/competition/AgentArenaTypes.sol";
import {PoolAdmission} from "../agents/competition/PoolAdmission.sol";
import {PoolAuthorizations} from "../agents/competition/PoolAuthorizations.sol";
import {IInterludeHub} from "../../vendor/interlude/interfaces/IInterludeHub.sol";
import {Types} from "../../vendor/interlude/interfaces/Types.sol";
import {DelegatedLayout} from "../../vendor/interlude/libraries/DelegatedLayout.sol";

/// Candidate human adapter: common lobby/ranking stay on Monad; corrected
/// Classic and all 24 Chaos effects occupy one independently delegated arena.
/// No agent controller, five-minute limit or local ELO is introduced here.
/// This requires rules-12 clients and a realtime financial adapter before use.
contract IndependentEventsArena is PongChaosEvents {
    error LobbyActionOnly();
    error SharedHumanRanking();
    address public immutable lobby;
    T.Binding private admission;
    A.Binding private controls;
    uint256 private openedEpoch;

    constructor(IInterludeHub protocol,address authority,address bridge,ChaosEngine kernel)
        PongChaosEvents(protocol,authority,bridge,authority,address(0),kernel){
        require(authority.code.length>0,"contract lobby required");lobby=authority;
        DelegatedLayout.layout().owner=authority;
    }
    function RULES_VERSION() public pure override returns(uint256){return 12;}
    function boundMatch() external view returns(T.Binding memory){return admission;}
    function prepare(T.Binding calldata next) external {
        require(next.keyA!=address(0)&&next.keyB!=address(0)&&next.keyA!=next.keyB,"distinct arcade keys");
        require(next.epoch==0&&next.expiresA>block.timestamp&&next.expiresB>block.timestamp
            &&next.expiresA<=block.timestamp+2 hours&&next.expiresB<=block.timestamp+2 hours,"current family grants");
        // A released hub may clear its public Session tuple. A cancelled,
        // unopened preparation must not consume the next epoch either.
        uint256 epoch=openedEpoch+1;
        A.Binding memory b=A.Binding(next.id,epoch,uint64(block.number),0,next.a,next.b,next.mode,next.ranked,false,
            A.Controller(0,0,0,next.keyA,next.expiresA),A.Controller(0,0,0,next.keyB,next.expiresB));
        // Checks the actual Monad caller, released hub, fresh ID and prior end.
        PoolAdmission.prepare(words,controls,b,hub,lobby);
        admission=next;admission.preparedBlock=uint64(block.number);
        _set(next.id,11,next.room);
        _save(next.id,physicsRules.initial(bytes32(_get(next.id,3)),next.mode));
    }
    function openEngine() external payable {
        require(admission.epoch==0&&admission.expiresA>block.timestamp&&admission.expiresB>block.timestamp,"unopened/current grants");
        PoolAdmission.open(words,controls,hub,lobby);admission.epoch=controls.epoch;openedEpoch=controls.epoch;
    }
    function start() external engine whenNotDelegated(Types.GLOBAL){
        require(admission.epoch!=0,"unopened arena");_publish(PoolAdmission.start(words,controls));
    }
    function closeEngine() external override {PoolAdmission.close(words,controls,hub,lobby);}
    function cancelRecovered() external {
        if(block.chainid!=10143||msg.sender!=lobby)revert LobbyActionOnly();
        if(hub.statusOf(address(this),Types.GLOBAL)!=Types.Status.None)revert DelegationPending();
        require(admission.id!=0,"no admission");
        if(_phase(admission.id)<3){_finish(admission.id,4,address(0));_publish(admission.id);}
    }
    function acceptMatch(Offer calldata,bytes calldata) external pure override {revert LobbyActionOnly();}
    function cancelMatch(uint256) external pure override {revert LobbyActionOnly();}
    function registerControls(bytes calldata) external pure override {revert LobbyActionOnly();}
    function revokeControls(address) external pure override {revert LobbyActionOnly();}
    function renewEngine() external payable override {revert LobbyActionOnly();}
    function _playerActor() internal view override returns(address){return PoolAuthorizations.actor(words,controls,msg.sender);}
    function authorizationRevision(address player) external view returns(uint256){return PoolAuthorizations.revision(words,controls,player);}
    function revocationDigest(address player,uint64 deadline) external view returns(bytes32){return PoolAuthorizations.revokeDigest(words,controls,player,deadline);}
    function revokeActive(address player,uint64 deadline,bytes calldata signature) external engine whenNotDelegated(Types.GLOBAL){PoolAuthorizations.revoke(words,controls,player,deadline,signature);}
    function renewalDigest(Auth.Renewal calldata r) external view returns(bytes32){return PoolAuthorizations.renewalDigest(r);}
    function renewActive(Auth.Renewal calldata r,bytes calldata signature) external engine whenNotDelegated(Types.GLOBAL){
        require(_phase(admission.id)==2,"match ended");PoolAuthorizations.renew(words,controls,r,signature);
    }
    function _rate(uint256,address,address,address) internal pure override {}
    function ratingOf(address,uint8) public pure override returns(Rating memory){revert SharedHumanRanking();}
    function publishedResult() external view returns(T.Result memory r){
        PhysicsV2.State memory s=_state(admission.id);uint256 meta=_get(admission.id,0);uint256 winner=meta>>166&3;
        return T.Result(address(this),admission.epoch,admission.id,admission.a,admission.b,
            winner==1?admission.a:winner==2?admission.b:address(0),admission.mode,admission.ranked,
            uint8(meta>>161&7),s.scoreA,s.scoreB,bytes32(_get(admission.id,9)));
    }
    function _isSessionBlocked(bytes4 selector) internal view override returns(bool){
        return selector==this.prepare.selector||selector==this.openEngine.selector||selector==this.cancelRecovered.selector
            ||selector==this.revokeActive.selector||selector==this.renewActive.selector||super._isSessionBlocked(selector);
    }
}
