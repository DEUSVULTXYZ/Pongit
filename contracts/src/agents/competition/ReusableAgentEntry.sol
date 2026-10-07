// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {ReusableArenaStorage as S} from "../../independent/ReusableArenaStorage.sol";
import {ReusableAgentBinding as Binding} from "./ReusableAgentBinding.sol";
import {ReusableAdmission as Admission} from "../../independent/ReusableAdmission.sol";
import {AgentArenaTypes as A} from "./AgentArenaTypes.sol";
import {HousePolicies} from "./HousePolicies.sol";
import {RoomsRules} from "../../labs/RoomsRules.sol";
import {RoomsState} from "../../labs/RoomsState.sol";
import {ChaosEngine} from "../../chaos/ChaosEngine.sol";
import {AgentFairPause as Fair} from "./AgentFairPause.sol";
import {ReusableAgentView as View} from "./ReusableAgentView.sol";
import {ReusableAgentGame as Game} from "./ReusableAgentGame.sol";

/// Cold match-entry work, independent from the running physics module.
library ReusableAgentEntry {
    uint256 private constant SLOT=1;
    function phase(mapping(bytes32=>uint256) storage w) internal view returns(uint8){return uint8(S.get(w,0)>>161&7);}
    function initialize(mapping(bytes32=>uint256) storage w,RoomsRules classic,ChaosEngine kernel,uint256 rules) public {
        require(phase(w)==1,"fresh admission");
        if(S.get(w,0)>>168&1==0)RoomsState.save(w,SLOT,classic.initial(bytes32(S.get(w,3)),0));
        else {uint256[8] memory p=kernel.initial(bytes32(S.get(w,3)));for(uint256 i;i<8;i++)S.set(w,21+i,p[i]);S.set(w,8,5);}
        S.set(w,62,block.timestamp+30);
        Fair.initialize(w,rules);
        View.publish(w,kernel);
    }
    function cancelAdmission(mapping(bytes32=>uint256) storage w,Admission.Ticket calldata ticket,A.Binding calldata binding,
        bytes calldata signature,address signer,address authority,HousePolicies policies,RoomsRules classic,ChaosEngine kernel,uint256 rules) external {
        Binding.cancelExpired(w,ticket,binding,signature,signer,authority,policies,rules);
        initialize(w,classic,kernel,rules);Game.finish(w,kernel,4,address(0));View.publish(w,kernel);
    }
    function cancelUnready(mapping(bytes32=>uint256) storage w,ChaosEngine kernel) public {
        require(phase(w)==1&&(S.get(w,61)!=3||Fair.rules(w)==17&&Fair.enabled(w))&&block.timestamp>S.get(w,62),"loading not expired");
        Game.finish(w,kernel,4,address(0));View.publish(w,kernel);
    }
    function ready(mapping(bytes32=>uint256) storage w,ChaosEngine kernel,uint8 side) external {
        require(phase(w)==1&&block.timestamp<=S.get(w,62),"current loading match");
        uint256 before_=S.get(w,61);uint256 next=before_|(uint256(1)<<side);
        if(next!=before_){S.set(w,61,next);View.publish(w,kernel);}
    }
    function start(mapping(bytes32=>uint256) storage w,ChaosEngine kernel) external {
        require(phase(w)==1,"not loading");
        if(S.get(w,61)!=3){require(block.timestamp<=S.get(w,62),"loading expired");return;}
        uint256 packedLaunch=S.get(w,60);uint256 at=uint64(packedLaunch);
        if(at==0){
            require(block.number<=type(uint64).max-300,"engine block overflow");
            S.set(w,60,uint64(block.timestamp+3)|((block.number+300)<<64));View.publish(w,kernel);return;
        }
        require(block.timestamp>=at&&block.number>=uint64(packedLaunch>>64),"countdown pending");
        // A healthy engine is not proof that the human has received a playable
        // frame. Rules 17 uses that human's existing authenticated heartbeat
        // to activate physics, with the same 500 ms protection thereafter.
        if(Fair.rules(w)==17&&Fair.enabled(w))return;
        activate(w,kernel);
    }
    function presenceStart(mapping(bytes32=>uint256) storage w,ChaosEngine kernel,uint8 side) external {
        require(phase(w)==1&&Fair.rules(w)==17&&Fair.enabled(w),"presence launch unavailable");
        require(Fair.inspect(w).human==side+1,"protected human only");
        require(block.timestamp<=S.get(w,62),"loading expired");
        uint256 packedLaunch=S.get(w,60);
        if(S.get(w,61)!=3||packedLaunch==0||block.timestamp<uint64(packedLaunch)||block.number<uint64(packedLaunch>>64))return;
        activate(w,kernel);
    }
    function activate(mapping(bytes32=>uint256) storage w,ChaosEngine kernel) private {
        S.set(w,0,(S.get(w,0)&~(uint256(7)<<161))|(2<<161));
        require(block.number<=type(uint64).max,"engine block overflow");
        S.set(w,2,(S.get(w,2)&(uint256(type(uint64).max)<<128))|uint64(block.number));Fair.start(w,0);View.publish(w,kernel);
    }
}
