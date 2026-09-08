/** Pre-rendered artwork; no animation loop or interactive element. */
export function PixelPalaceArt({ kind }: { kind: "match" | "invite" | "room" }) {
  return <img className="palace-art" src={`/art/pixel-palace/${kind}.webp`}
    srcSet={`/art/pixel-palace/${kind}-small.webp 192w, /art/pixel-palace/${kind}.webp 512w`}
    sizes="(max-width: 767px) 88px, 280px" width={512} height={512}
    alt="" aria-hidden="true" draggable={false} decoding="async" />;
}
