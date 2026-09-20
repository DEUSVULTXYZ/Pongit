import {readFile,writeFile} from 'node:fs/promises';
const names=['ArcadeFamily','IndependentLobby','IndependentArena','IndependentSettlement','IndependentEventsLobby','IndependentEventsArena','ReadyIndependentEventsArena','ReadyIndependentEventsLobby','IndependentEventsSettlement','ReusableEventsArena','ReusableEventsLobby','ReusableEventsSettlement','PublishedResultVerifier','RealtimeMarket','PublishedRatings','ProfileRegistry','PrivateDataStore','RoomsVault','MarketV4','IInterludeHub','ContractLobby'] as const;
for(const name of names){
 const a=JSON.parse(await readFile(`contracts/out/${name}.sol/${name}.json`,'utf8'));
 await writeFile(`shared/abi-independent-${name}.ts`,`// Generated from ${name}.sol. Public interfaces only.\nexport const abi=${JSON.stringify(a.abi)} as const;\n`);
}
