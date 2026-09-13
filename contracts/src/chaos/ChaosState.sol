// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {ChaosEffects} from "./ChaosEffects.sol";
import {ChaosRally} from "./ChaosRally.sol";
library ChaosState {
    struct Ball {
        int256 x;int256 y;int256 vx;int256 vy;
        uint16 powerN;uint16 powerD;uint16 curveSteps;int8 curveSign;
        uint8 lastHitter;uint16 ghost;bool portalLock;bool warp;bool gravity;
        uint64 gravityUsed;uint32 trailRevision;bool alive;
    }
    struct State {
        Ball[2] balls;ChaosEffects.Effect[2] effects;ChaosRally.Score score;
        int256 left;int256 right;int8 leftDir;int8 rightDir;int8 lastLeft;int8 lastRight;
        uint64 t;uint64 nextForce;uint24 activeMask;uint32 collisionSequence;
        uint32 bettingA;uint32 bettingB;bytes32 seed;bool cancelled;uint8 cancelReason;uint8 stalled;
    }
    struct Collision {uint32 sequence;uint32 rally;uint8 ball;uint8 kind;uint8 obstacle;uint64 at;int256 x;int256 y;}
    struct Candidate {uint64 dt;uint8 kind;uint8 ball;uint8 slot;uint8 obstacle;int256 nx;int256 ny;}
}
