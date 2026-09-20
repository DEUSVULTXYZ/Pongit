// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Test} from "forge-std/Test.sol";
import {AgentTournaments} from "../src/agents/competition/AgentTournaments.sol";
import {ReusableAgentLearning} from "../src/agents/competition/ReusableAgentLearning.sol";
import {CompetitionTypes as T} from "../src/agents/competition/CompetitionTypes.sol";

contract LearningBookFixture {
    mapping(uint64=>mapping(uint8=>AgentTournaments.Fixture)) private rounds;
    function tournament(uint64) external pure returns(AgentTournaments.Tournament memory t){t.status=AgentTournaments.Status.Playing;}
    function fixture(uint64 id,uint8 i) external view returns(AgentTournaments.Fixture memory){return rounds[id][i];}
    function set(uint64 id,uint8 i,AgentTournaments.Fixture memory f) external {rounds[id][i]=f;}
}
contract LearningReader {
    mapping(bytes32=>T.Result) private results;
    mapping(bytes32=>uint256[2]) private brains;
    function put(T.Result memory r,uint256 a,uint256 b) external {bytes32 key=T.key(r.ref);results[key]=r;brains[key]=[a,b];}
    function learned(LearningBookFixture book,uint64 id,address a) external view returns(uint256){
        return ReusableAgentLearning.latest(AgentTournaments(address(book)),results,brains,id,a);
    }
}
contract ReusableAgentLearningTest is Test {
    function testInvalidatedBranchAndCorrectionCannotSeedReplacement() public {
        LearningBookFixture book=new LearningBookFixture();LearningReader reader=new LearningReader();
        T.Result memory r=T.Result(T.Ref(10143,address(9),1,1),address(1),address(2),address(1),bytes32(uint256(1)),0,3,7,4,20_000_000,false);
        AgentTournaments.Fixture memory f;f.ref=r.ref;f.a=r.a;f.b=r.b;f.published=r;f.bound=true;f.resolved=true;
        book.set(1,0,f);reader.put(r,11,12);assertEq(reader.learned(book,1,address(1)),11);
        r.ref.id=2;r.hash=bytes32(uint256(2));f.ref=r.ref;f.published=r;book.set(1,4,f);reader.put(r,21,22);
        assertEq(reader.learned(book,1,address(1)),21);assertEq(reader.learned(book,2,address(1)),0);
        // Bracket correction invalidates the descendant without deleting its
        // historical result. Its memory must disappear from the live branch.
        f.bound=false;f.resolved=false;book.set(1,4,f);assertEq(reader.learned(book,1,address(1)),11);
        r.ref.id=1;r.hash=bytes32(uint256(3));reader.put(r,31,32);
        vm.expectRevert("synchronize corrected learning");reader.learned(book,1,address(1));
        f.ref=r.ref;f.published=r;f.bound=true;f.resolved=true;book.set(1,0,f);
        assertEq(reader.learned(book,1,address(1)),31);assertEq(reader.learned(book,1,address(2)),32);
        assertEq(reader.learned(book,0,address(1)),0);
    }
}
