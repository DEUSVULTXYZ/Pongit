import type { Metadata } from "next";
import localFont from "next/font/local";
import { siteOrigin, socialMetadata } from "../lib/social-metadata";
import { RegionProbe } from "../components/RegionProbe";
import "./arcade.css";
const michroma = localFont({ src: "./fonts/Michroma-Regular.ttf", weight: "400", display: "swap", variable: "--font-michroma" });
export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin),
  title: "PONGIT | Every point onchain",
  description:
    "A fully onchain Pong arena on Monad testnet. Play, watch, and replay verifiable matches.",
  ...socialMetadata(
    "PONGIT | Pong is back · Bring a rival",
    "Your next rival is one click away. Play Classic or Chaos, challenge friends and watch live in the onchain arcade on Monad Testnet.",
    "/",
  ),
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={michroma.variable}>
      <body>{children}<RegionProbe /></body>
    </html>
  );
}
