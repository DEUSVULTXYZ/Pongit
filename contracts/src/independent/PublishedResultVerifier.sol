// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {PublishedResultTree as Tree} from "../agents/competition/PublishedResultTree.sol";
import {ReusableAdmission as Admission} from "./ReusableAdmission.sol";
import {IInterludeHub} from "../../vendor/interlude/interfaces/IInterludeHub.sol";
import {Types} from "../../vendor/interlude/interfaces/Types.sol";

interface IReusableAdmissionAuthority {
    function issuedTicket(address arena, uint256 epoch, uint256 sequence) external view returns (bytes32);
    function registeredArena(address arena) external view returns (bool);
}
interface IReusableResultRoot {
    function resultCommitment() external view returns (uint256 epoch, uint32 count, bytes32 root);
}

/// Candidate result-proof boundary. It NEVER accepts a caller-supplied root or
/// bridge signature as result authority. A real Monad-issued ticket AND a result
/// in the registered arena's currently published root are required. No payment
/// entry point exists here; consumers retain their own settlement deduplication.
contract PublishedResultVerifier {
    IReusableAdmissionAuthority public immutable authority;
    IInterludeHub public immutable hub;
    struct Root { bytes32 hash; uint32 count; }
    mapping(address => mapping(uint256 => Root)) public finalizedRoots;
    event ResultRootFinalized(address indexed arena, uint256 indexed epoch, bytes32 root, uint32 count);

    constructor(IReusableAdmissionAuthority a, IInterludeHub h) {
        require(block.chainid == 10143 && address(a).code.length > 0 && address(h).code.length > 0, "testnet authority");
        authority = a; hub = h;
    }

    /// Persist only after actual release, before a new epoch overwrites the root.
    /// A permissionless caller triggers this read; it cannot provide root data.
    function sealReleased(address arena) external {
        require(block.chainid == 10143 && authority.registeredArena(arena), "registered Monad arena");
        require(hub.statusOf(arena, Types.GLOBAL) == Types.Status.None, "epoch not released");
        (uint256 epoch, uint32 count, bytes32 root) = IReusableResultRoot(arena).resultCommitment();
        require(epoch != 0 && count <= 65_536 && (count == 0 || root != 0), "result commitment");
        Root storage prior = finalizedRoots[arena][epoch];
        // Separate existence flag would add storage; a zero-count root uses the
        // canonical empty-tree hash as its nonzero identity instead of zero.
        require(root != 0, "uninitialized root");
        require(prior.hash == 0 || prior.hash == root && prior.count == count, "final root changed");
        if (prior.hash == 0) {
            prior.hash = root; prior.count = count;
            emit ResultRootFinalized(arena, epoch, root, count);
        }
    }

    function currentRoot(address arena, uint256 epoch) public view returns (Root memory r, bool finality) {
        require(block.chainid == 10143 && authority.registeredArena(arena), "registered Monad arena");
        r = finalizedRoots[arena][epoch];
        if (r.hash != 0) return (r, true);
        Types.Session memory session = hub.sessionOf(arena, Types.GLOBAL);
        require(session.status != Types.Status.Challenged, "result under review");
        (uint256 actual, uint32 count, bytes32 root) = IReusableResultRoot(arena).resultCommitment();
        require(actual == epoch && epoch != 0 && root != 0 && count <= 65_536, "published epoch");
        finality = session.status == Types.Status.None;
        if (!finality) require(session.epoch == epoch && session.batchIndex > 0, "result not published");
        return (Root(root, count), finality);
    }

    /// Result hash is the complete canonical result (players, scores, rules,
    /// cutoff etc.), committed together with the authoritative admission digest.
    function verify(Admission.Ticket calldata ticket, bytes32 resultHash, uint32 index,
        bytes32[16] calldata proof) external view returns (bool finality)
    {
        bytes32 ticketHash = Admission.digest(ticket);
        require(authority.issuedTicket(ticket.arena, ticket.epoch, ticket.sequence) == ticketHash,
            "ticket not issued by Monad");
        require(ticket.authority == address(authority) && ticket.sequence == uint256(index) + 1
            && resultHash != 0, "result binding");
        (Root memory root, bool final_) = currentRoot(ticket.arena, ticket.epoch);
        bytes32 leaf = Tree.resultLeaf(10143, ticket.arena, ticket.epoch, ticket.matchId,
            keccak256(abi.encode(ticketHash, resultHash)));
        require(Tree.verify(root.hash, root.count, index, leaf, proof), "result proof");
        return final_;
    }
}
