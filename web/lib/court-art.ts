/** Static arena art, rasterized once. It never participates in simulation. */
export function createCourtSurface() {
  const surface = document.createElement("canvas");
  surface.width = 1024; surface.height = 576;
  const ctx = surface.getContext("2d")!;
  ctx.fillStyle = "#040711";
  ctx.fillRect(0, 0, 1024, 576);
  const floor = ctx.createRadialGradient(512, 288, 20, 512, 288, 580);
  floor.addColorStop(0, "#060b17"); floor.addColorStop(1, "#02040a");
  ctx.fillStyle = floor; ctx.fillRect(0, 0, 1024, 576);
  for (const [x,color] of [[0,"47,235,226"],[1024,"229,71,213"]] as const) {
    const light=ctx.createRadialGradient(x,288,0,x,288,320);
    light.addColorStop(0,`rgba(${color},.075)`);light.addColorStop(1,`rgba(${color},0)`);
    ctx.fillStyle=light; ctx.fillRect(0,0,1024,576);
  }
  ctx.lineWidth=1;
  ctx.strokeStyle="#7794bf12";
  ctx.beginPath();ctx.arc(512,288,72,0,Math.PI*2);ctx.stroke();
  ctx.strokeStyle="#94b6cb25";
  ctx.setLineDash([3,13]);ctx.beginPath();ctx.moveTo(512,12);ctx.lineTo(512,564);ctx.stroke();ctx.setLineDash([]);
  // Short corner registration marks and edge ticks stay away from the rally.
  for(const [x,sign,color] of [[12,1,"#66efe744"],[1012,-1,"#f18cdc44"]] as const){
    ctx.strokeStyle=color;ctx.beginPath();
    for(const [y,dy] of [[12,1],[564,-1]]){ctx.moveTo(x+22*sign,y);ctx.lineTo(x,y);ctx.lineTo(x,y+14*dy);}
    ctx.stroke();
    ctx.strokeStyle="#6979922b";
    for(let y=64;y<560;y+=32){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+4*sign,y);ctx.stroke();}
  }
  return surface;
}
