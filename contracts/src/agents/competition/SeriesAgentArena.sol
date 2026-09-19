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
import {SeriesAdmission} from "./SeriesAdmission.sol";
import {PoolAdmission} from "./PoolAdmission.sol";
import {PoolAuthorizations} from "./PoolAuthorizations.sol";
import {ArenaAuthorizations as Auth} from "../../independent/ArenaAuthorizations.sol";
import {IInterludeHub} from "../../../vendor/interlude/interfaces/IInterludeHub.sol";
import {Types} from "../../../vendor/interlude/interfaces/Types.sol";
import {DelegatedLayout} from "../../../vendor/interlude/libraries/DelegatedLayout.sol";

/// Bounded, preauthorized independent matches in one engine session.
/// Candidate transport primitive; the existing one-match pool cannot admit it.
/// Shared qualification/tournament authorities must reserve every participant
/// and capture each result separately before this can be publicly enabled.
contract SeriesAgentArena is PongChaosEvents {
    error SharedArenaAction();
    error PoolAdmissionOnly();
    error SharedAgentRanking();
    error NoAgentMarkets();
    address public immutable pool;
    HousePolicies public immutable policies;
    mapping(uint256=>A.Binding) private bindings; // immutable admission at baseBlock
    uint256[] private ids;
    bytes32 public seriesDigest;
    uint64 public immutable maximumEngineBlocks;
    // id zero is reserved: fields 60..62 are cursor, drained flag and start block.
    event SeriesPrepared(bytes32 indexed digest,uint256 epoch,uint256 matches);
    event SeriesAdvanced(uint256 indexed id,uint256 position);
    event SeriesDrained(uint256 position);
    function _binding() private view returns(A.Binding storage){require(ids.length!=0,"series not prepared");return bindings[ids[_get(0,60)]];}
    function seriesSize() external view returns(uint256){return ids.length;}
    function seriesId(uint256 position) external view returns(uint256){return ids[position];}
    function seriesPosition() external view returns(uint256){return _get(0,60);}
    function seriesDrained() external view returns(bool){return _get(0,61)==1;}
    function nextUnstarted() public view returns(uint256){
        for(uint256 i=_get(0,60)+1;i<ids.length;i++)if(_phase(ids[i])==0)return ids[i];
        return 0;
    }
    function canAdvance() public view returns(bool){
        uint256 startBlock=_get(0,62);
        return _get(0,61)==0&&_get(0,60)+1<ids.length&&startBlock!=0&&block.number>=startBlock
            &&block.number-startBlock+36_000<=maximumEngineBlocks;
    }
    constructor(IInterludeHub protocol,address authority,HousePolicies house,ChaosEngine kernel,uint64 maxBlocks)
        PongChaosEvents(protocol,authority,address(1),authority,address(0),kernel){
        require(authority!=address(0)&&address(house).code.length>0,"arena roles");pool=authority;policies=house;
        require(authority.code.length>0&&maxBlocks>=36_000&&maxBlocks<=180_000,"contract authority/bounded series");maximumEngineBlocks=maxBlocks;
        DelegatedLayout.layout().owner=authority;
    }
    function RULES_VERSION() public pure override returns(uint256){return 11;}
    function boundMatch() external view returns(A.Binding memory){if(ids.length==0){A.Binding memory empty;return empty;}return _binding();}
    function bindingFor(uint256 id) external view returns(A.Binding memory){return bindings[id];}
    function prepareSeries(A.Binding[] calldata values) external {
        seriesDigest=SeriesAdmission.prepare(bindings,ids,words,values,hub,pool);
        A.Binding storage b=_binding();SeriesAdmission.activate(words,b,seriesDigest);
        _save(b.id,physicsRules.initial(bytes32(_get(b.id,3)),b.mode));
        emit SeriesPrepared(seriesDigest,b.epoch,values.length);
    }
    function advanceSeries(uint256 expected) external engine whenNotDelegated(Types.GLOBAL){
        require(_binding().id==expected&&_phase(expected)>=3&&canAdvance(),"series cannot advance");
        _set(0,60,_get(0,60)+1);A.Binding storage b=_binding();
        SeriesAdmission.activate(words,b,seriesDigest);_save(b.id,physicsRules.initial(bytes32(_get(b.id,3)),b.mode));
        SeriesAdmission.continueMemory(words,b,bindings,ids,_get(0,60));
        _publish(PoolAdmission.start(words,b));emit SeriesAdvanced(b.id,_get(0,60));
    }
    function drainSeries(uint256 expected) external engine whenNotDelegated(Types.GLOBAL){
        require(_binding().id==expected&&_phase(expected)>=3&&!canAdvance(),"series not complete/bounded");
        _set(0,61,1);
        // At most one unstarted cancellation per call. A depleted series must
        // publish these outcomes without a many-match storage-diff burst.
        uint256 id=nextUnstarted();if(id!=0)_cancelUnstarted(id);
        emit SeriesDrained(_get(0,60));
    }
    function resultFor(uint256 id) external view returns(T.Result memory,uint256,uint256){
        require(bindings[id].id==id&&id!=0,"unknown series game");
        return PoolAdmission.result(words,bindings[id],_state(id));
    }
    function openEngine() external payable {
        A.Binding storage binding=_binding();
        PoolAdmission.open(words,binding,hub,pool);
    }
    function start() external engine whenNotDelegated(Types.GLOBAL){
        A.Binding storage binding=_binding();
        require(_get(0,62)==0,"series already started");_set(0,62,block.number);
        _publish(PoolAdmission.start(words,binding));
    }
    function acceptMatch(Offer calldata,bytes calldata) external pure override {revert PoolAdmissionOnly();}
    function cancelMatch(uint256) external pure override {revert PoolAdmissionOnly();}
    function registerControls(bytes calldata) external pure override {revert SharedArenaAction();}
    function revokeControls(address) external pure override {revert SharedArenaAction();}
    function renewEngine() external payable override {revert SharedArenaAction();}
    function closeEngine() external override {
        A.Binding storage binding=_binding();
        require(_get(0,61)==1,"published drain required");
        for(uint256 i;i<ids.length;i++)require(_phase(ids[i])>=3,"publish all series results");
        PoolAdmission.close(words,binding,hub,pool);
    }
    function cancelRecovered() external {
        A.Binding storage binding=_binding();
        if(block.chainid!=10143||msg.sender!=pool)revert OperatorOnly();
        if(hub.statusOf(address(this),Types.GLOBAL)!=Types.Status.None)revert DelegationPending();
        if(_phase(binding.id)<3){_finish(binding.id,4,address(0));_publish(binding.id);}_set(0,61,1);
    }
    function cancelUnstartedRecovered(uint256 id) external {
        require(block.chainid==10143&&msg.sender==pool&&hub.statusOf(address(this),Types.GLOBAL)==Types.Status.None,"released recovery/pool only");
        A.Binding storage b=bindings[id];require(id!=0&&b.id==id&&b.epoch==_binding().epoch,"recovered binding");
        if(_phase(id)==0)_cancelUnstarted(id);
    }
    function _cancelUnstarted(uint256 id) private {
        A.Binding storage b=bindings[id];
        SeriesAdmission.activate(words,b,seriesDigest);_save(id,physicsRules.initial(bytes32(_get(id,3)),b.mode));
        _finish(id,4,address(0));_publish(id);
    }
    function _playerActor() internal view override returns(address){
        A.Binding storage binding=_binding();
        return PoolAuthorizations.actor(words,binding,msg.sender);
    }
    function authorizationRevision(address player) external view returns(uint256){
        A.Binding storage binding=_binding();return PoolAuthorizations.revision(words,binding,player);}
    function revocationDigest(address player,uint64 deadline) external view returns(bytes32){
        A.Binding storage binding=_binding();return PoolAuthorizations.revokeDigest(words,binding,player,deadline);}
    function revokeActive(address player,uint64 deadline,bytes calldata signature) external engine whenNotDelegated(Types.GLOBAL){
        A.Binding storage binding=_binding();PoolAuthorizations.revoke(words,binding,player,deadline,signature);}
    function renewalDigest(Auth.Renewal calldata r) external view returns(bytes32){return PoolAuthorizations.renewalDigest(r);}
    function renewActive(Auth.Renewal calldata r,bytes calldata signature) external engine whenNotDelegated(Types.GLOBAL){
        A.Binding storage binding=_binding();
        if(_phase(binding.id)!=2)revert InvalidMatch();PoolAuthorizations.renew(words,binding,r,signature);
    }
    function _limitTarget(uint256 t) internal view override returns(uint256){
        A.Binding storage binding=_binding();uint256 end=binding.overtime?360_000_000:300_000_000;return t>end?end:t;}
    function _advanceState(uint256 id,PhysicsV2.State memory state,uint64 target,bool resume) internal override returns(bool complete){
        A.Binding storage binding=_binding();
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
        A.Binding storage binding=_binding();
        return PoolAdmission.result(words,binding,_state(binding.id));
    }
    function _isSessionBlocked(bytes4 selector) internal view override returns(bool){
        return selector==this.prepareSeries.selector||selector==this.openEngine.selector||selector==this.cancelRecovered.selector||selector==this.cancelUnstartedRecovered.selector
            ||selector==this.revokeActive.selector||selector==this.renewActive.selector||super._isSessionBlocked(selector);
    }
}
