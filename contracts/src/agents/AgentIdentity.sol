// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Session} from "../../vendor/interlude/libraries/Session.sol";
import {ChaosGameFlow, IChaosRatings} from "../chaos/ChaosGameFlow.sol";
import {EloFormulaV2} from "../v2/EloFormulaV2.sol";
import {PongInterludeRoomsChaos as Rooms} from "../labs/PongInterludeRoomsChaos.sol";

/// Linked stateless code. All mutable words belong to the dedicated agent app.
library AgentIdentity {
    struct Registration { address creator; address agent; uint8 modes; bytes32 metadata; uint64 expires; }
    error InvalidRegistration();
    error AlreadyRegistered();
    error InvalidQualification();
    error AgentAdmissionDenied();
    event AgentRegistered(address indexed agent,address indexed creator,uint8 modes,bytes32 metadata);
    event AgentQualified(address indexed agent,uint8 mode,bool qualified,bytes32 evidence);
    event MatchAccepted(uint256 indexed id,bytes32 indexed room,address indexed player,address a,address b,uint8 mode,bool ranked);

    function key(uint256 id,uint256 field) internal view returns(bytes32) {
        return keccak256(abi.encode(address(this),uint256(0),id,field));
    }
    function digest(Registration calldata r) public view returns(bytes32) {
        bytes32 domain=keccak256(abi.encode(keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256("PONGIT Agent Arcade"),keccak256("1"),uint256(10143),address(this)));
        return keccak256(abi.encodePacked("\x19\x01",domain,keccak256(abi.encode(
            keccak256("AgentRegistration(address creator,address agent,uint8 modes,bytes32 metadata,uint64 expires)"),
            r.creator,r.agent,r.modes,r.metadata,r.expires))));
    }
    function register(mapping(bytes32=>uint256) storage words,Registration calldata r,bytes calldata creatorProof,bytes calldata agentProof) public {
        if(r.creator==address(0)||r.agent==address(0)||r.creator==r.agent||r.modes==0||r.modes>3||r.metadata==bytes32(0)
            ||r.expires<=block.timestamp||r.expires>block.timestamp+10 minutes)revert InvalidRegistration();
        bytes32 k=key(uint160(r.agent),40);
        if(words[k]!=0)revert AlreadyRegistered();
        bytes32 hash=digest(r);
        if(Session.recover(hash,creatorProof)!=r.creator||Session.recover(hash,agentProof)!=r.agent)revert InvalidRegistration();
        words[k]=uint160(r.creator)|(uint256(r.modes)<<160);
        words[key(uint160(r.agent),41)]=uint256(r.metadata);
        uint256 count=words[key(0,42)];
        words[key(count,43)]=uint160(r.agent);words[key(0,42)]=count+1;
        emit AgentRegistered(r.agent,r.creator,r.modes,r.metadata);
    }
    function qualify(mapping(bytes32=>uint256) storage words,address agent,uint8 mode,bool passed,bytes32 evidence) public {
        bytes32 k=key(uint160(agent),40);uint256 entry=words[k];
        if(mode>1||entry==0||((entry>>160)&(1<<mode))==0||evidence==bytes32(0))revert InvalidQualification();
        uint256 bit=uint256(1)<<(168+mode);words[k]=passed?entry|bit:entry&~bit;
        emit AgentQualified(agent,mode,passed,evidence);
    }
    function validate(mapping(bytes32=>uint256) storage words,address a,address b,uint8 mode,bool ranked) private view {
        uint256 va=words[key(uint160(a),40)];uint256 vb=words[key(uint160(b),40)];
        address ca=address(uint160(va));address cb=address(uint160(vb));uint256 bit=1<<mode;
        if(ca==address(0)&&cb==address(0))revert AgentAdmissionDenied();
        if(ca!=address(0)&&((va>>160)&bit)==0||cb!=address(0)&&((vb>>160)&bit)==0)revert AgentAdmissionDenied();
        if(ranked&&(ca==address(0)||cb==address(0)||ca==cb||((va>>168)&bit)==0||((vb>>168)&bit)==0))revert AgentAdmissionDenied();
    }
    function namespace(uint256 ns,uint256 id) private view returns(bytes32){return keccak256(abi.encode(address(this),ns,id,uint256(0)));}
    function accept(mapping(bytes32=>uint256) storage words,Rooms.Offer calldata o,bytes calldata signature,bytes32 hash,address admission,address actor) external returns(bool fresh){
        if(o.id==0||o.a==address(0)||o.b==address(0)||o.a==o.b||o.mode>1||o.rules!=7||o.expires<=block.timestamp||o.expires>block.timestamp+30
            ||Session.recover(hash,signature)!=admission||actor!=o.a&&actor!=o.b)revert AgentAdmissionDenied();
        validate(words,o.a,o.b,o.mode,o.ranked);
        uint256 meta=words[key(o.id,0)];uint256 phase=(meta>>161)&7;fresh=phase==0;
        if(fresh){
            bytes32 count=namespace(4,0);bytes32 lockA=namespace(1,uint160(o.a));bytes32 lockB=namespace(1,uint160(o.b));
            if(words[count]>=2||words[lockA]!=0||words[lockB]!=0)revert AgentAdmissionDenied();
            meta=uint160(o.a)|(o.ranked?1<<160:0)|(1<<161)|(uint256(o.mode)<<168);
            words[key(o.id,1)]=uint160(o.b);words[key(o.id,2)]=uint256(o.expires)<<64;
            words[key(o.id,3)]=uint256(keccak256(abi.encode(o.entropy,o.id,o.a,o.b,address(this))));
            words[key(o.id,10)]=uint256(hash);words[key(o.id,11)]=uint256(o.room);
            words[lockA]=o.id;words[lockB]=o.id;words[count]++;
        }else if(phase!=1||bytes32(words[key(o.id,10)])!=hash)revert AgentAdmissionDenied();
        uint256 bit=actor==o.a?1:2;uint256 accepted=(meta>>164)&3;
        if((accepted&bit)!=0)revert AgentAdmissionDenied();accepted|=bit;meta=(meta&~(uint256(3)<<164))|(accepted<<164);
        if(accepted==3){meta=(meta&~(uint256(7)<<161))|(2<<161);words[key(o.id,2)]|=uint64(block.number);}
        words[key(o.id,0)]=meta;emit MatchAccepted(o.id,o.room,actor,o.a,o.b,o.mode,o.ranked);
    }
    function rate(mapping(bytes32=>uint256) storage words,EloFormulaV2 formula,uint256 id,address a,address b,address winner) external {
        if(winner!=address(0)){ChaosGameFlow.rate(words,formula,id,a,b,winner);return;}
        uint8 mode=uint8(words[key(id,0)]>>168&1);
        uint256 ra=IChaosRatings(address(this)).ratingOf(a,mode).elo;uint256 rb=IChaosRatings(address(this)).ratingOf(b,mode).elo;
        words[key(id,12)]=ra|(rb<<32)|(ra<<64)|(rb<<96);
    }
}
