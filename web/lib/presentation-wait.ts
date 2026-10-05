/** A prediction boundary is not a broken connection. Keep transport incidents
 * separate so an ordinary point never requests a new session or hides court. */
export type PresentationWait='point-pending'|'serve'|'chaos-draw'|'stale'|'interrupted'|'contract-pause'|'prediction-limit'|null;
export function presentationWait(o:{stale:boolean;point:boolean;serve:boolean;projection:boolean;paused?:boolean;draw?:boolean;interrupted?:boolean;starting?:boolean}):PresentationWait{
 if(o.paused)return 'contract-pause';
 // A confirmed countdown has not started its physics clock. A playout buffer
 // cannot infer a broken connection from that intentionally stationary clock.
 // Transport errors are reported separately by the connection owner.
 if(o.starting)return 'serve';
 if(o.interrupted)return 'interrupted';
 if(o.stale)return 'stale';
 if(o.point)return 'point-pending';
 if(o.draw)return 'chaos-draw';
 if(o.serve)return 'serve';
 return o.projection?'prediction-limit':null;
}
export const reconnectingPresentation=(cause:PresentationWait)=>cause==='stale'||cause==='interrupted';
