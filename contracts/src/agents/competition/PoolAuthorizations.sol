// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {AgentArenaTypes as A} from "./AgentArenaTypes.sol";
import {ArenaAuthorizations as Auth} from "../../independent/ArenaAuthorizations.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// Arena-local overrides, disjoint from the packed physics and bot-memory words.
/// A root passkey signature is needed for renewal or confirmed revocation.
library PoolAuthorizations {
    bytes32 constant REVOKE=keccak256("RevokeArena(address player,uint256 epoch,uint256 matchId,uint256 revision,uint64 deadline)");
    bytes32 constant RENEW=keccak256("RenewArena(address player,address key,uint256 epoch,uint256 matchId,uint256 revision,uint64 expires,uint64 deadline)");
    event ArenaPermissionRevoked(address indexed player,uint256 indexed epoch,uint256 indexed matchId);
    event ArenaPermissionRenewed(address indexed player,uint256 indexed epoch,uint256 indexed matchId,address key,uint64 expires,uint256 revision);
    function key(uint256 id,uint256 field) private view returns(bytes32){return keccak256(abi.encode(address(this),uint256(0),id,field));}
    function domain() private view returns(bytes32){return keccak256(abi.encode(keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),keccak256("PONGIT Pooled Arena"),keccak256("1"),uint256(10143),address(this)));}
    function offset(A.Binding storage b,address player) private view returns(uint256 at){
        require(player==b.a&&b.controlA.codeHash==0||player==b.b&&b.controlB.codeHash==0,"human participant only");return player==b.a?54:57;
    }
    function revision(mapping(bytes32=>uint256) storage w,A.Binding storage b,address player) external view returns(uint256){return w[key(b.id,offset(b,player)+2)];}
    function actor(mapping(bytes32=>uint256) storage w,A.Binding storage b,address sender) external view returns(address){
        for(uint8 side;side<2;side++){
            A.Controller memory c=side==0?b.controlA:b.controlB;if(c.codeHash!=0)continue;uint256 at=54+side*3;
            address control=address(uint160(w[key(b.id,at)]));if(control==address(0))control=c.key;
            uint256 meta=w[key(b.id,at+1)];uint64 expires=uint64(meta);if(expires==0)expires=c.expires;
            if(control!=address(0)&&sender==control&&block.timestamp<expires&&meta>>64&1==0)return side==0?b.a:b.b;
        }
        revert("unbound or expired human control");
    }
    function revokeDigest(mapping(bytes32=>uint256) storage w,A.Binding storage b,address player,uint64 deadline) public view returns(bytes32){
        return keccak256(abi.encodePacked("\x19\x01",domain(),keccak256(abi.encode(REVOKE,player,b.epoch,b.id,w[key(b.id,offset(b,player)+2)],deadline))));
    }
    function revoke(mapping(bytes32=>uint256) storage w,A.Binding storage b,address player,uint64 deadline,bytes calldata signature) external {
        require(deadline>=block.timestamp&&ECDSA.recover(revokeDigest(w,b,player,deadline),signature)==player,"owner revocation");
        uint256 at=offset(b,player);w[key(b.id,at+1)]|=uint256(1)<<64;w[key(b.id,at+2)]++;
        emit ArenaPermissionRevoked(player,b.epoch,b.id);
    }
    function renewalDigest(Auth.Renewal calldata r) public view returns(bytes32){return keccak256(abi.encodePacked("\x19\x01",domain(),keccak256(abi.encode(RENEW,r))));}
    function renew(mapping(bytes32=>uint256) storage w,A.Binding storage b,Auth.Renewal calldata r,bytes calldata signature) external {
        uint256 at=offset(b,r.player);require(r.epoch==b.epoch&&r.matchId==b.id&&r.key!=address(0),"authorization binding");
        require(r.deadline>=block.timestamp&&r.deadline<=r.expires&&r.expires>block.timestamp&&r.expires<=block.timestamp+2 hours,"authorization expired");
        require(r.revision==w[key(b.id,at+2)]&&ECDSA.recover(renewalDigest(r),signature)==r.player,"owner renewal/revision");
        uint256 other=at==54?57:54;address opponent=address(uint160(w[key(b.id,other)]));if(opponent==address(0))opponent=at==54?b.controlB.key:b.controlA.key;
        require(r.key!=opponent,"opponent key");w[key(b.id,at)]=uint160(r.key);w[key(b.id,at+1)]=r.expires;w[key(b.id,at+2)]=r.revision+1;
        emit ArenaPermissionRenewed(r.player,b.epoch,b.id,r.key,r.expires,r.revision+1);
    }
}
