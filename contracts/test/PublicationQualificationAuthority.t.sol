// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {ReusableAgentArenaTest} from "./ReusableAgentArena.t.sol";
import {PublicationQualificationAuthority} from "../src/labs/PublicationQualificationAuthority.sol";
import {ReusableAgentArena} from "../src/agents/competition/ReusableAgentArena.sol";
import {PublishedResultVerifier,IReusableAdmissionAuthority} from "../src/independent/PublishedResultVerifier.sol";
import {IInterludeHub} from "../vendor/interlude/interfaces/IInterludeHub.sol";
import {Types} from "../vendor/interlude/interfaces/Types.sol";

contract PublicationQualificationAuthorityTest is ReusableAgentArenaTest {
    function testIsolatedPublicationAuthorityCannotAdmitAndOnlyOwnerControlsItsOneArena() public {
        vm.chainId(10143);
        PublicationQualificationAuthority owner=new PublicationQualificationAuthority(IInterludeHub(address(hub)));
        PublishedResultVerifier v=new PublishedResultVerifier(IReusableAdmissionAuthority(address(owner)),IInterludeHub(address(hub)));
        ReusableAgentArena candidate=new ReusableAgentArena(IInterludeHub(address(hub)),address(owner),address(1),policies,kernel,v);
        vm.expectRevert("one owned arena");owner.bind(arena);
        vm.prank(address(999));vm.expectRevert("testnet owner");owner.bind(candidate);
        owner.bind(candidate);assertTrue(owner.registeredArena(address(candidate)));assertFalse(owner.registeredArena(address(arena)));
        vm.expectRevert("one owned arena");owner.bind(candidate);
        vm.prank(address(999));vm.expectRevert("testnet owner");owner.open();
        owner.open();assertEq(uint256(hub.statusOf(address(candidate),bytes32(0))),uint256(Types.Status.Active));
        assertEq(owner.issuedTicket(address(candidate),1,1),bytes32(0));
        vm.chainId(4242);candidate.preparePublication(1);vm.chainId(10143);
        vm.prank(address(999));vm.expectRevert("testnet owner");owner.close();
        owner.close();vm.warp(vm.getBlockTimestamp()+3601);
        vm.prank(address(999));vm.expectRevert("testnet owner");owner.release();
        owner.release();assertEq(uint256(hub.statusOf(address(candidate),bytes32(0))),uint256(Types.Status.None));
        (uint256 epoch,uint32 count,bytes32 root)=candidate.resultCommitment();
        (bytes32 sealedRoot,uint32 sealedCount)=v.finalizedRoots(address(candidate),epoch);
        assertEq(sealedRoot,root);assertEq(sealedCount,count);assertEq(count,0);
    }
}
