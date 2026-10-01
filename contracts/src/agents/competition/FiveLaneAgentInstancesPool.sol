// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {BalancedAgentInstancesPool} from "./BalancedAgentInstancesPool.sol";
import {AgentCatalog} from "./AgentCatalog.sol";
import {IInterludeHub} from "../../../vendor/interlude/interfaces/IInterludeHub.sol";
import {PoolAdmissionGates} from "./PoolAdmissionGates.sol";

/// New immutable authority: tournament lane 0 and friendly/qualification lanes
/// 1..4. Operational admission gates cannot edit an assignment or its result.
contract FiveLaneAgentInstancesPool is BalancedAgentInstancesPool {
    error AdmissionSetup();
    error AdmissionUnauthorized();
    error AdmissionBatchBounds();
    error AdmissionArenaOrReason();
    error AdmissionEpoch();
    error AdmissionCapacity();
    PoolAdmissionGates.State private admissionState;
    event ArenaAdmissionChanged(address indexed arena,uint256 indexed epoch,bool enabled,bytes32 reason);
    constructor(AgentCatalog c,IInterludeHub h,address admin,address bridge)
        BalancedAgentInstancesPool(c,h,admin,bridge){}
    function AUTHORITY_VERSION() public pure override returns(uint256){return 3;}
    function laneCount() public pure override returns(uint8){return 5;}
    function admissionOperator() external view returns(address){return admissionState.operator;}
    function maintenanceOperator() external view returns(address){return admissionState.maintenance;}
    function arenaAdmissionEnabled(address app,uint256 epoch) external view returns(bool){return admissionState.enabled[app][epoch];}
    function configureOperators(address operator,address maintenance) external base {
        PoolAdmissionGates.configure(admissionState,owner,setupSealed,operator,maintenance);
    }
    function setArenaAdmission(address app,uint256 epoch,bool enabled,bytes32 reason) external base {
        PoolAdmissionGates.set(admissionState,registered,hub,owner,app,epoch,enabled,reason);
    }
    function setArenaAdmissions(address[] calldata apps,uint256[] calldata epochs,bool[] calldata enabled,bytes32 reason) external base {
        PoolAdmissionGates.setMany(admissionState,registered,hub,owner,apps,epochs,enabled,reason);
    }
    function _admissionAllowed(address app,uint256 epoch) internal view virtual override returns(bool){return admissionState.enabled[app][epoch];}
    function _admissionCaller() internal view override returns(bool){return msg.sender==owner||msg.sender==admissionState.operator;}
    function _maintenanceCaller() internal view override returns(bool){return msg.sender==owner||msg.sender==admissionState.maintenance;}
    function seal() public override {
        if(arenas.length<5||admissionState.operator==address(0)||admissionState.maintenance==address(0))revert AdmissionCapacity();
        super.seal();
    }
}
