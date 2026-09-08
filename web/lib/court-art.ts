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
  ctx.strokeStyle="#a4cde03d";
  ctx.setLineDash([3,12]);ctx.beginPath();ctx.moveTo(512,12);ctx.lineTo(512,564);ctx.stroke();ctx.setLineDash([]);
  // A quiet dot matrix and stepped corner inlays are baked once, outside motion.
  ctx.fillStyle="#7795b508";
  for(let y=24;y<560;y+=12) for(let x=40;x<990;x+=12) ctx.fillRect(x,y,1,1);
  for(const [x,sign,color] of [[8,1,"#6debf47d"],[1016,-1,"#f18cdc7d"]] as const){
    ctx.fillStyle=color;
    for(const [y,dy] of [[8,1],[568,-1]]){
      for(const [dx,py] of [[0,0],[6,0],[12,0],[0,6],[6,6],[0,12]]) {
        ctx.fillRect(x+dx*sign-(sign<0?4:0),y+py*dy-(dy<0?4:0),4,4);
      }
    }
  }
  return surface;
}
