// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {PongInterludeRoomsChaos} from "./PongInterludeRoomsChaos.sol";
import {PhysicsV2} from "../v2/PhysicsV2.sol";
import {IInterludeHub} from "../../vendor/interlude/interfaces/IInterludeHub.sol";
import {Types} from "../../vendor/interlude/interfaces/Types.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {DelegatedLayout} from "../../vendor/interlude/libraries/DelegatedLayout.sol";

/// @notice Provisional testnet-only bridge, authorized by the project owner.
/// The VPS attests gross paid MON pressure. This is NOT a trustless chain proof.
/// This key cannot move funds, set a score or choose a winner.
contract PongRoomsTestnet is PongInterludeRoomsChaos {
    address public immutable pressureSigner;
    bytes32 private immutable pressureDomain;
    bytes32 private constant PRESSURE_TYPEHASH = keccak256(
        "Pressure(uint256 matchId,uint8 rally,uint64 resumeAt,uint128 paidA,uint128 paidB,uint64 sourceBlock,bytes32 checkpoint,uint64 expires)"
    );

    struct Attestation {
        uint256 matchId;
        uint8 rally;
        uint64 resumeAt;
        uint128 paidA;
        uint128 paidB;
        uint64 sourceBlock;
        bytes32 checkpoint;
        uint64 expires;
    }
    event PressureAttested(
        uint256 indexed matchId, uint8 rally, uint64 sourceBlock, bytes32 checkpoint, uint256 paidA, uint256 paidB
    );

    constructor(IInterludeHub h, address admission, address bridge) PongInterludeRoomsChaos(h, admission) {
        require(block.chainid == 10143 && bridge != address(0), "testnet only");
        pressureSigner = bridge;
        pressureDomain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("PONGIT Testnet Pressure"),
                keccak256("1"),
                block.chainid,
                address(this)
            )
        );
    }

    function pressureDigest(Attestation calldata p) public view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", pressureDomain, keccak256(abi.encode(PRESSURE_TYPEHASH, p))));
    }

    function submitPressure(Attestation calldata p, bytes calldata signature)
        external
        engine
        whenNotDelegated(Types.GLOBAL)
    {
        PhysicsV2.State memory s = _state(p.matchId);
        if (
            _phase(p.matchId) != 2 || s.mode != 1 || !s.awaitingServe || p.rally != s.scoreA + s.scoreB
                || p.resumeAt != s.resumeAt || p.checkpoint == bytes32(0) || p.sourceBlock == 0
                || p.expires <= block.timestamp || p.expires > block.timestamp + 30 || p.paidA < _get(p.matchId, 14)
                || p.paidB < _get(p.matchId, 15)
        ) revert InvalidPressure();
        if (ECDSA.recover(pressureDigest(p), signature) != pressureSigner) revert InvalidPressure();
        uint256 packed = _get(p.matchId, 16);
        uint256 totals = uint256(p.paidA) | (uint256(p.paidB) << 128);
        if (uint8(packed) == p.rally && uint64(packed >> 8) == p.resumeAt) {
            // Refresh expiry after transport failure; the frozen cutoff and amounts
            // cannot be revised, even with another valid bridge signature.
            if (
                _get(p.matchId, 17) != totals || bytes32(_get(p.matchId, 18)) != p.checkpoint
                    || uint64(packed >> 136) != p.sourceBlock
            ) revert InvalidPressure();
            if (p.expires <= uint64(packed >> 72)) return;
        }
        _set(
            p.matchId,
            16,
            uint256(p.rally) | (uint256(p.resumeAt) << 8) | (uint256(p.expires) << 72) | (uint256(p.sourceBlock) << 136)
        );
        _set(p.matchId, 17, totals);
        _set(p.matchId, 18, uint256(p.checkpoint));
        emit PressureAttested(p.matchId, p.rally, p.sourceBlock, p.checkpoint, p.paidA, p.paidB);
    }

    function _verifiedPressure(uint256 id, uint8 rally, uint64 at) internal view override returns (Pressure memory p) {
        uint256 m = _get(id, 16);
        if (uint8(m) != rally || uint64(m >> 8) != at || uint64(m >> 72) <= block.timestamp) return p;
        uint256 total = _get(id, 17);
        return Pressure(true, uint128(total), uint128(total >> 128), bytes32(_get(id, 18)));
    }
}

/// @notice Public testnet deployment wrapper. These are public service identities,
/// never private signing material. The existing admission identity is retained.
contract PongRoomsTestnetRelease is PongRoomsTestnet {
    address public constant operator = 0x369158Ac444278541322643E46e0D5b45ac21C4C;
    address public constant previousClassic = 0xB3F9C323Ffb8eC6A8cD7D06aE239BC3D7bEbD59A;
    constructor(IInterludeHub h)
        PongRoomsTestnet(h, 0x6e0EbC79d80a186A639843C4059f421D634C3d73, 0x15E6B4C9fecAC754cE2D9052b6060DD5920e7659)
    {}

    /// @notice Operational renewal only; no caller may edit match state or ratings.
    /// Admission is drained and pending publications checked by the coordinator before closing.
    function closeEngine() external {
        require(block.chainid == 10143 && msg.sender == operator, "base operator only");
        require(activeCount() == 0, "active published matches");
        hub.closeDelegation(Types.GLOBAL);
    }
    function renewEngine() external payable {
        require(block.chainid == 10143 && msg.sender == operator, "base operator only");
        require(hub.statusOf(address(this), Types.GLOBAL) == Types.Status.None, "delegation pending");
        DelegatedLayout.Layout storage l = DelegatedLayout.layout();
        hub.openDelegation{value:msg.value}(Types.GLOBAL,l.globalSlots,l.globalMappingBases,address(0),l.owner,l.minStake);
    }
    function _startingRating(address player, uint8 mode) internal view override returns (Rating memory r) {
        if(mode == 1) return super._startingRating(player,mode);
        (bool ok,bytes memory data)=previousClassic.staticcall(abi.encodeWithSignature("ratingOf(address)",player));
        require(ok && data.length == 128, "previous ranking unavailable");
        r=abi.decode(data,(Rating));r.season=currentSeason();
    }
    function _isSessionBlocked(bytes4 selector) internal view override returns (bool) {
        return selector==this.closeEngine.selector || selector==this.renewEngine.selector || super._isSessionBlocked(selector);
    }
}
