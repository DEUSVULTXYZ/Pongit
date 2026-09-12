// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {AuthorityStore as S} from "../autonomous/AuthorityStore.sol";
import {ContractLobby as L} from "../autonomous/ContractLobby.sol";

/// Contract discovery for inbox/outbox. PostgreSQL and log scans are optional caches.
library InvitationIndex {
    function add(mapping(bytes32=>uint256) storage w,uint256 id) public returns(uint256) {
        if(S.get(w,70,id,0)!=0)return id;
        L.Invitation memory v=L.invitation(w,id);
        uint256 bucket=block.timestamp/60;
        uint256 used=S.get(w,73,uint160(v.sender),bucket);
        require(used<5,"invitation rate limit"); S.set(w,73,uint160(v.sender),bucket,used+1);
        S.set(w,70,id,0,1);
        uint256 n=S.get(w,71,uint160(v.sender),0); S.set(w,71,uint160(v.sender),n+1,id); S.set(w,71,uint160(v.sender),0,n+1);
        n=S.get(w,72,uint160(v.recipient),0); S.set(w,72,uint160(v.recipient),n+1,id); S.set(w,72,uint160(v.recipient),0,n+1);
        return id;
    }
    function page(mapping(bytes32=>uint256) storage w,address p,bool sent,uint256 offset,uint256 limit) public view returns(uint256[] memory ids,uint256 total) {
        require(limit<=50,"page bounds"); uint256 ns=sent?71:72;
        total=S.get(w,ns,uint160(p),0); uint256 n=offset>=total?0:total-offset; if(n>limit)n=limit;
        ids=new uint256[](n); for(uint256 i;i<n;i++)ids[i]=S.get(w,ns,uint160(p),total-offset-i);
    }
}
