import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";

const source = "artwork/pixel-palace", dest = "web/public/art/pixel-palace";
await mkdir(dest, {recursive:true});
for (const name of ["match", "invite", "room"]) {
  const meta = await sharp(`${source}/${name}.png`).metadata();
  if (!meta.hasAlpha) throw Error(`${name} must retain its transparent background`);
  for (const [suffix, size] of [["",512],["-small",192]]) {
    await sharp(`${source}/${name}.png`).resize(size,size,{fit:"contain"})
      .webp({quality:88,alphaQuality:95}).toFile(`${dest}/${name}${suffix}.webp`);
  }
}
await sharp(`${source}/hall.png`).resize(1920).webp({quality:82}).toFile(`${dest}/hall.webp`);
await sharp(`${source}/hall.png`).resize(960).webp({quality:78}).toFile(`${dest}/hall-small.webp`);

// Nine-slice stepped frames retain their bevel width at every viewport size.
const outline = "M32 2H168V10H184V18H192V32H198V168H190V184H182V192H168V198H32V190H16V182H8V168H2V32H10V16H18V8H32Z";
for (const [name, light, mid, shade] of [
  ["cyan", "#b7fcff", "#2ad9f9", "#12467e"],
  ["pink", "#ffe0ff", "#ed63e8", "#701da6"],
  ["gold", "#fff0b2", "#ffc651", "#90552c"],
  ["violet", "#c5beff", "#8b73e7", "#382886"],
]) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
<defs><linearGradient id="metal" x2=".8" y2="1"><stop stop-color="${mid}"/><stop offset=".08" stop-color="${shade}"/><stop offset=".45" stop-color="#141340"/><stop offset=".9" stop-color="${shade}"/><stop offset="1" stop-color="#090b20"/></linearGradient><linearGradient id="glass" x2=".7" y2="1"><stop stop-color="#171340"/><stop offset=".5" stop-color="#080e24"/><stop offset="1" stop-color="#110a27"/></linearGradient></defs>
<path d="${outline}" fill="#040618" stroke="#020411" stroke-width="3"/>
<path d="${outline}" transform="translate(2 2) scale(.98 .96)" fill="url(#metal)" stroke="${mid}" stroke-width="1.5"/>
<path d="M34 7H166V15H180V23H186V34H192V164" fill="none" stroke="${light}" stroke-width="2"/>
<path d="M13 166V181H23V187H34V192H164" fill="none" stroke="${shade}" stroke-width="4"/>
<path d="M36 20H164V28H176V36H180V164H172V176H164V180H36V172H24V164H20V36H28V24H36Z" fill="url(#glass)" stroke="${mid}" stroke-width="1.5"/>
<path d="M37 23H163M23 37V163" fill="none" stroke="${light}" opacity=".4"/>
<g fill="${mid}"><path d="M17 31h5v5h-5zM25 23h5v5h-5zM169 173h5v5h-5zM177 165h5v5h-5z"/></g>
<g fill="#060519" stroke="${light}" stroke-opacity=".4" stroke-width=".7"><circle cx="35" cy="35" r="2.3"/><circle cx="165" cy="35" r="2.3"/><circle cx="35" cy="165" r="2.3"/><circle cx="165" cy="165" r="2.3"/></g></svg>`;
  await writeFile(`${dest}/frame-${name}.svg`, svg+"\n");
}
console.log("Pixel Palace: responsive artwork, static hall and four nine-slice frames built.");
