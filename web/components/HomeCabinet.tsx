"use client";
import {Avatar,type PublicProfile} from "./PublicProfile";
export function HomeCabinet({mode,setMode,busy,active,play,challenge,watch,profile,editProfile}:{mode:number;setMode:(n:number)=>void;busy:boolean;active:boolean;play:()=>void;challenge:()=>void;watch:()=>void;profile:PublicProfile|null;editProfile:()=>void}){
 return <section className="home-cabinet" aria-label="PONGIT arcade cabinet">
   <div className="cabinet-marquee"><span className="marquee-star">✦</span><span>PONGIT</span><span className="marquee-star">✦</span><small>ONE MORE GAME.</small></div>
   <div className="cabinet-bezel"><div className="cabinet-screen">
     <span className="cabinet-edition">PLAYER ONE / READY</span>
     <h1>Good rivals.<br/><em>Great nights.</em></h1>
     <div className="cabinet-pong" aria-hidden="true"><i/><b/><i/></div>
     <button className="primary play-now" disabled={busy} onClick={play}>{busy?"Please wait…":active?"Resume match":"Play now"}<span aria-hidden="true">↗</span></button>
     <p className="play-caption">{mode===1?"Chaos":"Classic"} · Ranked · Free to play</p>
     <div className="cabinet-mode" role="group" aria-label="Game mode"><button aria-pressed={mode===0} disabled={busy||active} onClick={()=>setMode(0)}>Classic</button><button aria-pressed={mode===1} disabled={busy||active} onClick={()=>setMode(1)}>Chaos</button></div>
     {mode===1 && <p className="mode-description">The crowd can shrink the favourite’s paddle.</p>}
   </div></div>
   <div className="cabinet-deck"><div aria-hidden="true" className="deck-joystick"><i/></div><span>FIRST TO SEVEN<br/><small>GAS IS ON US</small></span><div className="deck-buttons" aria-hidden="true"><i/><i/></div></div>
   <button className="home-player-tag" aria-label={profile?.handle?"Edit your profile":"Create your profile"} disabled={busy} onClick={editProfile}><Avatar index={profile?.avatar||0}/><span><small>YOUR PLAYER TAG</small><strong>{profile?.handle||"Make a name for yourself"}</strong></span><span className="profile-tag-action">{profile?.handle?"Edit":"Add username"} ↗</span></button>
   <div className="home-shortcuts"><button onClick={challenge}>Challenge a friend <span>↗</span></button><button onClick={watch}>Watch live <span>↗</span></button></div>
 </section>;
}
