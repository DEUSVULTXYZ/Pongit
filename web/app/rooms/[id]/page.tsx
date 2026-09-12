import { notFound } from "next/navigation";
import { RoomsHub } from "../../../components/RoomsHub";
import {IndependentHub} from "../../../components/IndependentHub";
import {roomRoute} from '../../../../shared/room-route';
import "../rooms.css";
export const metadata = {
  title: "Join a PONGIT room",
  robots: { index: false },
};
export default async function RoomPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const route=roomRoute((await params).id);
  if(!route)notFound();
  return route.kind==='independent'?<IndependentHub roomId={route.id}/>:<RoomsHub roomId={route.id}/>;
}
