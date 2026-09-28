'use client';
import {useLayoutEffect, useRef} from 'react';

/** Fit the 16:9 field around the actual header, scoreboard and controls.
 * Resize observation runs only when layout changes, never on game frames. */
export function useCourtFit(active: boolean, layoutKey: string) {
 const root = useRef<HTMLElement>(null);
 useLayoutEffect(() => {
  const page = root.current;
  if (!active || !page) return;
  let frame = 0, closed = false;
  const fit = () => {
   frame = 0;
   const court = page.querySelector<HTMLElement>('.agent-court');
   const field = court?.querySelector<HTMLElement>('.pool-canvas-slot');
   if (!court || !field) return;
   const rect = court.getBoundingClientRect(), canvas = field.getBoundingClientRect();
   const style = getComputedStyle(court), pageStyle = getComputedStyle(page);
   const px = (value: string) => Number.parseFloat(value) || 0;
   const bottom = page.getBoundingClientRect().top + page.clientHeight - px(pageStyle.paddingBottom);
   const available = bottom - rect.top - px(style.marginBottom) - (rect.height - canvas.height) - 2;
   const horizontal = px(style.paddingLeft) + px(style.paddingRight) + px(style.borderLeftWidth) + px(style.borderRightWidth);
   const width = Math.min(page.clientWidth - px(pageStyle.paddingLeft) - px(pageStyle.paddingRight), Math.max(80, available) * 16 / 9 + horizontal);
   const value = `${Math.floor(width)}px`;
   if (page.style.getPropertyValue('--fitted-court-width') !== value) page.style.setProperty('--fitted-court-width', value);
   // At extreme zoom/short height, keep every action reachable by scrolling.
   page.dataset.courtScroll = available < 80 ? 'true' : 'false';
  };
  const schedule = () => { if (!closed && !frame) frame = requestAnimationFrame(fit); };
  const resize = new ResizeObserver(schedule);
  const observe = () => {
   resize.disconnect(); resize.observe(page);
   for (const child of page.children) resize.observe(child);
   for (const child of page.querySelectorAll('.agent-court > *')) resize.observe(child);
   schedule();
  };
  const mutations = new MutationObserver(observe);
  mutations.observe(page, {childList: true});
  observe(); void document.fonts.ready.then(schedule);
  return () => { closed = true; cancelAnimationFrame(frame); resize.disconnect(); mutations.disconnect(); page.style.removeProperty('--fitted-court-width'); delete page.dataset.courtScroll; };
 }, [active, layoutKey]);
 return root;
}
