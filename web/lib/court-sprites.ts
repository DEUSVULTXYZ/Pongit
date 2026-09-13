/** Shared pixel cabinet sprites. Bevels stay inside the existing hitboxes. */
function prism(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number,
 face: CanvasGradient | string, light: string, dark: string) {
 const b = Math.min(2.5, w / 5, h / 5);
 c.fillStyle = face; c.fillRect(x, y, w, h);
 c.fillStyle = light; c.fillRect(x, y, w, b); c.fillRect(x, y, b, h);
 c.fillStyle = dark; c.fillRect(x + w - b, y + b, b, h - b); c.fillRect(x + b, y + h - b, w - b, b);
}

const sprites = new WeakMap<CanvasRenderingContext2D, ReturnType<typeof createSprites>>();
function createSprites(c: CanvasRenderingContext2D) {
 const left = c.createLinearGradient(22, 0, 34, 0);
 left.addColorStop(0, '#bbfaff'); left.addColorStop(.35, '#5de9ff'); left.addColorStop(1, '#269ed0');
 const right = c.createLinearGradient(990, 0, 1002, 0);
 right.addColorStop(0, '#f2d5ff'); right.addColorStop(.35, '#db9cfc'); right.addColorStop(1, '#9753dc');
 return {
  paddle(side: number, top: number, height: number) {
   if (side === 0) prism(c, 22, top, 12, height, left, '#e0ffff', '#357787');
   else prism(c, 990, top, 12, height, right, '#f3e8ff', '#67478b');
  },
  ball(x: number, y: number, secondary = false) {
   prism(c, x - 6, y - 6, 12, 12, secondary ? '#e7deff' : '#f3fcff', '#fff', secondary ? '#ab92c9' : '#9eafb9');
  },
 };
}

export function courtSprites(c: CanvasRenderingContext2D) {
 let value = sprites.get(c);
 if (!value) { value = createSprites(c); sprites.set(c, value); }
 return value;
}
