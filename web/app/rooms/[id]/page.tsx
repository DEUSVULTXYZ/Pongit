import { notFound } from "next/navigation";
import { RoomsHub } from "../../../components/RoomsHub";
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
  const { id } = await params;
  if (!/^0x[0-9a-f]{64}$/.test(id)) notFound();
  return <RoomsHub roomId={id} />;
}
