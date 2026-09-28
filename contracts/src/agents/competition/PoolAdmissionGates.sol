// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {IInterludeHub} from "../../../vendor/interlude/interfaces/IInterludeHub.sol";
import {Types} from "../../../vendor/interlude/interfaces/Types.sol";

library PoolAdmissionGates {
    struct State {address operator;address maintenance;mapping(address=>mapping(uint256=>bool)) enabled;}
    error AdmissionSetup();error AdmissionUnauthorized();error AdmissionBatchBounds();
    error AdmissionArenaOrReason();error AdmissionEpoch();
    event ArenaAdmissionChanged(address indexed arena,uint256 indexed epoch,bool enabled,bytes32 reason);
    function configure(State storage state,address owner,bool sealed_,address operator,address maintenance) external {
        if(msg.sender!=owner||sealed_||state.operator!=address(0)||operator==address(0)||maintenance==address(0))revert AdmissionSetup();
        state.operator=operator;state.maintenance=maintenance;
    }
    function set(State storage state,mapping(address=>bool) storage registered,IInterludeHub hub,address owner,
        address app,uint256 epoch,bool enabled,bytes32 reason) external {
        if(msg.sender!=owner&&msg.sender!=state.operator)revert AdmissionUnauthorized();
        _set(state,registered,hub,app,epoch,enabled,reason);
    }
    function setMany(State storage state,mapping(address=>bool) storage registered,IInterludeHub hub,address owner,
        address[] calldata apps,uint256[] calldata epochs,bool[] calldata enabled,bytes32 reason) external {
        if(msg.sender!=owner&&msg.sender!=state.operator)revert AdmissionUnauthorized();
        if(apps.length==0||apps.length>32||apps.length!=epochs.length||apps.length!=enabled.length)revert AdmissionBatchBounds();
        for(uint256 i;i<apps.length;i++)_set(state,registered,hub,apps[i],epochs[i],enabled[i],reason);
    }
    function _set(State storage state,mapping(address=>bool) storage registered,IInterludeHub hub,address app,uint256 epoch,bool enabled,bytes32 reason) private {
        if(!registered[app]||reason==0)revert AdmissionArenaOrReason();
        Types.Session memory session=hub.sessionOf(app,Types.GLOBAL);
        if(session.epoch!=epoch||session.status!=Types.Status.Active)revert AdmissionEpoch();
        if(state.enabled[app][epoch]==enabled)return;
        state.enabled[app][epoch]=enabled;emit ArenaAdmissionChanged(app,epoch,enabled,reason);
    }
}
