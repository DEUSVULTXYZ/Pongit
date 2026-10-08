// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {CompetitionTypes as T} from "./CompetitionTypes.sol";
import {AgentArenaTypes as A} from "./AgentArenaTypes.sol";
import {ReusableAgentGame as Game} from "./ReusableAgentGame.sol";
import {ReusableAdmission as Admission} from "../../independent/ReusableAdmission.sol";
import {PublishedResultVerifier} from "../../independent/PublishedResultVerifier.sol";

library PoolResultValidation {
    function verify(PublishedResultVerifier verifier,T.Ref memory ref,Game.Result memory complete,
        A.Binding memory binding,Admission.Ticket memory ticket,bytes32[16] memory proof) external view returns(T.Result memory r)
    {
        r=complete.match_;
        require(ticket.arena!=address(0)&&ticket.arena==ref.arena&&ticket.epoch==ref.epoch&&ticket.matchId==ref.id&&ref.chainId==10143
            &&T.same(r.ref,ref)&&r.a==binding.a&&r.b==binding.b&&r.mode==binding.mode&&r.hash!=0&&r.status>=3&&r.status<=4
            &&!r.finality&&complete.rules>=15&&complete.rules<=17&&complete.rules==ticket.rules&&r.elapsedUs<=(binding.overtime?360_000_000:300_000_000)
            &&complete.finishedAt>0&&complete.finishedAt<=block.timestamp,"canonical agent result");
        r.finality=verifier.verify(ticket,keccak256(abi.encode(complete)),uint32(ticket.sequence-1),proof);
    }
}
