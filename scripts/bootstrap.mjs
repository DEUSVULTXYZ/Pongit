import {existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const revision='886b4f8b63409ef474542de6394d25a9b5908ed3';
if(!existsSync('contracts/lib/forge-std/src/Test.sol')){
  execFileSync('git',['clone','https://github.com/foundry-rs/forge-std','contracts/lib/forge-std'],{stdio:'inherit'});
  execFileSync('git',['-C','contracts/lib/forge-std','checkout',revision],{stdio:'inherit'});
}
console.log('Foundry test dependency ready.');
