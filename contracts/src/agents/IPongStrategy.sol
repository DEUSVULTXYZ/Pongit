// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @notice An agent that plays PONGIT from the chain itself.
/// @dev The arcade calls `decide` for this seat on every 100 ms slice of game time, under STATICCALL
///      and with a fixed gas budget (`AgentSteer.STRATEGY_GAS`, 50,000). It must be a pure function of
///      the view: it cannot write, and it cannot see anything newer than the Monad state the current
///      epoch was pinned to. A revert, running out of gas, or any answer other than -1, 0 or 1 leaves
///      the paddle doing what it was doing.
///
///      Deploy it on Monad Testnet, then register it through the arcade's service with your creator
///      key. Each epoch runs against Monad state pinned when it opened, so only a strategy that
///      existed at that block can be registered, and it is then queued for qualification at once.
///      On the legacy service, registering after the epoch opened is too early: it is refused
///      (AGENT_STRATEGY_NEXT_EPOCH) and nothing is recorded, so it never becomes playable by
///      itself. Send the same registration again after the arcade's next renewal; run again,
///      `agent-sdk/strategy.ts` does that for the same contract, without deploying another.
///      The independent pool registers strategies on Monad before opening their arena.
///      Its StrategyCode check disallows storage, external calls and block-dependent inputs.
///      Build its immutable example with FOUNDRY_PROFILE=strategies, without CBOR metadata.
interface IPongStrategy {
    /// A live ball. Positions are in pico-pixels (1e12 per pixel), velocities in micro-pixels per
    /// second (1e6 per pixel/s). The table is 1024 x 576 pixels, y grows downwards.
    struct PongBall {
        int256 x;
        int256 y;
        int256 vx;
        int256 vy;
    }

    /// Everything a strategy sees, from its own seat. Side 0 defends x = 40 px, side 1 x = 984 px.
    /// `half` is the seat's base paddle half-height. Under Chaos that is half the height its betting
    /// weight sets, and it does not follow the paddle-size effects: MEGA PADDLE and BOSS ROUND scale
    /// the real paddle by 5/4, POCKET PADDLE and GLASS CANNON by 4/5 (within 64 to 120 px of height),
    /// SIZE SWAP exchanges the two sides' base sizes, and SPLIT PADDLE opens a 16 px gap at its
    /// centre that cannot return the ball while reaching 8 px further out. Keep a margin rather
    /// than aim with the paddle's edge. Reporting the effective size changes the arcade contract,
    /// so historical single-application deployments retain that behavior. Pooled rules 10
    /// report effective half-height including size effects. SPLIT PADDLE's central gap
    /// still has no collision. The ABI remains identical across these versions.
    struct PongView {
        uint8 mode; // 0 Classic, 1 Chaos
        uint8 side; // 0 left, 1 right
        uint64 t; // game time, microseconds since the serve of the match
        int256 paddle; // own paddle centre, y, pico-pixels
        int256 half; // own paddle base half-height, pico-pixels; Chaos size effects not included
        int256 opponent; // opponent paddle centre, y, pico-pixels
        uint8 scoreSelf;
        uint8 scoreOther;
        PongBall[] balls; // live balls only: none between points, two under Chaos MULTIBALL
    }

    /// @return direction -1 moves the paddle up (towards y = 0), 1 down, 0 holds it.
    function decide(PongView calldata v) external view returns (int8 direction);

    /// @return The creator key allowed to register this strategy. Its owner signs the registration.
    function creator() external view returns (address);
}
