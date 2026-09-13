// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {PongInterludeRoomsChaos as Rooms} from "../labs/PongInterludeRoomsChaos.sol";
import {RoomsControlVerifier} from "../labs/RoomsControlVerifier.sol";
import {ChaosEngine} from "./ChaosEngine.sol";
import {ChaosCodec} from "./ChaosCodec.sol";
import {ChaosGameFlow} from "./ChaosGameFlow.sol";
import {PhysicsV2} from "../v2/PhysicsV2.sol";
import {IInterludeHub} from "../../vendor/interlude/interfaces/IInterludeHub.sol";
import {Types} from "../../vendor/interlude/interfaces/Types.sol";
import {DelegatedLayout} from "../../vendor/interlude/libraries/DelegatedLayout.sol";

/// Candidate rules 6. Stateless immutable modules keep both publication state
/// and the root runtime bounded. Existing instances are never upgraded in place.
contract PongChaosEvents is Rooms {
    ChaosEngine internal immutable chaosEngine;ChaosCodec internal immutable codec;
    RoomsControlVerifier private immutable controlVerifier;
    address public immutable operator;address public immutable pressureSigner;address internal immutable previousGame;
    bytes32 private immutable pressureDomain;
    error InvalidControls();error InvalidBeaconRequest();error OperatorOnly();error DelegationPending();
    event ControlsBound(address indexed key,uint256 binding);
    event PressureQueued(uint256 indexed id,uint64 sourceBlock,bytes32 checkpoint,uint256 paidA,uint256 paidB);
    event EventRequested(uint256 indexed id,uint256 request);
    event RandomnessVerified(uint256 indexed id,uint32 indexed index,uint64 round,bytes32 randomness,uint256 draw);
    event ChaosAnnounced(uint256 indexed id,uint32 indexed index,uint256 draw,uint64 gameTime);
    event ChaosCollision(uint256 indexed id,uint256 collision);
    event ChaosPressureApplied(uint256 indexed id,uint32 rally,uint128 paidA,uint128 paidB,bytes32 checkpoint);
    constructor(IInterludeHub h,address admission,address bridge,address ops,address previous,ChaosEngine module)
        Rooms(h,admission)
    {
        require(block.chainid==10143&&bridge!=address(0)&&ops!=address(0)&&address(module).code.length>0,"testnet modules");
        operator=ops;pressureSigner=bridge;previousGame=previous;chaosEngine=module;codec=module.codec();controlVerifier=new RoomsControlVerifier();
        pressureDomain=keccak256(abi.encode(keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256("PONGIT Realtime Pressure"),keccak256("2"),block.chainid,address(this)));
    }
    function RULES_VERSION() public pure virtual override returns(uint256){return 6;}
    function controlBinding(address key) public view returns(uint256){return _get(uint160(key),20);}
    function registerControls(bytes calldata proof) external engine whenNotDelegated(Types.GLOBAL){
        ChaosGameFlow.registerControls(words,controlVerifier,proof);
    }
    function revokeControls(address key) external engine whenNotDelegated(Types.GLOBAL){
        uint256 binding=controlBinding(key);if(binding==0||msg.sender!=key&&_actor()!=address(uint160(binding)))revert InvalidControls();
        _set(uint160(key),20,uint160(binding));emit ControlsBound(key,uint160(binding));
    }
    function _playerActor() internal view override returns(address){
        if(msg.sender==address(this))return super._playerActor();uint256 binding=controlBinding(msg.sender);
        return binding==0?super._playerActor():controlVerifier.actor(binding);
    }
    function _packed(uint256 id) internal view returns(uint256[8] memory w){for(uint256 i;i<8;i++)w[i]=_get(id,21+i);}
    function _store(uint256 id,uint256[8] memory w) internal {for(uint256 i;i<8;i++)if(w[i]!=_get(id,21+i))_set(id,21+i,w[i]);}
    function _state(uint256 id) internal view override returns(PhysicsV2.State memory){
        if(matchMode(id)==0)return super._state(id);return codec.legacy(_packed(id),bytes32(_get(id,3)),_get(id,8),_phase(id)>=3);
    }
    function _save(uint256 id,PhysicsV2.State memory s) internal override {
        if(_get(id,31)==0)_set(id,31,hub.sessionOf(address(this),Types.GLOBAL).epoch);
        if(s.mode==0){super._save(id,s);return;}
        // The base calls this hook exactly once for a new Chaos proposal.
        _store(id,chaosEngine.initial(s.seed));_set(id,8,5);
    }
    function chaosState(uint256 id) external view returns(bytes memory){return ChaosGameFlow.snapshot(words,id);}
    function submitRandomness(uint256 id,uint256 expectedRequest,bytes calldata signature) external engine whenNotDelegated(Types.GLOBAL){
        // Verify before storing. Permissionless transport cannot select the round,
        // event, target, exclusion mask or next interval after seeing randomness.
        (uint256 draw,bytes32 random)=ChaosGameFlow.verifyRandomness(words,chaosEngine,hub,id,expectedRequest,signature);
        _advance(id,false);
        if(_phase(id)!=2){_publish(id);return;}
        // No pending draw existed, so advancing cannot consume/change its request.
        _set(id,30,draw);emit RandomnessVerified(id,uint32(expectedRequest>>96),uint64(expectedRequest),random,draw);_publish(id);
    }
    function _advanceState(uint256 id,PhysicsV2.State memory legacy,uint64 target,bool) internal virtual override returns(bool complete){
        if(legacy.mode==0){(legacy,complete)=physicsRules.advance(legacy,target,128);super._save(id,legacy);
            if(legacy.finished)_finish(id,3,legacy.scoreA==7?address(uint160(_get(id,0))):address(uint160(_get(id,1))));return complete;}
        uint8 outcome;uint8 winner;(complete,outcome,winner)=ChaosGameFlow.advance(words,chaosEngine,hub,id,target);
        if(outcome!=0)_finish(id,outcome,winner==0?address(0):address(uint160(_get(id,winner==1?0:1))));
    }
    function pressureDigest(ChaosGameFlow.LivePressure calldata p) public view virtual returns(bytes32){return ChaosGameFlow.pressureDigest(pressureDomain,p);}
    function submitLivePressure(ChaosGameFlow.LivePressure calldata p,bytes calldata signature) external virtual engine whenNotDelegated(Types.GLOBAL){
        if(ChaosGameFlow.checkPressure(words,hub,pressureDomain,pressureSigner,p,signature))return;
        uint256 paid=p.paidA|(uint256(p.paidB)<<128);
        if(!_advance(p.matchId,false)||_phase(p.matchId)!=2){_publish(p.matchId);return;}
        _set(p.matchId,16,p.sourceBlock);_set(p.matchId,17,paid);_set(p.matchId,18,uint256(p.checkpoint));
        emit PressureQueued(p.matchId,p.sourceBlock,p.checkpoint,p.paidA,p.paidB);_publish(p.matchId);
    }
    function queuedPressure(uint256 id) external view returns(uint256,uint256,uint64,bytes32){uint256 p=_get(id,17);return(uint128(p),uint128(p>>128),uint64(_get(id,16)),bytes32(_get(id,18)));}
    function _verifiedPressure(uint256,uint8,uint64) internal pure override returns(Pressure memory p){return p;}
    function _finish(uint256 id,uint256 phase,address winner) internal override {ChaosGameFlow.finish(words,id,phase,winner);super._finish(id,phase,winner);}
    function _rate(uint256 id,address a,address b,address winner) internal virtual override {ChaosGameFlow.rate(words,eloFormula,id,a,b,winner);}
    function _resultHash(uint256 id,bytes32 hash) internal view override returns(bytes32){return keccak256(abi.encode(hash,_get(id,19)));}
    function finishedAt(uint256 id) external view returns(uint64){return uint64(_get(id,19));}
    function gameEpoch(uint256 id) external view returns(uint256){return _get(id,31);}
    function _publish(uint256 id) internal override {
        if(matchMode(id)==0){super._publish(id);return;}
        ChaosGameFlow.publish(words,id);
    }
    function _startingRating(address player,uint8 mode) internal view override returns(Rating memory r){
        if(previousGame==address(0))return super._startingRating(player,mode);r=Rooms(previousGame).ratingOf(player,mode);r.season=currentSeason();
    }
    function closeEngine() external {if(block.chainid!=10143||msg.sender!=operator)revert OperatorOnly();if(activeCount()!=0)revert ArenaBusy();hub.closeDelegation(Types.GLOBAL);}
    function renewEngine() external payable {
        if(block.chainid!=10143||msg.sender!=operator)revert OperatorOnly();if(hub.statusOf(address(this),Types.GLOBAL)!=Types.Status.None)revert DelegationPending();
        DelegatedLayout.Layout storage l=DelegatedLayout.layout();hub.openDelegation{value:msg.value}(Types.GLOBAL,l.globalSlots,l.globalMappingBases,address(0),l.owner,l.minStake);
    }
    function _isSessionBlocked(bytes4 selector) internal view virtual override returns(bool){
        return selector==this.registerControls.selector||selector==this.closeEngine.selector||selector==this.renewEngine.selector
            ||selector==this.submitLivePressure.selector||selector==this.submitRandomness.selector||super._isSessionBlocked(selector);
    }
}
