// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {AuthorityStore as S} from "../autonomous/AuthorityStore.sol";
import {IndependentTypes as T} from "./IndependentTypes.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// Immutable engine-local authorizations. Root consent is required to replace a key;
/// revision changes make an old revocation or renewal unusable after any transition.
library ArenaAuthorizations {
    bytes32 constant REVOKE = keccak256("RevokeArena(address player,uint256 epoch,uint256 matchId,uint256 revision,uint64 deadline)");
    bytes32 constant RENEW = keccak256("RenewArena(address player,address key,uint256 epoch,uint256 matchId,uint256 revision,uint64 expires,uint64 deadline)");
    struct Renewal { address player; address key; uint256 epoch; uint256 matchId; uint256 revision; uint64 expires; uint64 deadline; }
    event ArenaPermissionRevoked(address indexed player,uint256 indexed epoch,uint256 indexed matchId);
    event ArenaPermissionRenewed(address indexed player,uint256 indexed epoch,uint256 indexed matchId,address key,uint64 expires,uint256 revision);
    function _offset(T.Binding memory b,address player) private pure returns(uint256) {
        require(player==b.a || player==b.b,"player"); return player==b.a?21:24;
    }
    function revision(mapping(bytes32=>uint256) storage w,T.Binding memory b,address player) public view returns(uint256) {
        return S.get(w,0,b.id,_offset(b,player)+2);
    }
    function actor(mapping(bytes32=>uint256) storage w,T.Binding memory b,address sender) public view returns(address) {
        address ka=address(uint160(S.get(w,0,b.id,21))); if(ka==address(0))ka=b.keyA;
        address kb=address(uint160(S.get(w,0,b.id,24))); if(kb==address(0))kb=b.keyB;
        bool left=sender==ka; require(left || sender==kb,"unbound arcade key");
        uint256 m=S.get(w,0,b.id,left?22:25);
        uint64 expires=uint64(m); if(expires==0)expires=left?b.expiresA:b.expiresB;
        require(block.timestamp<expires,"arcade session expired"); require((m>>64)&1==0,"active authorization revoked");
        return left?b.a:b.b;
    }
    function revokeDigest(bytes32 domain,T.Binding memory b,address player,uint256 rev,uint64 deadline) public pure returns(bytes32) {
        return keccak256(abi.encodePacked("\x19\x01",domain,keccak256(abi.encode(REVOKE,player,b.epoch,b.id,rev,deadline))));
    }
    function revoke(mapping(bytes32=>uint256) storage w,bytes32 domain,T.Binding memory b,address player,uint64 deadline,bytes calldata signature) public {
        uint256 at=_offset(b,player); uint256 rev=S.get(w,0,b.id,at+2);
        require(deadline>=block.timestamp,"revocation expired");
        require(ECDSA.recover(revokeDigest(domain,b,player,rev,deadline),signature)==player,"owner revocation");
        S.set(w,0,b.id,at+1,S.get(w,0,b.id,at+1)|(uint256(1)<<64)); S.set(w,0,b.id,at+2,rev+1);
        emit ArenaPermissionRevoked(player,b.epoch,b.id);
    }
    function renewalDigest(bytes32 domain,Renewal calldata r) public pure returns(bytes32) {
        return keccak256(abi.encodePacked("\x19\x01",domain,keccak256(abi.encode(RENEW,r))));
    }
    function renew(mapping(bytes32=>uint256) storage w,bytes32 domain,T.Binding memory b,Renewal calldata r,bytes calldata signature) public {
        uint256 at=_offset(b,r.player);
        require(r.epoch==b.epoch && r.matchId==b.id && r.key!=address(0),"authorization binding");
        require(r.deadline>=block.timestamp && r.deadline<=r.expires && r.expires>block.timestamp && r.expires<=block.timestamp+2 hours,"authorization expired");
        require(r.revision==S.get(w,0,b.id,at+2),"authorization revision");
        require(ECDSA.recover(renewalDigest(domain,r),signature)==r.player,"owner renewal");
        // Two participants may not share the same control key, including replacements.
        uint256 other=at==21?24:21; address otherKey=address(uint160(S.get(w,0,b.id,other)));
        if(otherKey==address(0))otherKey=at==21?b.keyB:b.keyA;
        require(r.key!=otherKey,"opponent key");
        S.set(w,0,b.id,at,uint160(r.key)); S.set(w,0,b.id,at+1,r.expires); S.set(w,0,b.id,at+2,r.revision+1);
        emit ArenaPermissionRenewed(r.player,b.epoch,b.id,r.key,r.expires,r.revision+1);
    }
}
