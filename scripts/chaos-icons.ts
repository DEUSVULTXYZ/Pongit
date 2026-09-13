// Repository-owned vector pixel art; no external artwork or runtime image service.
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {chaosEvents} from '../shared/chaos-events';
import {chaosIconSvg} from '../shared/chaos-pixels';
const directory='web/public/chaos/events-v6';
const check=process.argv.includes('--check');
if(!check)await mkdir(directory,{recursive:true});
for(const event of chaosEvents){
 const path=`${directory}/${event.key}.svg`,svg=chaosIconSvg(event.id)+'\n';
 if(check){if(await readFile(path,'utf8')!==svg)throw Error(`Stale Chaos icon: ${event.key}`);}
 else await writeFile(path,svg);
}
console.log(`${check?'Verified':'Generated'} ${chaosEvents.length} original Chaos icons.`);
