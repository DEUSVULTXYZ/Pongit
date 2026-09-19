// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {PongChaosEvents} from "../../chaos/PongChaosEvents.sol";
import {ChaosEngine} from "../../chaos/ChaosEngine.sol";
import {ChaosGameFlow} from "../../chaos/ChaosGameFlow.sol";
import {PhysicsV2} from "../../v2/PhysicsV2.sol";
import {AgentArenaTypes as A} from "./AgentArenaTypes.sol";
import {CompetitionTypes as T} from "./CompetitionTypes.sol";
import {HousePolicies} from "./HousePolicies.sol";
import {PoolSteer} from "./PoolSteer.sol";
import {PoolAdmission} from "./PoolAdmission.sol";
import {PoolAuthorizations} from "./PoolAuthorizations.sol";
import {ArenaAuthorizations as Auth} from "../../independent/ArenaAuthorizations.sol";
import {IInterludeHub} from "../../../vendor/interlude/interfaces/IInterludeHub.sol";
import {Types} from "../../../vendor/interlude/interfaces/Types.sol";
import {DelegatedLayout} from "../../../vendor/interlude/libraries/DelegatedLayout.sol";

/// Exactly one bound match per epoch. Admission and controllers are snapshotted
/// on Monad before delegation; the engine never reads a moving tournament table.
contract PooledAgentArena is PongChaosEvents {
    error SharedArenaAction();
    error PoolAdmissionOnly();
    error SharedAgentRanking();
    error NoAgentMarkets();
    address public immutable pool;
    HousePolicies public immutable policies;
    A.Binding private binding; // base-chain only; not part of delegated words
    constructor(IInterludeHub protocol,address authority,HousePolicies house,ChaosEngine kernel)
        PongChaosEvents(protocol,authority,address(1),authority,address(0),kernel){
        require(authority!=address(0)&&address(house).code.length>0,"arena roles");pool=authority;policies=house;
        DelegatedLayout.layout().owner=authority;
    }
    function RULES_VERSION() public pure override returns(uint256){return 10;}
    function boundMatch() external view returns(A.Binding memory){return binding;}
    function prepare(A.Binding calldata b) external {
        PoolAdmission.prepare(words,binding,b,hub,pool);
        _save(b.id,physicsRules.initial(bytes32(_get(b.id,3)),b.mode));
    }
    function openEngine() external payable {
        PoolAdmission.open(words,binding,hub,pool);
    }
    function start() external engine whenNotDelegated(Types.GLOBAL){
        _publish(PoolAdmission.start(words,binding));
    }
    function acceptMatch(Offer calldata,bytes calldata) external pure override {revert PoolAdmissionOnly();}
    function cancelMatch(uint256) external pure override {revert PoolAdmissionOnly();}
    function registerControls(bytes calldata) external pure override {revert SharedArenaAction();}
    function revokeControls(address) external pure override {revert SharedArenaAction();}
    function renewEngine() external payable override {revert SharedArenaAction();}
    function closeEngine() external override {
        PoolAdmission.close(words,binding,hub,pool);
    }
    function cancelRecovered() external {
        if(block.chainid!=10143||msg.sender!=pool)revert OperatorOnly();
        if(hub.statusOf(address(this),Types.GLOBAL)!=Types.Status.None)revert DelegationPending();
        if(_phase(binding.id)<3){_finish(binding.id,4,address(0));_publish(binding.id);}
    }
    function _playerActor() internal view override returns(address){
        return PoolAuthorizations.actor(words,binding,msg.sender);
    }
    function authorizationRevision(address player) external view returns(uint256){return PoolAuthorizations.revision(words,binding,player);}
    function revocationDigest(address player,uint64 deadline) external view returns(bytes32){return PoolAuthorizations.revokeDigest(words,binding,player,deadline);}
    function revokeActive(address player,uint64 deadline,bytes calldata signature) external engine whenNotDelegated(Types.GLOBAL){PoolAuthorizations.revoke(words,binding,player,deadline,signature);}
    function renewalDigest(Auth.Renewal calldata r) external view returns(bytes32){return PoolAuthorizations.renewalDigest(r);}
    function renewActive(Auth.Renewal calldata r,bytes calldata signature) external engine whenNotDelegated(Types.GLOBAL){
        if(_phase(binding.id)!=2)revert InvalidMatch();PoolAuthorizations.renew(words,binding,r,signature);
    }
    function _limitTarget(uint256 t) internal view override returns(uint256){uint256 end=binding.overtime?360_000_000:300_000_000;return t>end?end:t;}
    function _advanceState(uint256 id,PhysicsV2.State memory state,uint64 target,bool resume) internal override returns(bool complete){
        uint64 regulation=300_000_000;uint64 end=binding.overtime?360_000_000:regulation;
        // Reach regulation before deciding whether overtime exists. Commands
        // that arrive late cannot silently simulate past a five-minute victory.
        uint64 bounded=state.t<regulation&&target>regulation?regulation:target;
        uint64 sub;
        do{
            sub=PoolSteer.steer(words,binding,policies,chaosEngine,bounded);state=_state(id);
            complete=super._advanceState(id,state,sub,resume);
            if(_phase(id)!=2)return true;
            state=_state(id);
            if(state.t>=regulation&&(state.scoreA!=state.scoreB||state.t>=end)){
                _finish(id,3,state.scoreA==state.scoreB?address(0):state.scoreA>state.scoreB?binding.a:binding.b);return true;
            }
        }while(complete&&sub<bounded&&gasleft()>7_000_000);
        return complete&&sub>=target;
    }
    function _rate(uint256,address,address,address) internal pure override {}
    // Local rating words are never copied into the common ranking. Consumers
    // must use the pool's published-result ledger, including pending rebuilds.
    function ratingOf(address,uint8) public pure override returns(Rating memory){revert SharedAgentRanking();}
    function pressureDigest(ChaosGameFlow.LivePressure calldata) public pure override returns(bytes32){revert NoAgentMarkets();}
    function submitLivePressure(ChaosGameFlow.LivePressure calldata,bytes calldata) external pure override {revert NoAgentMarkets();}
    function publishedResult() external view returns(T.Result memory r,uint256 brainA,uint256 brainB){
        return PoolAdmission.result(words,binding,_state(binding.id));
    }
    function _isSessionBlocked(bytes4 selector) internal view override returns(bool){
        return selector==this.prepare.selector||selector==this.openEngine.selector||selector==this.cancelRecovered.selector
            ||selector==this.revokeActive.selector||selector==this.renewActive.selector||super._isSessionBlocked(selector);
    }
}
