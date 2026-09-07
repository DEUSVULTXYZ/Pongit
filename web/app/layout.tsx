import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import "./neon-rush.css";
import "./cabinet.css";
const michroma = localFont({ src: "./fonts/Michroma-Regular.ttf", weight: "400", display: "swap", variable: "--font-michroma" });
export const metadata: Metadata = {
  title: "PONGIT — Every point onchain",
  description:
    "A fully onchain Pong arena on Monad testnet. Play, watch, and replay verifiable matches.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={michroma.variable}>
      <body>{children}</body>
    </html>
  );
}
