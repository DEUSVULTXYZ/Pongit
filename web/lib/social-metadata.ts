import type { Metadata } from "next";

export const siteOrigin = "https://pongit.xyz";
const image = {
  url: `${siteOrigin}/social/pongit-neon-cabinet-v2.jpg`,
  width: 1200,
  height: 630,
  type: "image/jpeg",
  alt: "PONGIT neon arcade cabinet with the orbital logo, a Pong match and 16-bit ornaments. Pong is back. All Onchain",
};

export function socialMetadata(
  title: string,
  description: string,
  path: string,
): Pick<Metadata, "openGraph" | "twitter"> {
  return {
    openGraph: {
      type: "website",
      siteName: "PONGIT",
      locale: "en_US",
      title,
      description,
      url: new URL(path, siteOrigin).href,
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [{ url: image.url, alt: image.alt }],
    },
  };
}
