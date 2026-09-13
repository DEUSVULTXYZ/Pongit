// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Test} from "forge-std/Test.sol";
import {ChaosGeometry,ChaosGeometryHarness} from "../src/chaos/ChaosGeometry.sol";
contract ChaosGeometryTest is Test {
    ChaosGeometryHarness rules=new ChaosGeometryHarness();
    int256 constant P=1e12;int256 constant V=1e6;
    function testSweptCircleDoesNotTunnelAcrossOneFastStep() public view {
        ChaosGeometry.Hit memory h=rules.circle(-100*P,0,10000*V,0,34*P,false);
        assertEq(h.dt,6600);assertEq(h.nx,-34*P);assertEq(h.ny,0);
    }
    function testEntryExitOverlapAndZeroVelocity() public view {
        assertEq(rules.circle(0,0,200*V,0,24*P,false).dt,type(uint64).max);
        assertEq(rules.circle(0,0,200*V,0,24*P,true).dt,120000);
        assertEq(rules.circle(24*P,0,200*V,0,24*P,true).dt,0);
        assertEq(rules.circle(-100*P,0,0,0,24*P,false).dt,type(uint64).max);
        assertEq(rules.circle(-100*P,50*P,200*V,0,24*P,false).dt,type(uint64).max);
    }
    function testFuzzCircleArrivalIndependentOfCallPartition(uint32 raw,uint32 part) public view {
        int256 velocity=int256(uint256(raw)%10000000000+1);
        ChaosGeometry.Hit memory first=rules.circle(-200*P,10*P,velocity,0,34*P,false);
        uint64 before=uint64(uint256(part)%(uint256(first.dt)+1));
        ChaosGeometry.Hit memory second=rules.circle(-200*P+velocity*int256(uint256(before)),10*P,velocity,0,34*P,false);
        // At the rounded arrival the centre may already be microscopically
        // inside; the collision must be resolved before another search.
        if(before<first.dt){assertEq(uint256(before)+second.dt,first.dt);assertEq(second.nx,first.nx);assertEq(second.ny,first.ny);}
    }
    function testRectangleCornerTieIsStableAndInteriorIsIgnored() public view {
        ChaosGeometry.Hit memory h=rules.rect(-40*P,-20*P,200*V,200*V,34*P,14*P);
        assertEq(h.dt,30000);assertEq(h.nx,-1);assertEq(h.ny,0);
        assertEq(rules.rect(0,0,200*V,200*V,34*P,14*P).dt,type(uint64).max);
    }
    function testZeroComponentsDoNotDivideByZero() public view {
        assertEq(rules.rect(-100*P,0,200*V,0,34*P,14*P).dt,330000);
        assertEq(rules.rect(0,-100*P,0,200*V,34*P,14*P).dt,430000);
        assertEq(rules.rect(0,-100*P,0,0,34*P,14*P).dt,type(uint64).max);
    }
    function testReflectionAndRotationPreserveSpeedWithinIntegerRounding() public view {
        (int256 x,int256 y)=rules.reflect(200*V,100*V,1,0);assertEq(x,-200*V);assertEq(y,100*V);
        (x,y)=rules.reflect(200*V,100*V,1,1);assertEq(x,-100*V);assertEq(y,-200*V);
        (x,y)=rules.rotate(200*V,0,349065850399);
        assertApproxEqAbs(x,187938524,2);assertApproxEqAbs(y,68404028,2);
        (x,y)=rules.rotate(x,y,-349065850399);assertApproxEqAbs(x,200*V,3);assertApproxEqAbs(y,0,3);
    }
    function testNumericImpossibilityIsExplicit() public {
        vm.expectRevert(ChaosGeometry.NumericRange.selector);rules.circle(type(int256).max,0,1,0,P,false);
        vm.expectRevert(ChaosGeometry.NumericRange.selector);rules.reflect(200*V,0,0,0);
        vm.expectRevert(ChaosGeometry.NumericRange.selector);rules.rotate(200*V,0,1e12);
    }
}
