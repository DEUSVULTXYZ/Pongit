import {build} from 'esbuild';
import {execFileSync} from 'node:child_process';
execFileSync(process.execPath,['node_modules/typescript/bin/tsc','-p','agent-sdk/tsconfig.json'],{stdio:'inherit',windowsHide:true});
await build({entryPoints:['agent-sdk/src/index.ts'],outfile:'agent-sdk/dist/agent-sdk/src/index.js',bundle:true,format:'esm',platform:'neutral',target:'es2022',
 external:['viem','viem/*','@interludelayer-sdk/sdk'],sourcemap:true,legalComments:'eof'});
await build({entryPoints:['agent-sdk/pool-strategy.ts'],outfile:'agent-sdk/dist/pool-strategy.js',bundle:true,format:'esm',platform:'node',target:'node24',
 external:['viem','viem/*','@interludelayer-sdk/sdk'],banner:{js:'#!/usr/bin/env node'},sourcemap:true,legalComments:'eof'});
console.log('Built the Agent Arcade SDK and declarations. Candidate service activation is a separate gate.');
