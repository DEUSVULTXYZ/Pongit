// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {ReusableAgentArena} from "../agents/competition/ReusableAgentArena.sol";
import {IInterludeHub} from "../../vendor/interlude/interfaces/IInterludeHub.sol";
import {Types} from "../../vendor/interlude/interfaces/Types.sol";

/// One isolated, empty arena for verifying the production publication path.
/// No tickets, players, market, rewards or arbitrary execution are supported.
contract PublicationQualificationAuthority {
    address public immutable owner;
    IInterludeHub public immutable hub;
    ReusableAgentArena public arena;
    constructor(IInterludeHub h){
        require(block.chainid==10143&&address(h).code.length>0,"testnet hub");
        owner=msg.sender;hub=h;
    }
    modifier onlyOwner(){require(msg.sender==owner&&block.chainid==10143,"testnet owner");_;}
    function bind(ReusableAgentArena app) external onlyOwner {
        require(address(arena)==address(0)&&app.pool()==address(this)&&address(app.hub())==address(hub),"one owned arena");
        arena=app;
    }
    function registeredArena(address app) external view returns(bool){return app!=address(0)&&app==address(arena);}
    function issuedTicket(address,uint256,uint256) external pure returns(bytes32){return bytes32(0);}
    function open() external payable onlyOwner {require(address(arena)!=address(0),"bind first");arena.openEngine{value:msg.value}();}
    function close() external onlyOwner {arena.closeEngine();}
    function release() external onlyOwner {
        hub.releaseStake(address(arena),Types.GLOBAL);arena.resultVerifier().sealReleased(address(arena));
    }
}
