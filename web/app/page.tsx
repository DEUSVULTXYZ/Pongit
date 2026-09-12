import { Arena } from "../components/Arena";
import {RoomsHub} from "../components/RoomsHub";
import {IndependentHub} from "../components/IndependentHub";
import "./rooms/rooms.css";
export const dynamic="force-dynamic";
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const params=await searchParams;
  const oldLink=!!(params.challenge||params.match||params.deployment||params.replay);
  if(!oldLink&&process.env.PONG_INDEPENDENT_HOME==="true")return <IndependentHub/>;
  return process.env.PONG_ROOMS_HOME==="true"&&!oldLink?<RoomsHub/>:<Arena/>;
}
