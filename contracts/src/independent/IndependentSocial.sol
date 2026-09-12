// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {AuthorityStore as S} from "../autonomous/AuthorityStore.sol";
import {ContractLobby as L} from "../autonomous/ContractLobby.sol";
import {ArcadeFamily} from "./ArcadeFamily.sol";
import {PublishedRatings} from "./PublishedRatings.sol";
import {InvitationIndex} from "./InvitationIndex.sol";

/// Immutable Monad social rules. Every implicit acceptance follows a stored, still
/// valid consent to exactly the same opponent, mode and ranked flag.
library IndependentSocial {
    function grantHash(ArcadeFamily f,address actor) public view returns(bytes32) {
        ArcadeFamily.Grant memory g=f.grantOf(actor);
        return g.key==address(0)?bytes32(0):f.grantDigest(g);
    }
    function accept(mapping(bytes32=>uint256) storage w,ArcadeFamily f,address actor,uint256 id) public {
        bytes32 hash=grantHash(f,actor); require(hash!=0,"renew arcade authorization");
        bool start=L.accept(w,actor,id); L.Proposal memory p=L.proposal(w,id);
        S.set(w,74,id,actor==p.a?0:1,uint256(hash));
        if(start){S.set(w,1,uint160(p.a),0,id);S.set(w,1,uint160(p.b),0,id);}
    }
    function _remember(mapping(bytes32=>uint256) storage w,ArcadeFamily f,uint256 id) private returns(uint256) {
        if(S.get(w,75,id,0)==0)S.set(w,75,id,0,uint256(grantHash(f,L.invitation(w,id).sender)));
        return InvitationIndex.add(w,id);
    }
    function inviteToRoom(mapping(bytes32=>uint256) storage w,ArcadeFamily f,address actor,uint256 room,address target) public returns(uint256) {
        require(!L.room(w,room).ranked,"ranked room admission");
        return _remember(w,f,L.inviteBound(w,actor,room,target,600));
    }
    function _crossed(mapping(bytes32=>uint256) storage w,address actor,address target,uint8 mode,bool ranked) private view returns(uint256) {
        uint256 id=S.get(w,18,uint256(keccak256(abi.encode(target,actor))),0);
        if(id==0)return 0; L.Invitation memory v=L.invitation(w,id);
        if(v.status!=1 || v.expires<block.timestamp || L.occupancy(w,v.sender)!=v.room)return 0;
        L.Room memory r=L.room(w,v.room); return r.mode==mode && r.ranked==ranked?id:0;
    }
    function inviteSomeone(mapping(bytes32=>uint256) storage w,ArcadeFamily f,address actor,address target,uint8 mode) public returns(uint256) {
        uint256 crossed=_crossed(w,actor,target,mode,false);
        if(crossed!=0){answer(w,f,actor,crossed,true);return crossed;}
        uint256 room=L.occupancy(w,actor);if(room==0)room=L.createRoom(w,actor,mode,false);
        L.Room memory v=L.room(w,room);require(v.mode==mode && !v.ranked,"mode conflict");
        return _remember(w,f,L.inviteBound(w,actor,room,target,600));
    }
    function answer(mapping(bytes32=>uint256) storage w,ArcadeFamily f,address actor,uint256 id,bool yes) public {
        L.Invitation memory invitation_=L.invitation(w,id);
        uint256 p=L.answerBoundInvite(w,actor,id,yes);
        if(yes && p!=0){
            L.Proposal memory v=L.proposal(w,p);
            if(actor==v.a || actor==v.b){
                accept(w,f,actor,p);
                if(((v.a==actor && v.b==invitation_.sender)||(v.b==actor && v.a==invitation_.sender))
                    && grantHash(f,invitation_.sender)!=0 && S.get(w,75,id,0)==uint256(grantHash(f,invitation_.sender)))
                    accept(w,f,invitation_.sender,p);
            }
        }
    }
    function rematch(mapping(bytes32=>uint256) storage w,ArcadeFamily f,PublishedRatings ratings,address actor,uint256 source) public returns(uint256) {
        PublishedRatings.Entry memory e=ratings.entry(source);
        require(actor==e.first.a || actor==e.first.b,"source participant");
        address opponent=actor==e.first.a?e.first.b:e.first.a;
        uint256 crossed=_crossed(w,actor,opponent,e.first.mode,e.first.ranked);
        if(crossed!=0){answer(w,f,actor,crossed,true);return crossed;}
        uint256 room=L.occupancy(w,actor);
        if(room!=0 && room!=type(uint256).max && room==L.occupancy(w,opponent)){
            L.Room memory v=L.room(w,room);
            if(v.members.length==2 && v.mode==e.first.mode && v.ranked==e.first.ranked){
                uint256 id=L.propose(w,room,60);accept(w,f,actor,id);return id;
            }
        }
        if(room==type(uint256).max)L.cancelQueue(w,actor);else if(room!=0)L.leave(w,actor);
        room=L.createRoom(w,actor,e.first.mode,e.first.ranked);
        return _remember(w,f,L.inviteBound(w,actor,room,opponent,60));
    }
}
