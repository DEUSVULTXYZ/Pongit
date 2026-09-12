import {readFile,stat} from 'node:fs/promises';
const path=process.argv[2];if(!/^\/secrets\/independent-browser-v2(-chaos)?(-[a-z0-9]{1,16})?\.json$/.test(path))throw Error('Test journal only');
const p=JSON.parse(await readFile(path,'utf8'));
console.log(JSON.stringify({lobby:p.lobby,stage:p.stage,players:p.players.map((p:any)=>({address:p.address,handle:p.handle})),room:p.roomUrl,match:p.matchRef,updated:(await stat(path)).mtime.toISOString()}));
