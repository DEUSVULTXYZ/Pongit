// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {AgentCatalog} from "./AgentCatalog.sol";
import {AgentPublishedRatings} from "./AgentPublishedRatings.sol";
import {AgentArenaTypes as A,IAgentArena} from "./AgentArenaTypes.sol";
import {CompetitionTypes as T} from "./CompetitionTypes.sol";
import {IndependentTypes as R} from "../../independent/IndependentTypes.sol";
import {IInterludeHub} from "../../../vendor/interlude/interfaces/IInterludeHub.sol";
import {Types} from "../../../vendor/interlude/interfaces/Types.sol";

/// Immutable linked validation. Calls execute as the pool, with no independent
/// mutable authority or administrator. Keeping this outside its dispatcher also
/// leaves the pool deployable under EIP-170.
library PoolPublication {
    function controller(AgentCatalog catalog,address agent,uint64 tournament,bytes32 frozen,uint256 learned) external view returns(A.Controller memory c){
        AgentCatalog.Identity memory identity=catalog.identity(agent);
        require(identity.codeHash==frozen&&(identity.house==0?agent:catalog.houseController()).codehash==frozen,"frozen controller");
        c.codeHash=frozen;c.house=identity.house;
        c.memoryWord=tournament==0?0:learned&((uint256(1)<<192)-1)&~((uint256(1)<<42)-1);
    }
    function observe(T.Ref memory ref,address a,address b,IInterludeHub hub,uint256 arenaEpoch,bytes32 arenaMatch)
        external returns(T.Result memory r,uint256 brainA,uint256 brainB){
        require(arenaMatch==T.key(ref),"arena reused before final capture");
        Types.Session memory session=hub.sessionOf(ref.arena,Types.GLOBAL);
        require(session.status!=Types.Status.Challenged&&arenaEpoch==ref.epoch,"result under review/unopened");
        bool finality=session.status==Types.Status.None;
        if(!finality)require(session.epoch==ref.epoch&&session.batchIndex>0,"publication pending");
        IAgentArena arena=IAgentArena(ref.arena);if(finality)arena.cancelRecovered();
        (r,brainA,brainB)=arena.publishedResult();
        require(T.same(r.ref,ref)&&r.a==a&&r.b==b,"result binding");
        require(r.mode==arena.boundMatch().mode,"result mode");r.finality=finality;
    }
    function ledger(AgentPublishedRatings ratings,T.Result memory r,bool ranked,bool correction) external {
        // A complete reference, not an arena-local id, is the unique ledger key.
        R.Result memory value=R.Result(r.ref.arena,r.ref.epoch,uint256(T.key(r.ref)),r.a,r.b,r.winner,r.mode,ranked,r.status,r.scoreA,r.scoreB,r.hash);
        if(correction)ratings.reconcile(value,r.finality);else ratings.publish(value,r.finality);
    }
}
