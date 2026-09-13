// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {DrandEvmnet} from "../chaos/DrandEvmnet.sol";
import {Delegatable} from "../../vendor/interlude/Delegatable.sol";
import {Delegated} from "../../vendor/interlude/libraries/Delegated.sol";
import {IInterludeHub} from "../../vendor/interlude/interfaces/IInterludeHub.sol";
import {Types} from "../../vendor/interlude/interfaces/Types.sol";
import {DelegatedLayout} from "../../vendor/interlude/libraries/DelegatedLayout.sol";

/// @notice Disposable qualification only. No players, funds or production role.
/// A future round is committed by the base-chain deployment, before delegation.
contract DrandHostedProbe is Delegatable {
    bytes32 private provenRandomness;
    bytes32 private provenDraw;
    uint64 private provenEpoch;
    DrandEvmnet public immutable verifier;
    uint64 public immutable expectedRound;
    uint64 public immutable committedAt;
    address public constant OPERATOR = 0x369158Ac444278541322643E46e0D5b45ac21C4C;
    event BeaconVerified(uint64 indexed round, uint64 indexed epoch, bytes32 randomness, bytes32 draw);
    error WrongRound();
    error AlreadyVerified();
    error EngineOnly();

    constructor(IInterludeHub h) Delegatable(h) {
        require(block.chainid == 10143, "testnet only");
        _registerGlobal(Delegated.Bytes32Slot.wrap(bytes32(uint256(0))));
        _registerGlobal(Delegated.Bytes32Slot.wrap(bytes32(uint256(1))));
        _registerGlobal(Delegated.Uint256Slot.wrap(bytes32(uint256(2))));
        verifier = new DrandEvmnet();
        committedAt = uint64(block.timestamp);
        expectedRound = verifier.roundAfter(uint64(block.timestamp + 180));
    }

    function result() external view returns (bytes32 randomness, bytes32 draw, uint64 epoch) {
        return (provenRandomness, provenDraw, provenEpoch);
    }

    function verifyOnly(uint64 round, bytes calldata signature) external view returns (bytes32) {
        return verifier.verify(round, signature);
    }

    function prove(uint64 round, bytes calldata signature) external whenNotDelegated(Types.GLOBAL) {
        if (!isEphemeral()) revert EngineOnly();
        if (round != expectedRound) revert WrongRound();
        if (provenEpoch != 0) revert AlreadyVerified();
        uint256 currentEpoch = hub.sessionOf(address(this), Types.GLOBAL).epoch;
        require(currentEpoch != 0 && currentEpoch <= type(uint64).max, "invalid epoch");
        uint64 epoch = uint64(currentEpoch);
        bytes32 randomness = verifier.verify(round, signature);
        bytes32 draw = keccak256(abi.encode("PONGIT_DRAND_QUALIFICATION_V1", uint256(10143), address(this), epoch, round, randomness));
        provenRandomness = randomness;
        provenDraw = draw;
        provenEpoch = epoch;
        emit BeaconVerified(round, epoch, randomness, draw);
    }

    function closeProbe() external {
        require(block.chainid == 10143 && msg.sender == OPERATOR, "base operator only");
        hub.closeDelegation(Types.GLOBAL);
    }

    /// Recover a non-creating hosted delegation failure without deploying again.
    function openProbe() external payable {
        require(block.chainid == 10143 && msg.sender == OPERATOR, "base operator only");
        require(provenEpoch == 0, "probe already completed");
        require(hub.statusOf(address(this),Types.GLOBAL) == Types.Status.None, "delegation exists");
        DelegatedLayout.Layout storage l=DelegatedLayout.layout();
        hub.openDelegation{value:msg.value}(Types.GLOBAL,l.globalSlots,l.globalMappingBases,address(0),l.owner,l.minStake);
    }
}
