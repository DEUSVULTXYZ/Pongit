// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {CompetitionTypes as T} from "./CompetitionTypes.sol";

library AgentArenaTypes {
    struct Controller {bytes32 codeHash;uint256 memoryWord;uint8 house;address key;uint64 expires;}
    struct Binding {
        uint256 id;uint256 epoch;uint64 preparedBlock;uint64 tournament;
        address a;address b;uint8 mode;bool ranked;bool overtime;
        Controller controlA;Controller controlB;
    }
}
interface IAgentArena {
    function pool() external view returns(address);
    function hub() external view returns(address);
    function RULES_VERSION() external view returns(uint256);
    function boundMatch() external view returns(AgentArenaTypes.Binding memory);
    function prepare(AgentArenaTypes.Binding calldata binding) external;
    function openEngine() external payable;
    function closeEngine() external;
    function cancelRecovered() external;
    function publishedResult() external view returns(T.Result memory,uint256 memoryA,uint256 memoryB);
}
