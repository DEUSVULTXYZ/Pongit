import "../rooms/rooms.css";
import { Arena } from "../../components/Arena";
export const metadata = { title: "PONGIT V4 arcade" };
export default function LegacyPage() {
  return (
    <>
      <div className="legacy-banner">
        V4 arcade · Chaos, tournaments, betting and previous balances{" "}
        <a href="/">Back to Interlude ↗</a>
      </div>
      <Arena />
    </>
  );
}
