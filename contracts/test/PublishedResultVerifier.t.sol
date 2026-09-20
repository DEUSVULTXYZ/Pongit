// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Test} from "forge-std/Test.sol";
import {PublishedResultVerifier, IReusableAdmissionAuthority, IReusableResultRoot} from "../src/independent/PublishedResultVerifier.sol";
import {ReusableAdmission as A} from "../src/independent/ReusableAdmission.sol";
import {PublishedResultTree as Tree} from "../src/agents/competition/PublishedResultTree.sol";
import {IInterludeHub} from "../vendor/interlude/interfaces/IInterludeHub.sol";
import {Types} from "../vendor/interlude/interfaces/Types.sol";

contract RootAuthorityFixture is IReusableAdmissionAuthority {
    mapping(address=>bool) public registeredArena;
    mapping(address=>mapping(uint256=>mapping(uint256=>bytes32))) public issuedTicket;
    function register(address arena) external {registeredArena[arena]=true;}
    function issue(A.Ticket calldata t) external {issuedTicket[t.arena][t.epoch][t.sequence]=A.digest(t);}
}
contract RootFixture is IReusableResultRoot {
    uint256 epoch; uint32 count; bytes32 root;
    function set(uint256 e,uint32 n,bytes32 r) external {epoch=e;count=n;root=r;}
    function resultCommitment() external view returns(uint256,uint32,bytes32){return(epoch,count,root);}
}
contract RootHubFixture {
    Types.Session private session;
    function set(Types.Status s,uint64 e,uint64 batch) external {session.status=s;session.epoch=e;session.batchIndex=batch;}
    function sessionOf(address,bytes32) external view returns(Types.Session memory){return session;}
    function statusOf(address,bytes32) external view returns(Types.Status){return session.status;}
}
contract PublishedResultVerifierTest is Test {
    RootAuthorityFixture authority;RootFixture arena;RootHubFixture hub;PublishedResultVerifier verifier;
    bytes32 constant RESULT=keccak256("canonical participants/score/rules/cutoff");
    function setUp() public {
        vm.chainId(10143);authority=new RootAuthorityFixture();arena=new RootFixture();hub=new RootHubFixture();
        authority.register(address(arena));verifier=new PublishedResultVerifier(authority,IInterludeHub(address(hub)));
        hub.set(Types.Status.Active,7,1);
    }
    function ticket(uint256 id,uint256 seq) internal view returns(A.Ticket memory){
        return A.Ticket(address(authority),address(arena),7,seq,id,keccak256("binding"),100,190,99,keccak256("block"),14);
    }
    function leaf(A.Ticket memory t,bytes32 result) internal pure returns(bytes32){
        return Tree.resultLeaf(10143,t.arena,t.epoch,t.matchId,keccak256(abi.encode(A.digest(t),result)));
    }
    function single(A.Ticket memory t) internal returns(bytes32[16] memory proof){
        bytes32[16] memory frontier;(bytes32 root,,)=Tree.append(frontier,0,leaf(t,RESULT));arena.set(7,1,root);
        bytes32 zero;for(uint256 i;i<16;i++){proof[i]=zero;zero=keccak256(abi.encode(zero,zero));}
    }
    function testFalseBridgeAdmissionCannotBecomePublishedResult() public {
        A.Ticket memory t=ticket(1,1);bytes32[16] memory proof=single(t);
        // Even a real published root containing a fictitious admission is not
        // sufficient. The bridge is deliberately absent from this consumer.
        vm.expectRevert("ticket not issued by Monad");verifier.verify(t,RESULT,0,proof);
        authority.issue(t);assertFalse(verifier.verify(t,RESULT,0,proof));
        t.bindingHash=keccak256("different players");vm.expectRevert("ticket not issued by Monad");verifier.verify(t,RESULT,0,proof);
    }
    function testHistoricalProofAfterSlotReuseAndFinalizedEpochRenewal() public {
        A.Ticket memory first=ticket(123,1);A.Ticket memory second=ticket(456,2);authority.issue(first);authority.issue(second);
        bytes32[16] memory frontier;(,uint8 changed,bytes32 branch)=Tree.append(frontier,0,leaf(first,RESULT));frontier[changed]=branch;
        (bytes32 root,,)=Tree.append(frontier,1,leaf(second,RESULT));arena.set(7,2,root);
        bytes32[16] memory proof;proof[0]=leaf(second,RESULT);bytes32 zero=keccak256(abi.encode(bytes32(0),bytes32(0)));
        for(uint256 i=1;i<16;i++){proof[i]=zero;zero=keccak256(abi.encode(zero,zero));}
        assertFalse(verifier.verify(first,RESULT,0,proof));
        vm.expectRevert("epoch not released");verifier.sealReleased(address(arena));
        hub.set(Types.Status.None,0,0);verifier.sealReleased(address(arena));verifier.sealReleased(address(arena));
        arena.set(8,0,keccak256("new epoch"));hub.set(Types.Status.Active,8,1);
        assertTrue(verifier.verify(first,RESULT,0,proof));
    }
    function testChallengeUnpublishedForeignChainAndTamperedResultFail() public {
        A.Ticket memory t=ticket(1,1);authority.issue(t);bytes32[16] memory proof=single(t);
        hub.set(Types.Status.Active,7,0);vm.expectRevert("result not published");verifier.verify(t,RESULT,0,proof);
        hub.set(Types.Status.Challenged,7,1);vm.expectRevert("result under review");verifier.verify(t,RESULT,0,proof);
        hub.set(Types.Status.Active,8,1);vm.expectRevert("result not published");verifier.verify(t,RESULT,0,proof);
        hub.set(Types.Status.Active,7,1);vm.expectRevert("result proof");verifier.verify(t,keccak256("wrong score"),0,proof);
        vm.expectRevert("result binding");verifier.verify(t,RESULT,1,proof);
        vm.chainId(4242);vm.expectRevert("registered Monad arena");verifier.verify(t,RESULT,0,proof);
    }
    function testPublishedCorrectionInvalidatesPreviousUnfinalizedProof() public {
        A.Ticket memory t=ticket(1,1);authority.issue(t);bytes32[16] memory proof=single(t);
        assertFalse(verifier.verify(t,RESULT,0,proof));arena.set(7,1,keccak256("corrected root"));
        vm.expectRevert("result proof");verifier.verify(t,RESULT,0,proof);
    }
    function testUnregisteredArenaCannotSupplyRoot() public {
        RootFixture fake=new RootFixture();fake.set(7,1,keccak256("fake"));
        vm.expectRevert("registered Monad arena");verifier.currentRoot(address(fake),7);
        vm.expectRevert("registered Monad arena");verifier.sealReleased(address(fake));
    }
}
