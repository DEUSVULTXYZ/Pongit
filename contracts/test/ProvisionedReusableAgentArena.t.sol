// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {ReusableAgentArenaTest} from "./ReusableAgentArena.t.sol";
import {ProvisionedReusableAgentArena} from "../src/labs/ProvisionedReusableAgentArena.sol";
import {ProvisionedSynchronizedAgentArena} from "../src/labs/ProvisionedSynchronizedAgentArena.sol";
import {PublicationQualificationAuthority} from "../src/labs/PublicationQualificationAuthority.sol";
import {PublishedResultVerifier,IReusableAdmissionAuthority} from "../src/independent/PublishedResultVerifier.sol";
import {IInterludeHub} from "../vendor/interlude/interfaces/IInterludeHub.sol";
import {Delegatable} from "../vendor/interlude/Delegatable.sol";
import {Types} from "../vendor/interlude/interfaces/Types.sol";

contract ProvisionedReusableAgentArenaTest is ReusableAgentArenaTest {
    function testSynchronizedProvisioningBudgetAndPayableOpenKeepAuthority() public {
        vm.chainId(10143);
        address provisioner=vm.addr(678);
        ProvisionedSynchronizedAgentArena candidate=new ProvisionedSynchronizedAgentArena(IInterludeHub(address(hub)),address(this),address(1),policies,kernel,verifier,provisioner);
        assertLe(address(candidate).code.length,24_576,"synchronized hosted runtime budget");
        assertEq(candidate.RULES_VERSION(),16);assertEq(candidate.owner(),provisioner);
        vm.prank(provisioner);vm.expectRevert("released authority only");candidate.openEngine();
        uint256 beforeBalance=address(hub).balance;vm.deal(address(this),1 ether);
        candidate.openEngine{value:1 ether}();
        assertEq(address(hub).balance,beforeBalance+1 ether,"opening bond reaches hub through linked module");
        assertEq(address(candidate).balance,0);
        vm.prank(provisioner);vm.expectRevert("authority only");candidate.closeEngine();
        vm.chainId(4242);vm.prank(provisioner);vm.expectRevert();candidate.heartbeat(1,1);
    }
    function testProvisionConsentDoesNotGrantDelegationOrGameAuthority() public {
        vm.chainId(10143);
        address provisioner=vm.addr(678);
        PublicationQualificationAuthority authority=new PublicationQualificationAuthority(IInterludeHub(address(hub)));
        PublishedResultVerifier v=new PublishedResultVerifier(IReusableAdmissionAuthority(address(authority)),IInterludeHub(address(hub)));
        ProvisionedReusableAgentArena candidate=new ProvisionedReusableAgentArena(IInterludeHub(address(hub)),address(authority),address(1),policies,kernel,v,provisioner);
        assertLe(address(candidate).code.length,24_576,"hosted runtime budget");
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
