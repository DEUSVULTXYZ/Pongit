// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Test} from "forge-std/Test.sol";
import {IInterludeHub} from "../vendor/interlude/interfaces/IInterludeHub.sol";
import {Types} from "../vendor/interlude/interfaces/Types.sol";
import {PublicationProbe} from "../src/labs/PublicationProbe.sol";

/// Read-only fork of the EXISTING hub state and its actual default validator.
/// No admin impersonation, new validator, changed terms or real transaction.
/// This measures admission headroom at a block, not a reserved hosted capacity.
contract HubAdmissionHeadroomForkTest is Test {
    function testExistingDefaultValidatorHeadroom() public {
        string memory rpc=vm.envOr("PONG_HUB_HEADROOM_FORK_RPC",string(""));
        if(bytes(rpc).length==0){vm.skip(true);return;}
        vm.createSelectFork(rpc);assertEq(block.chainid,10143);
        IInterludeHub hub=IInterludeHub(0x3Ef8327F69e09cf721772F345e2A887eA22cD595);
        address validator=hub.defaultValidator();Types.Terms memory terms=hub.termsOf(validator);
        require(terms.open&&terms.maxDelegations>0&&terms.maxDelegations<=64,"Bound this diagnostic to the observed small validator");
        (uint256 bond,uint256 reserved)=hub.bondOf(validator);
        emit log_named_uint("fork_block",block.number);
        emit log_named_bytes32("hub_code_hash",address(hub).codehash);
        emit log_named_address("validator",validator);
        emit log_named_uint("max_delegations",terms.maxDelegations);
        emit log_named_uint("initial_bond",bond);
        emit log_named_uint("initial_reserved",reserved);
        vm.deal(address(this),(uint256(terms.maxDelegations)+1)*terms.delegationFee);
        uint256 admitted;bytes4 failure;
        for(uint256 i;i<=terms.maxDelegations;i++){
            PublicationProbe probe=new PublicationProbe(hub);
            (bool ok,bytes memory reason)=address(probe).call{value:terms.delegationFee}(abi.encodeWithSignature("delegateAll()"));
            if(!ok){require(reason.length>=4,"Unclassified admission failure");failure=bytes4(reason);break;}
            assertEq(uint8(hub.statusOf(address(probe),0)),uint8(Types.Status.Active));admitted++;
        }
        emit log_named_uint("additional_fork_admissions",admitted);
        emit log_named_bytes32("refusal_selector",bytes32(failure));
        assertEq(failure,bytes4(keccak256("ValidatorAtCapacity()")),"Do not misclassify a different refusal as capacity");
        assertLe(admitted,terms.maxDelegations);
        (,uint256 afterReserved)=hub.bondOf(validator);
        assertEq(afterReserved,reserved+admitted*terms.stakePerDelegation);
    }
}
