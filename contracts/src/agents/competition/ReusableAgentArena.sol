// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Delegatable} from "../../../vendor/interlude/Delegatable.sol";
import {ReusableAgentArenaInterludeSurface} from "./ReusableAgentArenaInterludeSurface.sol";
import {DelegatedLayout} from "../../../vendor/interlude/libraries/DelegatedLayout.sol";
import {IInterludeHub} from "../../../vendor/interlude/interfaces/IInterludeHub.sol";
import {Types} from "../../../vendor/interlude/interfaces/Types.sol";
import {ReusableArenaStorage as S} from "../../independent/ReusableArenaStorage.sol";
import {ReusableAdmission as Admission} from "../../independent/ReusableAdmission.sol";
import {ReusableAgentGame as Game} from "./ReusableAgentGame.sol";
import {ReusableAuthorizations as Auth} from "../../independent/ReusableAuthorizations.sol";
import {ArenaAuthorizations} from "../../independent/ArenaAuthorizations.sol";
import {AgentArenaTypes as T} from "./AgentArenaTypes.sol";
import {PublishedResultVerifier} from "../../independent/PublishedResultVerifier.sol";
import {ChaosEngine} from "../../chaos/ChaosEngine.sol";
import {ChaosGameFlow} from "../../chaos/ChaosGameFlow.sol";
import {RoomsRules} from "../../labs/RoomsRules.sol";
import {RoomsState} from "../../labs/RoomsState.sol";
import {ReusableAgentBinding as Binding} from "./ReusableAgentBinding.sol";
import {HousePolicies} from "./HousePolicies.sol";

