// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {AgentCatalog} from "./AgentCatalog.sol";
import {AgentArenaTypes as A} from "./AgentArenaTypes.sol";
import {CompetitionTypes as T} from "./CompetitionTypes.sol";
import {ReusableAgentArena} from "./ReusableAgentArena.sol";
import {ReusableAdmission as Admission} from "../../independent/ReusableAdmission.sol";
import {IInterludeHub} from "../../../vendor/interlude/interfaces/IInterludeHub.sol";
import {Types} from "../../../vendor/interlude/interfaces/Types.sol";

/// Immutable linked code executing in the pool's storage and identity. Moving
/// ticket construction here leaves room for five lanes within the runtime limit.
library ReusablePoolAdmission {
    error InactiveAdmissionEpoch();
    error InvalidAdmissionSourceBlock();
    event AdmissionIssued(bytes32 indexed ref,address indexed arena,uint256 indexed epoch,Admission.Ticket ticket,A.Binding binding);
    function prepare(AgentCatalog catalog,IInterludeHub hub,ReusableAgentArena arena,A.Binding memory binding,
        mapping(bytes32=>Admission.Ticket) storage tickets,mapping(bytes32=>A.Binding) storage bindings,
        mapping(address=>mapping(uint256=>mapping(uint256=>bytes32))) storage issued) external
    {
        Types.Session memory session=hub.sessionOf(address(arena),Types.GLOBAL);
        if(binding.epoch!=session.epoch||session.status!=Types.Status.Active)revert InactiveAdmissionEpoch();
        if(binding.controlA.codeHash!=0)require(catalog.identity(binding.a).house!=0||catalog.registeredBlock(binding.a)<=session.baseBlock,"first strategy awaits a newer arena");
        if(binding.controlB.codeHash!=0)require(catalog.identity(binding.b).house!=0||catalog.registeredBlock(binding.b)<=session.baseBlock,"second strategy awaits a newer arena");
        if(block.number<=1||block.number-1>type(uint64).max)revert InvalidAdmissionSourceBlock();binding.preparedBlock=uint64(block.number-1);
        (,uint32 count,)=arena.resultCommitment();
        Admission.Ticket memory ticket=Admission.Ticket(address(this),address(arena),binding.epoch,uint256(count)+1,binding.id,
            keccak256(abi.encode(binding)),uint64(block.timestamp),uint64(block.timestamp+120),binding.preparedBlock,blockhash(binding.preparedBlock),15);
        require(ticket.sourceHash!=0&&issued[address(arena)][ticket.epoch][ticket.sequence]==0,"fresh ticket source");
        bytes32 key=T.key(T.Ref(10143,address(arena),binding.epoch,binding.id));
        tickets[key]=ticket;bindings[key]=binding;issued[address(arena)][ticket.epoch][ticket.sequence]=Admission.digest(ticket);
        emit AdmissionIssued(key,address(arena),ticket.epoch,ticket,binding);
    }
}
