/** Candidate rules-6 dimensions in arena units. The physics mirror scales these
 * by 1e6. Rendering must not enlarge their collision surfaces with decoration. */
export const chaosGeometry={width:1024,height:576,ballRadius:6,paddleWidth:12,leftX:22,rightX:990,
 bumper:{x:512,y:288,radius:28},gravity:{x:512,y:288,radius:160},warp:{left:480,right:544},
 deflector:{x:512,y:288,length:96,width:8},bricks:[{x:512,y:200},{x:512,y:288},{x:512,y:376}],
 brickWidth:56,brickHeight:16,pickup:{x:512,y:120,radius:16},portalRadius:24,splitGap:16} as const;
export function chaosPortals(variant:number){return (variant&1)?[{x:320,y:396},{x:704,y:180}]:[{x:320,y:180},{x:704,y:396}];}
