// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {ReusableAgentArena} from "./ReusableAgentArena.sol";
import {AgentCatalog} from "./AgentCatalog.sol";
import {IInterludeHub} from "../../../vendor/interlude/interfaces/IInterludeHub.sol";
import {Types} from "../../../vendor/interlude/interfaces/Types.sol";

interface IAvailableAgentArenas {
    function arenaPage() external view returns(ReusableAgentArena[] memory);
    function arenaAvailable(address arena) external view returns(bool);
}

/// Stateless linked selection. The authority checks published availability;
/// neither PostgreSQL counters nor an operator-selected arena are accepted.
library AgentArenaSelection {
    error NoCompatibleIdleArena();
    /// Queue scans need the newest eligible base block so a newly registered
    /// community strategy cannot hide playable requests on older sessions.
    function newest(IInterludeHub hub) external view returns(ReusableAgentArena chosen){
        IAvailableAgentArenas pool=IAvailableAgentArenas(address(this));
        ReusableAgentArena[] memory arenas=pool.arenaPage();uint256 highest;
        for(uint256 i;i<arenas.length;i++)if(pool.arenaAvailable(address(arenas[i]))){
            uint256 baseBlock=hub.sessionOf(address(arenas[i]),Types.GLOBAL).baseBlock;
            if(address(chosen)==address(0)||baseBlock>highest){chosen=arenas[i];highest=baseBlock;}
        }
    }
    function choose(AgentCatalog catalog,IInterludeHub hub,address a,address b) external view returns(ReusableAgentArena chosen){
        IAvailableAgentArenas pool=IAvailableAgentArenas(address(this));
        ReusableAgentArena[] memory arenas=pool.arenaPage();
        uint256 first=catalog.identity(a).house==0?catalog.registeredBlock(a):0;
        uint256 second=catalog.identity(b).house==0?catalog.registeredBlock(b):0;
        uint256 oldest=type(uint256).max;
        for(uint256 i;i<arenas.length;i++){
            address app=address(arenas[i]);
            if(!pool.arenaAvailable(app))continue;
            uint256 baseBlock=hub.sessionOf(app,Types.GLOBAL).baseBlock;
            if(first>baseBlock||second>baseBlock)continue;
            (,uint256 last)=arenas[i].currentMatch();
            // Global match IDs provide stable least-recently-used ordering.
            // A fresh epoch with no game has last=0. Ties use registry order.
            if(address(chosen)==address(0)||last<oldest){chosen=arenas[i];oldest=last;}
        }
        // The caller first scanned the newest idle base block. If no compatible
        // choice survives, revert atomically rather than consuming a queue item.
        if(address(chosen)==address(0))revert NoCompatibleIdleArena();
    }
}
