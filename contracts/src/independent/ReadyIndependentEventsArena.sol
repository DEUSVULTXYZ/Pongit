// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {IndependentEventsArena} from "./IndependentEventsArena.sol";
import {ChaosEngine} from "../chaos/ChaosEngine.sol";
import {IInterludeHub} from "../../vendor/interlude/interfaces/IInterludeHub.sol";
import {Types} from "../../vendor/interlude/interfaces/Types.sol";

/// Same rules-12 physics. Only the connected, scoped participant keys may
/// acknowledge loading the arena before its authoritative three-second start.
contract ReadyIndependentEventsArena is IndependentEventsArena {
    constructor(IInterludeHub protocol,address authority,address bridge,ChaosEngine kernel)
        IndependentEventsArena(protocol,authority,bridge,kernel) {}
    function RULES_VERSION() public pure override returns(uint256){return 13;}
    function readiness(uint256 id) external view returns(uint8 mask,uint64 deadline){
        return(uint8(_get(id,61)),uint64(_get(id,62)));
    }
    function confirmReady(uint256 id) external engine whenNotDelegated(Types.GLOBAL){
        require(id==admission.id&&admission.epoch!=0&&_phase(id)==1,"current unstarted match");
        address player=_playerActor();
        require(player==admission.a||player==admission.b,"participant only");
        uint256 deadline=_get(id,62);
        require(deadline==0||block.timestamp<=deadline,"loading deadline expired");
        uint256 mask=_get(id,61);uint256 next=mask|(player==admission.a?1:2);
        if(next!=mask){_set(id,61,next);_publish(id);}
    }
    function start() public override engine whenNotDelegated(Types.GLOBAL){
        uint256 id=admission.id;
        require(admission.epoch!=0&&_phase(id)==1,"unopened or started arena");
        if(_get(id,61)!=3){
            // Begin the loading allowance only once the actual hosted engine
            // is reachable, not while DNS/delegation provisioning is pending.
            if(_get(id,62)==0){_set(id,62,block.timestamp+30);_publish(id);}
            return;
        }
        super.start();
    }
    function cancelUnready(uint256 id) external engine whenNotDelegated(Types.GLOBAL){
        require(id==admission.id&&_phase(id)==1&&_get(id,61)!=3,"match ready or ended");
        uint256 deadline=_get(id,62);
        require(deadline!=0&&block.timestamp>deadline,"loading deadline pending");
        _finish(id,4,address(0));_publish(id);
    }
}
