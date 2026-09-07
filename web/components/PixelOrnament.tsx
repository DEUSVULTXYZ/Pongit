import type {CSSProperties} from "react";

export type PixelKind = "cabinet" | "joystick" | "planet" | "star";
const phases:Record<PixelKind,number>={cabinet:0,joystick:3,planet:6,star:9};

/** Decorative markup only: docs can render a still without any client game imports. */
export function PixelOrnament({kind,className="",still=false}:{kind:PixelKind;className?:string;still?:boolean}) {
  return <span aria-hidden="true" className={`pixel-ornament pixel-${kind} ${className}`} data-pixel={kind} data-still={still || undefined}
    style={{"--pixel-phase":`${phases[kind]}s` } as CSSProperties}><span className="pixel-frames"/></span>;
}
