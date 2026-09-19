// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {CompetitionTypes as T} from "./CompetitionTypes.sol";

library TournamentRules {
    function betterSeed(address a,address b,uint32 eloA,uint32 eloB) internal pure returns(address){
        return eloA>eloB||eloA==eloB&&a<b?a:b;
    }
    function leaguePair(uint8 index) internal pure returns(uint8 a,uint8 b){
        require(index<28,"league fixture");
        for(uint8 i;i<7;i++)for(uint8 j=i+1;j<8;j++){if(index==0)return(i,j);index--;}
        revert("unreachable fixture");
    }
    function parent(uint8 index) internal pure returns(uint8){
        require(index<7,"knockout fixture");return index<4?4+index/2:index<6?6:7;
    }
    function betterStanding(T.Standing memory a,T.Standing memory b) internal pure returns(bool){
        if(a.points!=b.points)return a.points>b.points;
        if(a.difference!=b.difference)return a.difference>b.difference;
        if(a.wins!=b.wins)return a.wins>b.wins;
        return betterSeed(a.agent,b.agent,a.initialElo,b.initialElo)==a.agent;
    }
    function sort(T.Standing[8] memory rows) internal pure returns(T.Standing[8] memory){
        for(uint8 i=1;i<8;i++){T.Standing memory entry=rows[i];uint8 j=i;
            while(j>0&&betterStanding(entry,rows[j-1])){rows[j]=rows[j-1];j--;}
            rows[j]=entry;
        }return rows;
    }
}
