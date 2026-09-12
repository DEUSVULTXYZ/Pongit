import { RoomsHub } from "../../components/RoomsHub";
import {IndependentHub} from "../../components/IndependentHub";
import "./rooms.css";
export const metadata = { title: "PONGIT Rooms", robots: { index: false } };
export const dynamic="force-dynamic";
export default function RoomsPage() {
  if(process.env.PONG_INDEPENDENT_HOME==="true")return <IndependentHub/>;
  return <RoomsHub />;
}
