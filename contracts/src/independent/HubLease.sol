// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// Zero expiry is a protocol property of the pinned v3 hub, never a default
/// for an unknown or incomplete delegation. Status and epoch remain separate.
library HubLease {
    address internal constant NO_LEASE_HUB=0x98922c6E5e4Bea62761C71D2401c7ec2c26eC43e;
    function valid(address hub,uint256 expires,uint256 reserve) internal view returns(bool) {
        return expires>block.timestamp+reserve||(expires==0&&hub==NO_LEASE_HUB);
    }
    function expired(uint256 expires) internal view returns(bool) {
        return expires!=0&&block.timestamp>=expires;
    }
}
