// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Types} from "../../vendor/interlude/interfaces/Types.sol";
import {Session} from "../../vendor/interlude/libraries/Session.sol";
import {IInterludeHub} from "../../vendor/interlude/interfaces/IInterludeHub.sol";

/// Only the five existing game permissions can be cached. No financial authority.
contract RoomsControlVerifier {
    error InvalidControlGrant();
    function verify(Types.SessionGrant calldata g, bytes calldata sig)
        external view returns (uint256 binding, address key)
    {
        key = g.sessionKey;
        IInterludeHub hub = IControlsApp(msg.sender).hub();
        if (g.granter == address(0) || key == address(0) || g.anyFunction
            || g.expiry <= block.timestamp || g.expiry > block.timestamp + 7200 || g.selectors.length != 5)
            revert InvalidControlGrant();
        uint256 mask;
        for (uint256 i; i < 5; ++i) {
            bytes4 s = g.selectors[i];
            if (s == bytes4(keccak256("input(uint256,int8,uint256,uint256)"))) mask |= 1;
            else if (s == bytes4(keccak256("tick(uint256)"))) mask |= 2;
            else if (s == bytes4(keccak256("concede(uint256)"))) mask |= 4;
            else if (s == bytes4(keccak256("cancelMatch(uint256)"))) mask |= 8;
            else if (s == bytes4(keccak256("acceptMatch((uint256,bytes32,address,address,uint8,bool,uint64,uint256,bytes32),bytes)"))) mask |= 16;
        }
        if (mask != 31 || Session.recover(Session.digest(g, msg.sender, 10143), sig) != g.granter
            || g.epoch != hub.sessionEpochOf(g.granter)) revert InvalidControlGrant();
        uint256 epoch = hub.sessionOf(msg.sender, Types.GLOBAL).epoch;
        if (epoch == 0 || epoch > type(uint32).max) revert InvalidControlGrant();
        return (uint160(g.granter) | (uint256(g.expiry) << 160) | (epoch << 224), key);
    }
    function actor(uint256 binding) external view returns (address) {
        if (uint64(binding >> 160) <= block.timestamp || binding >> 224 != IControlsApp(msg.sender).hub().sessionOf(msg.sender, Types.GLOBAL).epoch)
            revert InvalidControlGrant();
        return address(uint160(binding));
    }
}
interface IControlsApp { function hub() external view returns(IInterludeHub); }
