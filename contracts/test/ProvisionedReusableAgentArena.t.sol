// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {ReusableAgentArenaTest} from "./ReusableAgentArena.t.sol";
import {ProvisionedReusableAgentArena} from "../src/labs/ProvisionedReusableAgentArena.sol";
import {PublicationQualificationAuthority} from "../src/labs/PublicationQualificationAuthority.sol";
import {PublishedResultVerifier,IReusableAdmissionAuthority} from "../src/independent/PublishedResultVerifier.sol";
import {IInterludeHub} from "../vendor/interlude/interfaces/IInterludeHub.sol";
import {Delegatable} from "../vendor/interlude/Delegatable.sol";
import {Types} from "../vendor/interlude/interfaces/Types.sol";

contract ProvisionedReusableAgentArenaTest is ReusableAgentArenaTest {
    function testProvisionConsentDoesNotGrantDelegationOrGameAuthority() public {
        vm.chainId(10143);
        address provisioner=vm.addr(678);
        PublicationQualificationAuthority authority=new PublicationQualificationAuthority(IInterludeHub(address(hub)));
        PublishedResultVerifier v=new PublishedResultVerifier(IReusableAdmissionAuthority(address(authority)),IInterludeHub(address(hub)));
        ProvisionedReusableAgentArena candidate=new ProvisionedReusableAgentArena(IInterludeHub(address(hub)),address(authority),address(1),policies,kernel,v,provisioner);
        assertEq(candidate.owner(),provisioner);assertEq(candidate.pool(),address(authority));
        assertEq(arena.owner(),address(this),"historical getter is unchanged");
        bytes[] memory forbidden=new bytes[](6);
        forbidden[0]=abi.encodeWithSignature("delegateAll()");
        forbidden[1]=abi.encodeWithSignature("delegateKey(bytes32)",bytes32(0));
        forbidden[2]=abi.encodeWithSignature("delegateAllTo(address)",address(7));
        forbidden[3]=abi.encodeWithSignature("delegateKeyTo(bytes32,address)",bytes32(0),address(7));
        forbidden[4]=abi.encodeWithSignature("undelegate(bytes32)",bytes32(0));
        forbidden[5]=abi.encodeWithSignature("delegateRaw(bytes32,bytes32[],bytes32[],address)",bytes32(0),new bytes32[](0),new bytes32[](0),address(7));
        for(uint i;i<forbidden.length;i++){
            vm.prank(provisioner);(bool ok,bytes memory reason)=address(candidate).call(forbidden[i]);
            assertFalse(ok);assertEq(reason,abi.encodeWithSelector(Delegatable.OnlyOwner.selector));
        }
        vm.prank(provisioner);vm.expectRevert("released authority only");candidate.openEngine();
        authority.bind(candidate);authority.open();
        vm.prank(provisioner);vm.expectRevert("authority only");candidate.closeEngine();
        vm.chainId(4242);candidate.preparePublication(1);
        assertEq(candidate.publicationCheckpoint(),1);(uint256 e,uint32 n,)=candidate.resultCommitment();assertEq(e,1);assertEq(n,0);
        vm.chainId(10143);authority.close();vm.warp(vm.getBlockTimestamp()+3601);authority.release();
        assertEq(uint256(hub.statusOf(address(candidate),bytes32(0))),uint256(Types.Status.None));
    }
}
