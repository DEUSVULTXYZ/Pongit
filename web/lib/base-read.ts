import {createPublicClient} from 'viem';
import {monadTestnet} from 'viem/chains';
import {baseReadTransport} from '../../shared/base-read-transport';
import {API} from './api';

// One paced client per tab, including actions and observers. A new client for
// every grant read bypassed both multicall grouping and the shared rate budget.
export const browserBase=createPublicClient({chain:monadTestnet,batch:{multicall:{wait:15,batchSize:16384}},transport:baseReadTransport(`${API}/agents/chain-read`)});
