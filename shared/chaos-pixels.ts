import {chaosEvents,type ChaosEventId} from './chaos-events';

/** Original PONGIT pixel artwork. One 24×24 grid per event, with transparent zeroes.
 * The same grids generate SVG assets and draw in the existing game canvas. */
export function chaosIconPixels(id:ChaosEventId):readonly string[] {
 const pixels=Array.from({length:24},()=>Array<number>(24).fill(0));
 const dot=(x:number,y:number,c=1)=>{if(x>=0&&x<24&&y>=0&&y<24)pixels[y][x]=c;};
 const rect=(x:number,y:number,w:number,h:number,c=1)=>{for(let j=y;j<y+h;j++)for(let i=x;i<x+w;i++)dot(i,j,c);};
 const line=(x0:number,y0:number,x1:number,y1:number,c=1)=>{
  const dx=Math.abs(x1-x0),sx=x0<x1?1:-1,dy=-Math.abs(y1-y0),sy=y0<y1?1:-1;let error=dx+dy;
  while(true){dot(x0,y0,c);if(x0===x1&&y0===y1)break;const e=2*error;if(e>=dy){error+=dy;x0+=sx;}if(e<=dx){error+=dx;y0+=sy;}}
 };
 const ring=(cx:number,cy:number,r:number,c=1)=>{for(let y=cy-r;y<=cy+r;y++)for(let x=cx-r;x<=cx+r;x++){const d=(x-cx)**2+(y-cy)**2;if(d<=r*r&&d>(r-2)**2)dot(x,y,c);}};
 const paddle=(x=9,y=4,h=16,c=1)=>{rect(x,y,5,h,4);rect(x,y,4,h-1,c);rect(x,y,1,h-2,3);};
 const ball=(x:number,y:number,c=3)=>{rect(x,y,3,3,c);dot(x+2,y+2,1);};
 const spark=(x:number,y:number,c=3)=>{dot(x,y-2,c);rect(x-1,y,3,1,c);dot(x,y+2,c);};
 const arrow=(x:number,y:number,up:boolean,c=1)=>{line(x,y,x,y+(up?4:-4),c);line(x,y,x-2,y+(up?2:-2),c);line(x,y,x+2,y+(up?2:-2),c);};
 switch(id){
  case 1:paddle(9,5,14);arrow(11,1,true);arrow(11,22,false);break;
  case 2:paddle(15,4,16);line(8,2,4,10,2);rect(4,10,6,2,2);line(10,11,6,21,2);line(2,8,5,8);line(1,15,4,15);break;
  case 3:line(4,4,11,1);line(11,1,19,4);line(4,4,4,13);line(19,4,19,13);line(4,13,11,21);line(11,21,19,13);rect(10,6,3,9,3);rect(7,9,9,3,3);break;
  case 4:line(4,19,10,12,2);line(4,15,9,10,2);line(8,20,14,15,2);ball(13,7);spark(19,4);break;
  case 5:line(3,19,6,13,2);line(6,13,11,8,2);line(11,8,17,6,2);line(17,6,21,7,2);line(5,20,8,14);line(8,14,13,10);ball(18,5);break;
  case 6:paddle(5,3,18);rect(4,10,7,4,2);line(13,11,17,11,3);spark(19,11);break;
  case 7:paddle(9,8,8);arrow(11,5,false,2);arrow(11,18,true,2);line(5,7,5,16,4);line(18,7,18,16,4);break;
  case 8:rect(7,8,10,11,4);rect(6,8,10,10,1);ring(11,5,3,2);line(8,11,13,16,3);rect(7,21,10,1,2);break;
  case 9:line(11,2,5,9);line(5,9,9,21);line(9,21,15,18);line(15,18,19,7);line(19,7,11,2);line(11,2,11,16,3);line(5,9,19,7,2);line(5,9,15,18,2);break;
  case 10:ring(12,13,6,2);rect(7,11,10,5,2);line(13,6,16,3,3);spark(18,2,2);dot(10,13,4);dot(14,13,4);rect(10,16,5,1,4);break;
  case 11:paddle(9,2,8);paddle(9,15,7);rect(11,11,1,3,2);line(4,11,6,11,3);line(17,12,19,12,3);break;
  case 12:paddle(3,8,9);paddle(17,3,18,2);line(8,6,14,6);line(14,6,12,4);line(8,19,14,19,2);line(8,19,10,21,2);break;
  case 13:ring(11,12,7,2);ring(11,12,4);rect(10,10,3,5,3);rect(9,11,5,3,3);ball(19,3);break;
  case 14:ring(6,6,4);ring(17,17,4,2);line(9,8,15,15,3);dot(11,10,4);dot(13,12,4);ball(3,4);break;
  case 15:rect(7,2,2,20,4);rect(15,2,2,20,4);line(10,6,12,4);line(12,4,14,6);line(10,12,12,10,2);line(12,10,14,12,2);line(10,18,12,16);line(12,16,14,18);break;
  case 16:ring(11,11,9,4);ring(11,11,6,2);ring(11,11,3);rect(10,10,3,3,3);line(2,3,6,6,2);line(17,17,21,21);break;
  case 17:line(2,6,17,6,2);line(17,6,20,3,2);line(4,11,18,11);line(18,11,21,8);line(1,17,14,17,2);line(14,17,17,14,2);break;
  case 18:line(6,18,18,6,4);line(5,17,17,5);line(6,17,17,6,3);line(2,12,8,12,2);line(12,12,12,21,2);ball(1,10);break;
  case 19:rect(2,4,9,5,1);rect(13,4,9,5,2);rect(7,11,9,5,1);rect(2,4,9,1,3);rect(13,4,9,1,3);rect(7,11,9,1,3);dot(5,18,2);dot(17,17);ball(13,20);break;
  case 20:for(let x=2;x<23;x+=5)rect(x,3,3,2,2);line(4,19,12,7);line(12,7,19,18);ball(18,18);break;
  case 21:ball(3,4);ball(16,15,2);line(7,8,15,16,4);line(6,17,6,21);line(4,19,8,19);spark(18,5);break;
  case 22:ring(11,11,9,2);line(5,8,8,11,3);line(8,8,5,11,3);line(12,7,17,7,3);line(17,7,17,11,3);line(17,11,12,15,3);line(12,15,18,15,3);break;
  case 23:line(3,6,6,10,2);line(6,10,11,3,2);line(11,3,17,10,2);line(17,10,21,6,2);rect(4,11,17,7,2);rect(5,18,15,2,1);rect(6,14,3,2,4);rect(15,14,3,2,4);spark(11,10,3);break;
  case 24:rect(6,3,12,18,4);rect(5,2,12,18,2);rect(6,3,10,2,3);rect(9,7,5,2,3);rect(13,9,2,2,3);rect(11,11,3,2,3);dot(11,16,3);break;
 }
 return pixels.map(row=>row.join(''));
}

export function chaosIconPalette(id:ChaosEventId){
 const e=chaosEvents[id-1];return ['transparent',e.color,'#bb83ef','#f1ffff','#253649'];
}

export function chaosIconSvg(id:ChaosEventId){
 const colors=chaosIconPalette(id),grid=chaosIconPixels(id);let cells='';
 for(let y=0;y<grid.length;y++)for(let x=0;x<24;){
  const c=Number(grid[y][x]);let end=x+1;while(end<24&&grid[y][end]===grid[y][x])end++;
  if(c)cells+=`<rect x="${x}" y="${y}" width="${end-x}" height="1" fill="${colors[c]}"/>`;x=end;
 }
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" shape-rendering="crispEdges">${cells}</svg>`;
}
