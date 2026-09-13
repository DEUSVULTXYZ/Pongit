// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @notice Stateless scoring for the new kernel. Inputs must be the goals found
/// at the same earliest collision time, not separate calls for each ball.
contract ChaosRally {
    struct Score { uint8 a; uint8 b; uint32 rally; bool finished; uint8 winner; }
    error InvalidGoalState();
    function resolve(Score memory s,uint8 simultaneousGoals,bool jackpot) external pure returns(Score memory,bool point,bool newResult) {
        if(s.a>7||s.b>7||simultaneousGoals>3)revert InvalidGoalState();
        if(s.finished||simultaneousGoals==0)return(s,false,false);
        if(s.a>=7||s.b>=7)revert InvalidGoalState();
        // 1 means a goal for A, 2 for B. Repeated same-side goals collapse to
        // the same bit; opposite goals void the rally. Either advances its ID.
        s.rally++;
        if(simultaneousGoals==3)return(s,false,false);
        uint8 delta=jackpot?2:1;
        if(simultaneousGoals==1)s.a=s.a+delta>7?7:s.a+delta;
        else s.b=s.b+delta>7?7:s.b+delta;
        s.finished=s.a>=7||s.b>=7;
        if(s.finished)s.winner=s.a>=7?1:2;
        return(s,true,s.finished);
    }
}
