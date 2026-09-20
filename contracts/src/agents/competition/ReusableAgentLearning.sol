// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {AgentTournaments} from "./AgentTournaments.sol";
import {CompetitionTypes as T} from "./CompetitionTypes.sol";

/// Learning belongs to the current, verified tournament branch. A corrected or
/// invalidated descendant must not silently seed its replacement controller.
library ReusableAgentLearning {
    function latest(AgentTournaments book,mapping(bytes32=>T.Result) storage results,
        mapping(bytes32=>uint256[2]) storage brains,uint64 id,address player) external view returns(uint256 memoryWord)
    {
        if(id==0)return 0;
        AgentTournaments.Tournament memory t=book.tournament(id);
        for(uint8 i;i<(t.league?28:7);i++){
            AgentTournaments.Fixture memory f=book.fixture(id,i);
            if(!f.bound||!f.resolved)continue;
            bytes32 key=T.key(f.ref);
            require(results[key].hash==f.published.hash,"synchronize corrected learning");
            if(f.published.status!=3)continue;
            if(f.a==player)memoryWord=brains[key][0];
            else if(f.b==player)memoryWord=brains[key][1];
        }
    }
}