/// TESTNET CANDIDATE, not wired to production admission/settlement.
/// One bounded physical slot; arbitrarily many players within a 65,536-result
/// epoch. Every external write binds the actual epoch and logical match ID.
contract ReusableAgentArena is ReusableAgentArenaInterludeSurface {
    /// @custom:interlude global
    mapping(bytes32=>uint256) internal words;
    address public immutable lobby;
    address public immutable admissionSigner;
    HousePolicies public immutable policies;
    ChaosEngine public immutable kernel;
    RoomsRules public immutable classic;
    PublishedResultVerifier public immutable resultVerifier;
    uint256 public constant RULES_VERSION=15;
    uint256 public constant TICK_US=10_000;
    uint256 public constant CAPACITY=1;
    error EngineOnly();
    error NoAgentMarkets();
    event AdmissionBound(uint256 indexed epoch,uint256 indexed id,uint256 sequence,bytes32 ticketHash,T.Binding binding);
    event UnpublishedMatchCancelled(uint256 indexed epoch,uint256 indexed id);

    constructor(IInterludeHub protocol,address authority,address admissions,HousePolicies house,
        ChaosEngine physics,PublishedResultVerifier verifier) Delegatable(protocol) {
        require(block.chainid==10143&&authority.code.length>0&&admissions!=address(0)&&address(house).code.length>0
            &&address(physics).code.length>0&&address(verifier).code.length>0,"testnet configuration");
        require(address(verifier.authority())==authority&&address(verifier.hub())==address(protocol),"result authority");
        lobby=authority;admissionSigner=admissions;policies=house;kernel=physics;resultVerifier=verifier;
        classic=new RoomsRules();DelegatedLayout.layout().owner=authority;
        _registerInterludeSurface();
    }
    modifier engine(){
        if(!isEphemeral())revert EngineOnly();
        Types.Session memory s=hub.sessionOf(address(this),Types.GLOBAL);
        (uint256 epoch,,)=S.commitment(words);
        require(s.epoch==epoch&&s.status==Types.Status.Active&&block.timestamp<s.expiresAt,"engine session unavailable");_;
    }
    modifier current(uint256 epoch,uint256 id){S.assertMatch(words,epoch,id);_;}
    function resultCommitment() external view returns(uint256,uint32,bytes32){return S.commitment(words);}
    function pool() external view returns(address){return lobby;}
    function boundMatch() external view returns(T.Binding memory){return Binding.binding(words);}
    function currentMatch() public view returns(uint256 epoch,uint256 id){return(S.get(words,31),S.get(words,37));}
    function currentAdmission() external view returns(uint256 epoch,uint256 id,uint256 sequence,bytes32 hash){
        return(S.get(words,31),S.get(words,37),S.get(words,38),bytes32(S.get(words,36)));
    }
    function openEngine() external payable {
        require(block.chainid==10143&&msg.sender==lobby&&hub.statusOf(address(this),Types.GLOBAL)==Types.Status.None,"released authority only");
        (uint256 prior,uint32 count,bytes32 root)=S.commitment(words);
        if(prior!=0){
            require(S.get(words,37)==0||Game.phase(words)>=3,"recover unfinished match first");
            (bytes32 sealedRoot,uint32 sealedCount)=resultVerifier.finalizedRoots(address(this),prior);
            require(sealedRoot==root&&sealedRoot!=0&&sealedCount==count,"seal released root first");
        }
        S.initialize(words,prior+1);
        for(uint256 i=63;i<=66;i++)S.set(words,i,0);
        DelegatedLayout.Layout storage l=DelegatedLayout.layout();
        hub.openDelegation{value:msg.value}(Types.GLOBAL,l.globalSlots,l.globalMappingBases,address(0),lobby,l.minStake);
        require(hub.sessionOf(address(this),Types.GLOBAL).epoch==prior+1,"unexpected hub epoch");
    }
    function closeEngine() external {
        require(block.chainid==10143&&msg.sender==lobby,"authority only");
        Types.Session memory s=hub.sessionOf(address(this),Types.GLOBAL);
        require(s.status==Types.Status.Active&&(S.get(words,37)==0||Game.phase(words)>=3||block.timestamp>=s.expiresAt),"published match running");
        hub.closeDelegation(Types.GLOBAL);
    }
    function cancelRecovered() external {
        require(block.chainid==10143&&msg.sender==lobby&&hub.statusOf(address(this),Types.GLOBAL)==Types.Status.None,"released authority only");
        if(S.get(words,37)!=0&&Game.phase(words)<3){
            // Never append to a released commitment: anyone may already have
            // sealed its final root. Absence from that immutable prefix proves
            // cancellation to the Monad authority, which records the refund.
            S.set(words,0,(S.get(words,0)&~(uint256(7)<<161))|(4<<161));
            S.set(words,8,(S.get(words,8)&~uint256(15))|5);
            emit UnpublishedMatchCancelled(S.get(words,31),S.get(words,37));
        }
    }
    function admit(Admission.Ticket calldata ticket,T.Binding calldata binding,bytes calldata signature) external engine whenNotDelegated(Types.GLOBAL){
        // Six-minute maximum regulation/overtime plus publication margin.
        // This is a conservative time reserve, not a claim of measured hub capacity.
        require(hub.sessionOf(address(this),Types.GLOBAL).expiresAt>block.timestamp+7 minutes,"session admission reserve");
        bytes32 hash=Binding.admit(words,ticket,binding,signature,admissionSigner,lobby,policies);
        Game.initialize(words,classic,kernel);emit AdmissionBound(ticket.epoch,ticket.matchId,ticket.sequence,hash,binding);
    }
    function confirmReady(uint256 epoch,uint256 id) external engine whenNotDelegated(Types.GLOBAL) current(epoch,id){Game.ready(words,kernel,Auth.actor(words,msg.sender));}
    function start(uint256 epoch,uint256 id) external engine whenNotDelegated(Types.GLOBAL) current(epoch,id){Game.start(words,kernel);}
    function cancelUnready(uint256 epoch,uint256 id) external engine whenNotDelegated(Types.GLOBAL) current(epoch,id){
        require(Game.phase(words)==1&&S.get(words,61)!=3&&block.timestamp>S.get(words,62),"loading not expired");
        Game.finish(words,kernel,4,address(0));Game.publish(words,kernel);
    }
    function input(uint256 epoch,uint256 id,int8 direction,uint256 sequence,uint256 deadlineBlock) external engine whenNotDelegated(Types.GLOBAL) current(epoch,id){
        Game.input(words,classic,kernel,policies,hub,Auth.actor(words,msg.sender),direction,sequence,deadlineBlock);
    }
    function tick(uint256 epoch,uint256 id) external engine whenNotDelegated(Types.GLOBAL) current(epoch,id){Game.tick(words,classic,kernel,policies,hub);}
    function concede(uint256 epoch,uint256 id) external engine whenNotDelegated(Types.GLOBAL) current(epoch,id){Game.concede(words,classic,kernel,policies,hub,Auth.actor(words,msg.sender));}
    function submitRandomness(uint256 epoch,uint256 id,uint256 request,bytes calldata signature) external engine whenNotDelegated(Types.GLOBAL) current(epoch,id){Game.randomness(words,classic,kernel,policies,hub,request,signature);}
    function submitLivePressure(ChaosGameFlow.LivePressure calldata,bytes calldata) external pure {revert NoAgentMarkets();}
    function revokeActive(uint256 epoch,uint256 id,address player,uint64 deadline,bytes calldata signature) external engine whenNotDelegated(Types.GLOBAL) current(epoch,id){
        require(Binding.human(words,player),"human controls only");Auth.revoke(words,player,deadline,signature);
    }
    function renewActive(ArenaAuthorizations.Renewal calldata r,bytes calldata signature) external engine whenNotDelegated(Types.GLOBAL){
        require(Game.phase(words)>0&&Game.phase(words)<3&&Binding.human(words,r.player),"active human controls only");Auth.renew(words,r,signature);
    }
    function revocationDigest(address player,uint64 deadline) external view returns(bytes32){return Auth.revokeDigest(words,player,deadline);}
    function renewalDigest(ArenaAuthorizations.Renewal calldata r) external view returns(bytes32){return Auth.renewalDigest(r);}
    function authorizationRevision(address player) external view returns(uint256){return Auth.revision(words,player);}
    function getSnapshot(uint256 id) external view returns(RoomsState.Header memory){S.assertMatch(words,S.get(words,31),id);return Game.snapshot(words,kernel,isEphemeral());}
    function chaosState(uint256 id) external view returns(bytes memory){S.assertMatch(words,S.get(words,31),id);return abi.encode(Game.snapshot(words,kernel,isEphemeral()),Game.packed(words),S.get(words,29),S.get(words,30));}
    function publishedResult() external view returns(Game.Result memory){return Game.result(words,kernel);}
    function launchAt(uint256 id) external view returns(uint64){S.assertMatch(words,S.get(words,31),id);return uint64(S.get(words,60));}
    function readiness(uint256 id) external view returns(uint8,uint64){S.assertMatch(words,S.get(words,31),id);return(uint8(S.get(words,61)),uint64(S.get(words,62)));}
    function _isSessionBlocked(bytes4 selector) internal view override returns(bool){
        // Compact commands are authenticated by their bound direct signer. The
        // generic session wrapper must not turn the contract itself into a signer.
        return selector==this.openEngine.selector||selector==this.closeEngine.selector||selector==this.cancelRecovered.selector
            ||selector==this.admit.selector||selector==this.input.selector||selector==this.confirmReady.selector
            ||selector==this.concede.selector||selector==this.revokeActive.selector||selector==this.renewActive.selector
            ||super._isSessionBlocked(selector);
    }
}
