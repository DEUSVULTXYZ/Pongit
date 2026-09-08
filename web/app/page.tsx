import { Arena } from "../components/Arena";
import {RoomsHub} from "../components/RoomsHub";
import "./rooms/rooms.css";
export const dynamic="force-dynamic";
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const params=await searchParams;
  const oldLink=!!(params.challenge||params.match||params.deployment||params.replay);
  return process.env.PONG_ROOMS_HOME==="true"&&!oldLink?<RoomsHub/>:<Arena/>;
}
