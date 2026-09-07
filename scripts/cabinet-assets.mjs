import sharp from "sharp";
import {mkdir, writeFile} from "node:fs/promises";

// The original transparent atlas is retained so every shipped sprite is reproducible.
const source = "artwork/neon-cabinet/sprites-source.png";
const destination = "web/public/art/pixels";
await mkdir(destination, {recursive:true});
const {width,height} = await sharp(source).metadata();
const names = ["cabinet","joystick","planet","star"];
const size = 96;
for (let row=0; row<names.length; row++) {
  const frames=[];
  for (let column=0; column<8; column++) {
    // Use the first frame again at the end to give each ornament a quiet rest pose.
    const index=column===7?0:column;
    const left=Math.round(index*width/8),top=Math.round(row*height/4);
    const frame=await sharp(source).extract({left,top,width:Math.round((index+1)*width/8)-left,height:Math.round((row+1)*height/4)-top})
      .resize(size,size,{kernel:"nearest"}).png().toBuffer();
    frames.push({input:frame,left:column*size,top:0});
  }
  await sharp({create:{width:size*8,height:size,channels:4,background:{r:0,g:0,b:0,alpha:0}}})
    .composite(frames).png({palette:true,quality:100,effort:10}).toFile(`${destination}/${names[row]}.png`);
}
await writeFile(`${destination}/manifest.json`,JSON.stringify({frameSize:size,frames:8,cycleMs:12000,activeMs:1000,offsetsMs:[0,3000,6000,9000],sprites:names},null,2)+"\n");
console.log("Built four transparent, eight-frame cabinet sprites.");
