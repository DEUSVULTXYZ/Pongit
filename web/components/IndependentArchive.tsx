"use client";
import {useEffect,useState} from 'react';
import type {Address} from 'viem';
import {parseRoomReference,type IndependentManifest} from '../../shared/independent';
import {independentReader} from '../../shared/independent-read';
import {independentBase} from '../lib/independent';
import {rememberedAccount,connect} from '../lib/wallet';
import {ArcadeHeader} from './ArcadeChrome';
import {ArcadeProgress} from './ArcadeProgress';
import {IndependentHistory} from './IndependentHistory';
import {IndependentMarket} from './IndependentMarket';

/** An old URL always resolves its original lobby. No permission or game is
 * silently moved to a newer contract with the same numeric id. */
export function IndependentArchive({manifest,roomId}:{manifest:IndependentManifest;roomId:string}){
 const [room,setRoom]=useState<any>(),[error,setError]=useState(''),[player,setPlayer]=useState<Address>(),[busy,setBusy]=useState(false);
 useEffect(()=>{let alive=true;setPlayer(rememberedAccount()?.address as Address|undefined);
  void independentReader(independentBase(),manifest).lobby('room',[parseRoomReference(roomId,manifest.lobby)]).then(r=>{if(alive)setRoom(r);}).catch(()=>{if(alive)setError('This archived room is temporarily unavailable.');});
  return()=>{alive=false;};
 },[manifest.lobby,roomId]);
 return <main className="cabinet-ui rooms-shell"><ArcadeHeader><a className="rooms-button primary" href="/">Play</a></ArcadeHeader>
  <section className="rooms-entry"><h1>Previous human arenas</h1><p>This room belongs to an earlier arena. Your results, replays and withdrawals remain at their original contracts.</p>
   {!room&&!error?<ArcadeProgress stage="loading" title="Loading room history"/>:error?<ArcadeProgress stage="error" detail={error}/>:<p>{room.ranked?'Ranked':'Friendly'} · {room.mode?'Chaos':'Classic'} · Room {room.id.toString()}</p>}
   <a className="rooms-button primary" href="/">Play in the new arenas</a>
   {!player&&<button disabled={busy} onClick={()=>{setBusy(true);void connect().then(identity=>{setPlayer(identity.account.address);identity.end();}).catch(()=>setError('Connection was not completed.')).finally(()=>setBusy(false));}}>Connect to view your history and balance</button>}
   {player&&<><IndependentHistory player={player} lobby={manifest.lobby} rulesVersion={manifest.rulesVersion}/><IndependentMarket manifest={manifest} player={player} historical onBusy={setBusy}/></>}
  </section></main>;
}
