import {parseAbi} from 'viem';
export const humanRatingContinuityAbi=parseAbi([
 'function predecessor() view returns(address)',
 'function seedAudit() view returns(bytes32)',
 'function sourceCount() view returns(uint256)',
 'function sourceRevision() view returns(uint256)',
 'function synchronizationCursor() view returns(uint256)',
 'function synchronizeHistory(uint8 budget)',
 'function historyChanged(uint256 offset,uint8 budget) view returns(bool changed,uint256 next)',
]);
