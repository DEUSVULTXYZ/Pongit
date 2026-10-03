// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {MigratingAgentCatalogTest} from "./MigratingAgentCatalog.t.sol";
import {AgentChallenges} from "../src/agents/competition/AgentChallenges.sol";
import {ContinuingAgentChallenges} from "../src/agents/competition/ContinuingAgentChallenges.sol";
import {ArcadeFamily} from "../src/independent/ArcadeFamily.sol";

contract ContinuingAgentChallengesTest is MigratingAgentCatalogTest {
    ArcadeFamily family;
    AgentChallenges sourceQueue;
    ContinuingAgentChallenges queue;
    uint256 constant PLAYER=50001;
    uint256 constant KEY=50002;

    function setUp() public override {
        super.setUp();family=new ArcadeFamily();sourceQueue=new AgentChallenges(family,old,address(pool),address(this));
        pool.setQueues(address(sourceQueue),address(0));sourceQueue.setAdmissions(true);_grant(PLAYER,KEY);
    }
    function _grant(uint256 player,uint256 key) private {
        ArcadeFamily.Grant memory g=ArcadeFamily.Grant(vm.addr(player),vm.addr(key),uint64(block.timestamp),uint64(block.timestamp+7200),0);
        (uint8 v,bytes32 r,bytes32 s)=vm.sign(player,family.grantDigest(g));family.register(g,abi.encodePacked(r,s,v));
    }
    function _command(AgentChallenges q,uint256 player,uint256 key,uint8 action,uint256 id) private returns(uint256){
        bytes32 grant=family.grantDigest(family.grantOf(vm.addr(player)));uint256 nonce=q.nonces(grant);
        uint64 deadline=uint64(block.timestamp+300);address agent=old.house(0);
        (uint8 v,bytes32 r,bytes32 s)=vm.sign(key,q.digest(grant,action,agent,0,id,nonce,deadline));
        return q.command(vm.addr(player),action,agent,0,id,nonce,deadline,abi.encodePacked(r,s,v));
    }
    function _startQueue() private {
        sourceQueue.setAdmissions(false);_import();
        queue=new ContinuingAgentChallenges(sourceQueue,address(sourceQueue).codehash,next,address(this),address(this));queue.startImport();
    }
    function _sealQueue() private {_startQueue();while(queue.imported()<queue.inheritedCount())queue.importPage(32);queue.sealContinuation();queue.setAdmissions(true);}
    function testCompletedHistoryCannotDelayNextChallenge() public {
        for(uint256 i;i<96;i++){
            uint256 id=_command(sourceQueue,PLAYER,KEY,1,0);
            if(i%2==0)_command(sourceQueue,PLAYER,KEY,2,id);
            else{
                vm.prank(address(pool));(uint256 taken,,)=sourceQueue.takeNext();
                // The baseline may need historical scans while preparing its history.
                while(taken==0){vm.prank(address(pool));(taken,,)=sourceQueue.takeNext();}
                vm.prank(address(pool));sourceQueue.completed(taken);
            }
        }
        uint256 newest=_command(sourceQueue,PLAYER,KEY,1,0);
        vm.prank(address(pool));(uint256 nextId,,)=sourceQueue.takeNext();
        assertEq(nextId,newest,"one scan must reach the only pending challenge");
    }
    function testImportedCancelledHistoryCannotDelayOnlyWaitingChallenge() public {
        for(uint256 i;i<96;i++){
            uint256 id=_command(sourceQueue,PLAYER,KEY,1,0);_command(sourceQueue,PLAYER,KEY,2,id);
        }
        uint256 newest=_command(sourceQueue,PLAYER,KEY,1,0);_sealQueue();
        assertEq(queue.cursor(),sourceQueue.cursor(),"import retains its historical cursor");
        (uint256 nextId,,)=queue.takeNext();assertEq(nextId,newest,"history must not hide imported pending request");
        assertTrue(queue.qualificationsMayStart());
    }
    function testBoundedWaitingScanAndImportedCursorSurviveBusyAgents() public {
        for(uint256 i;i<40;i++){
            if(i>0)_grant(PLAYER+i,KEY+i);
            _command(sourceQueue,PLAYER+i,KEY+i,1,0);
        }
        address agent=old.house(0);bytes32 token=keccak256("waiting scan");
        vm.prank(address(pool));old.reserve(agent,0,token);
        vm.prank(address(pool));(uint256 taken,,)=sourceQueue.takeNext();assertEq(taken,0);
        assertEq(sourceQueue.cursor(),33);assertFalse(sourceQueue.qualificationsMayStart());
        vm.prank(address(pool));sourceQueue.takeNext();assertTrue(sourceQueue.qualificationsMayStart());
        // An availability revision invalidates the completed scan immediately.
        vm.prank(address(pool));old.release(agent,token);assertFalse(sourceQueue.qualificationsMayStart());
        uint256 expected=sourceQueue.cursor();_sealQueue();
        (taken,,)=queue.takeNext();assertEq(taken,expected,"continuation must keep scan order");
        queue.completed(taken);
        // Removing the ring head/tail/current through another old tab must not
        // duplicate a match or erase an adjacent waiting player.
        _command(sourceQueue,PLAYER,KEY,2,1);_command(sourceQueue,PLAYER+39,KEY+39,2,40);
        bool[41] memory seen;seen[taken]=true;
        for(uint256 i;i<37;i++){
            (taken,,)=queue.takeNext();assertTrue(taken>1&&taken<40);assertFalse(seen[taken]);seen[taken]=true;queue.completed(taken);
        }
        (taken,,)=queue.takeNext();assertEq(taken,0);assertTrue(queue.qualificationsMayStart());
    }
    function testFuzzCancelledWaitingLinksKeepOtherRequests(uint64 cancelled,uint8 length) public {
        uint256 size=bound(length,1,48);
        for(uint256 i;i<size;i++){
            if(i>0)_grant(PLAYER+i,KEY+i);_command(sourceQueue,PLAYER+i,KEY+i,1,0);
        }
        for(uint256 i;i<size;i++)if((uint256(cancelled)>>i)&1!=0)_command(sourceQueue,PLAYER+i,KEY+i,2,i+1);
        _sealQueue();
        for(uint256 i;i<size;i++)if((uint256(cancelled)>>i)&1==0){
            (uint256 taken,,)=queue.takeNext();assertEq(taken,i+1);queue.completed(taken);
        }
        (uint256 last,,)=queue.takeNext();assertEq(last,0);assertTrue(queue.qualificationsMayStart());
    }
    function createNewRequest() external {_command(queue,PLAYER,KEY,1,0);}
    function testWaitingRequestAndFamilySurviveWithoutResigningOrResettingOrder() public {
        uint256 id=_command(sourceQueue,PLAYER,KEY,1,0);bytes32 grant=family.grantDigest(family.grantOf(vm.addr(PLAYER)));
        _sealQueue();assertEq(address(queue.family()),address(family));assertEq(queue.count(),id);
        assertEq(queue.pending(vm.addr(PLAYER)),id);assertEq(queue.nonces(grant),sourceQueue.nonces(grant));
        (uint256 taken,AgentChallenges.Request memory r,ArcadeFamily.Grant memory g)=queue.takeNext();
        assertEq(taken,id);assertEq(r.player,vm.addr(PLAYER));assertEq(r.agent,old.house(0));assertEq(r.grant,grant);
        assertEq(g.key,vm.addr(KEY));assertTrue(queue.authorized(id));queue.completed(id);
        assertEq(queue.pending(vm.addr(PLAYER)),0);assertEq(_command(queue,PLAYER,KEY,1,0),id+1);
    }
    function testOldTabCancellationAfterImportCannotStartAnUnwantedDuel() public {
        uint256 id=_command(sourceQueue,PLAYER,KEY,1,0);_sealQueue();_command(sourceQueue,PLAYER,KEY,2,id);
        (uint256 taken,,)=queue.takeNext();assertEq(taken,0);assertEq(queue.pending(vm.addr(PLAYER)),0);
        (,,,uint8 status,,)=queue.requests(id);assertEq(status,3);
        assertEq(_command(queue,PLAYER,KEY,1,0),id+1);
    }
    function testOldCancellationDoesNotConcedeAlreadyAdmittedNewDuel() public {
        uint256 id=_command(sourceQueue,PLAYER,KEY,1,0);_sealQueue();queue.takeNext();
        _command(sourceQueue,PLAYER,KEY,2,id);queue.synchronizeWaiting(id);
        assertTrue(queue.authorized(id));assertEq(queue.pending(vm.addr(PLAYER)),id);
        vm.expectRevert("challenge unavailable");this.createNewRequest();
    }
    function testCancelFromOldTabThenCreateFromNewDoesNotNeedManualQueueRepair() public {
        uint256 id=_command(sourceQueue,PLAYER,KEY,1,0);_sealQueue();_command(sourceQueue,PLAYER,KEY,2,id);
        assertEq(_command(queue,PLAYER,KEY,1,0),id+1);assertEq(queue.pending(vm.addr(PLAYER)),id+1);
    }
    function testExpiredPreservedGrantCannotStartAndRenewalDoesNotRetargetOldRequest() public {
        uint256 id=_command(sourceQueue,PLAYER,KEY,1,0);_sealQueue();vm.warp(block.timestamp+7201);
        (uint256 taken,,)=queue.takeNext();assertEq(taken,0);queue.expire(id);
        _grant(PLAYER,KEY);assertEq(_command(queue,PLAYER,KEY,1,0),id+1);
    }
    function testPartialImportAndAllOpenSourceGatesAreRejected() public {
        _command(sourceQueue,PLAYER,KEY,1,0);_startQueue();
        vm.expectRevert("queue continuation not sealed");queue.setAdmissions(true);
        vm.expectRevert("incomplete queue import");queue.sealContinuation();
        sourceQueue.setAdmissions(true);vm.expectRevert("source queue open");queue.importPage(32);sourceQueue.setAdmissions(false);
        pool.gates(true,false);vm.expectRevert("source queue open");queue.importPage(32);pool.gates(false,true);
        vm.expectRevert("source queue open");queue.importPage(32);pool.gates(false,false);
        queue.importPage(32);queue.sealContinuation();assertTrue(queue.continuationSealed());
        vm.expectRevert("import setup only");queue.startImport();
    }
    function testSourceActiveDuelMustCompleteBeforeImport() public {
        _command(sourceQueue,PLAYER,KEY,1,0);vm.prank(address(pool));sourceQueue.takeNext();_startQueue();
        vm.expectRevert("source duel still active");queue.importPage(32);assertEq(queue.imported(),0);
    }
    function testCancelledAndCompletedHistoryNeverBecomesPending() public {
        uint256 id=_command(sourceQueue,PLAYER,KEY,1,0);_command(sourceQueue,PLAYER,KEY,2,id);
        uint256 second=_command(sourceQueue,PLAYER,KEY,1,0);vm.prank(address(pool));sourceQueue.takeNext();
        vm.prank(address(pool));sourceQueue.completed(second);_sealQueue();
        assertEq(queue.count(),2);assertEq(queue.pending(vm.addr(PLAYER)),0);(uint256 taken,,)=queue.takeNext();assertEq(taken,0);
    }
    function testOldCommandSignatureCannotReplayInNewQueue() public {
        _sealQueue();bytes32 grant=family.grantDigest(family.grantOf(vm.addr(PLAYER)));uint64 until=uint64(block.timestamp+300);
        (uint8 v,bytes32 r,bytes32 s)=vm.sign(KEY,sourceQueue.digest(grant,1,old.house(0),0,0,0,until));
        assertNotEq(queue.digest(grant,1,old.house(0),0,0,0,until),sourceQueue.digest(grant,1,old.house(0),0,0,0,until));
        address agent=old.house(0);address player=vm.addr(PLAYER);
        vm.expectRevert("arcade signature");queue.command(player,1,agent,0,0,0,until,abi.encodePacked(r,s,v));
    }
    function testQueueOwnerCodeAndBindingCannotBeSubstituted() public {
        _import();vm.expectRevert("source queue code");
        new ContinuingAgentChallenges(sourceQueue,bytes32(uint256(1)),next,address(this),address(this));
        vm.expectRevert("source queue binding");
        new ContinuingAgentChallenges(sourceQueue,address(sourceQueue).codehash,next,address(this),address(123));
        sourceQueue.setAdmissions(false);queue=new ContinuingAgentChallenges(sourceQueue,address(sourceQueue).codehash,next,address(this),address(this));
        vm.prank(address(123));vm.expectRevert("import setup only");queue.startImport();queue.startImport();
        vm.etch(address(sourceQueue),hex"00");vm.expectRevert("source queue code");queue.importPage(32);
    }
    function testNewSourceRequestBetweenPagesInvalidatesCandidate() public {
        _command(sourceQueue,PLAYER,KEY,1,0);_startQueue();queue.importPage(1);
        _grant(PLAYER+1,KEY+1);sourceQueue.setAdmissions(true);_command(sourceQueue,PLAYER+1,KEY+1,1,0);sourceQueue.setAdmissions(false);
        vm.expectRevert("source queue changed");queue.sealContinuation();
    }
}
