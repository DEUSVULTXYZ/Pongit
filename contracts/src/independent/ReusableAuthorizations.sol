// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {ReusableArenaStorage as S} from "./ReusableArenaStorage.sol";
import {ArenaAuthorizations as Auth} from "./ArenaAuthorizations.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// Two fixed authorization records. Owner signatures bind both logical match
/// and epoch, so resetting revisions never revives an old permission.
library ReusableAuthorizations {
    bytes32 private constant REVOKE=keccak256("RevokeArena(address player,uint256 epoch,uint256 matchId,uint256 revision,uint64 deadline)");
    bytes32 private constant RENEW=keccak256("RenewArena(address player,address key,uint256 epoch,uint256 matchId,uint256 revision,uint64 expires,uint64 deadline)");
    event ArenaPermissionRevoked(address indexed player,uint256 indexed epoch,uint256 indexed matchId);
    event ArenaPermissionRenewed(address indexed player,uint256 indexed epoch,uint256 indexed matchId,address key,uint64 expires,uint256 revision);
    function domain() private view returns(bytes32){return keccak256(abi.encode(
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
        keccak256("PONGIT Reusable Arena"),keccak256("1"),uint256(10143),address(this)));}
    function side(mapping(bytes32=>uint256) storage w,address player) private view returns(uint8){
        if(player==address(uint160(S.get(w,0))))return 0;
        require(player==address(uint160(S.get(w,1))),"participant only");return 1;
    }
    function keyOf(mapping(bytes32=>uint256) storage w,uint8 which) private view returns(address k){
        k=address(uint160(S.get(w,54+which*3)));if(k==address(0))k=address(uint160(S.get(w,32+which)));
    }
    function actor(mapping(bytes32=>uint256) storage w,address sender) external view returns(uint8){
        for(uint8 which;which<2;which++){
            uint256 meta=S.get(w,55+which*3);uint64 expires=uint64(meta);
            if(expires==0)expires=uint64(S.get(w,34)>>(which*64));
            if(sender!=address(0)&&sender==keyOf(w,which)&&block.timestamp<expires&&meta>>64&1==0)return which;
        }
        revert("unbound or expired arcade key");
    }
    function revision(mapping(bytes32=>uint256) storage w,address player) public view returns(uint256){return S.get(w,56+side(w,player)*3);}
    function revokeDigest(mapping(bytes32=>uint256) storage w,address player,uint64 deadline) public view returns(bytes32){
        return keccak256(abi.encodePacked("\x19\x01",domain(),keccak256(abi.encode(REVOKE,player,S.get(w,31),S.get(w,37),revision(w,player),deadline))));
    }
    function revoke(mapping(bytes32=>uint256) storage w,address player,uint64 deadline,bytes calldata signature) external {
        require(deadline>=block.timestamp&&ECDSA.recover(revokeDigest(w,player,deadline),signature)==player,"owner revocation");
        uint256 at=54+side(w,player)*3;S.set(w,at+1,S.get(w,at+1)|(uint256(1)<<64));S.set(w,at+2,S.get(w,at+2)+1);
        emit ArenaPermissionRevoked(player,S.get(w,31),S.get(w,37));
    }
    function renewalDigest(Auth.Renewal calldata r) public view returns(bytes32){return keccak256(abi.encodePacked("\x19\x01",domain(),keccak256(abi.encode(RENEW,r))));}
    function renew(mapping(bytes32=>uint256) storage w,Auth.Renewal calldata r,bytes calldata signature) external {
        S.assertMatch(w,r.epoch,r.matchId);uint8 which=side(w,r.player);uint256 at=54+which*3;
        require(r.key!=address(0)&&r.key!=keyOf(w,1-which),"distinct control key");
        require(r.deadline>=block.timestamp&&r.deadline<=r.expires&&r.expires>block.timestamp&&r.expires<=block.timestamp+2 hours,"authorization expired");
        require(r.revision==S.get(w,at+2)&&ECDSA.recover(renewalDigest(r),signature)==r.player,"owner renewal/revision");
        S.set(w,at,uint160(r.key));S.set(w,at+1,r.expires);S.set(w,at+2,r.revision+1);
        emit ArenaPermissionRenewed(r.player,r.epoch,r.matchId,r.key,r.expires,r.revision+1);
    }
}
