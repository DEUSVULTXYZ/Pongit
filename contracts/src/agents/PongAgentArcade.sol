// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {PongChaosEvents} from "../chaos/PongChaosEvents.sol";
import {ChaosEngine} from "../chaos/ChaosEngine.sol";
import {ChaosGameFlow} from "../chaos/ChaosGameFlow.sol";
import {PhysicsV2} from "../v2/PhysicsV2.sol";
import {AgentIdentity} from "./AgentIdentity.sol";
import {AgentSteer} from "./AgentSteer.sol";
import {IInterludeHub} from "../../vendor/interlude/interfaces/IInterludeHub.sol";
import {Types} from "../../vendor/interlude/interfaces/Types.sol";

/// Separate immutable application. It never imports human ratings or money.
contract PongAgentArcade is PongChaosEvents {
    uint256 public constant MATCH_DURATION_US=5 minutes*1_000_000;
    error AgentAdmissionDenied();
    error FinancialPressureDisabled();
    constructor(IInterludeHub h,address admission,address ops,ChaosEngine module)
        PongChaosEvents(h,admission,address(1),ops,address(0),module) {}

    function RULES_VERSION() public pure override returns(uint256){return 7;}
    function registrationDigest(AgentIdentity.Registration calldata r) external view returns(bytes32){return AgentIdentity.digest(r);}
    function registerAgent(AgentIdentity.Registration calldata r,bytes calldata creatorProof,bytes calldata agentProof)
        external engine whenNotDelegated(Types.GLOBAL) {AgentIdentity.register(words,r,creatorProof,agentProof);}
    function qualifyAgent(address agent,uint8 mode,bool passed,bytes32 evidence) external engine whenNotDelegated(Types.GLOBAL){
        if(msg.sender!=coordinator)revert AgentAdmissionDenied();AgentIdentity.qualify(words,agent,mode,passed,evidence);
    }
    function agentIdentity(address agent) public view returns(address creator,uint8 modes,uint8 qualified,bytes32 metadata){
        uint256 value=_get(uint160(agent),40);
        return(address(uint160(value)),uint8(value>>160),uint8(value>>168),bytes32(_get(uint160(agent),41)));
    }
    function agentCount() external view returns(uint256){return _get(0,42);}
    function agentAt(uint256 index) external view returns(address){if(index>=_get(0,42))revert AgentAdmissionDenied();return address(uint160(_get(index,43)));}
    function acceptance(uint256 id) external view returns(uint8){return uint8(_get(id,0)>>164&3);}
    function acceptMatch(Offer calldata o,bytes calldata signature) external override engine whenNotDelegated(Types.GLOBAL){
        bool fresh=AgentIdentity.accept(words,o,signature,ticketDigest(o),coordinator,_playerActor());
        if(fresh)_save(o.id,physicsRules.initial(bytes32(_get(o.id,3)),o.mode));
        _publish(o.id);
    }
    function _limitTarget(uint256 target) internal pure override returns(uint256){return target>MATCH_DURATION_US?MATCH_DURATION_US:target;}
    function _advanceState(uint256 id,PhysicsV2.State memory legacy,uint64 target,bool mayResume) internal override returns(bool complete){
        uint64 sub;
        do{legacy=_state(id);sub=AgentSteer.steer(words,id,legacy.mode,target);complete=super._advanceState(id,legacy,sub,mayResume);}
        while(!complete&&sub<target);
        // Bounded catch-up must reach the deadline before evaluating the score.
        // A late call cannot simulate beyond it or cancel a legitimate 5-minute result.
        if(_phase(id)==2){
            uint256 elapsed=legacy.mode==0?_get(id,7)>>128:uint64(_get(id,27)>>112);
            if(elapsed>=MATCH_DURATION_US){
            uint256 scores=_get(id,legacy.mode==0?8:28);
            uint256 a=legacy.mode==0?(scores>>4)&15:scores&7;
            uint256 b=legacy.mode==0?(scores>>8)&15:(scores>>3)&7;
            address winner=a==b?address(0):address(uint160(_get(id,a>b?0:1)));
            _finish(id,3,winner);return true;
        }}
    }
    function _rate(uint256 id,address a,address b,address winner) internal override {
        // Draws change neither ELO, placements nor the repeated-opponent counter.
        AgentIdentity.rate(words,eloFormula,id,a,b,winner);
    }
    function submitLivePressure(ChaosGameFlow.LivePressure calldata,bytes calldata) external pure override {revert FinancialPressureDisabled();}
    function pressureDigest(ChaosGameFlow.LivePressure calldata) public pure override returns(bytes32){revert FinancialPressureDisabled();}
    function _isSessionBlocked(bytes4 selector) internal view override returns(bool){
        return selector==this.registerAgent.selector||selector==this.qualifyAgent.selector||super._isSessionBlocked(selector);
    }
}
