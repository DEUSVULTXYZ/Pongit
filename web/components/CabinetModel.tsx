"use client";

import { useId } from "react";

/** Original vector cabinet. Perspective belongs to the furniture, never the hitboxes. */
export function CabinetModel({ kind }: { kind: "match" | "invite" | "room" }) {
  const id = useId().replace(/:/g, "");
  const accent = kind === "match" ? "#8ff7f0" : kind === "invite" ? "#c5a0ff" : "#f3b9df";
  const fill = (name: string) => `url(#${id}-${name})`;
  return (
    <svg className="cabinet-model" viewBox="0 0 280 240" fill="none" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}-body`} x1="90" y1="25" x2="205" y2="215" gradientUnits="userSpaceOnUse">
          <stop stopColor="#677582"/><stop offset=".16" stopColor="#283644"/><stop offset=".7" stopColor="#111b28"/><stop offset="1" stopColor="#344052"/>
        </linearGradient>
        <linearGradient id={`${id}-side`} x1="60" y1="65" x2="114" y2="220" gradientUnits="userSpaceOnUse">
          <stop stopColor="#41505c"/><stop offset=".45" stopColor="#121b29"/><stop offset="1" stopColor="#070e18"/>
        </linearGradient>
        <linearGradient id={`${id}-glass`} x1="135" y1="64" x2="152" y2="147" gradientUnits="userSpaceOnUse">
          <stop stopColor="#25394a"/><stop offset=".28" stopColor="#08151f"/><stop offset="1" stopColor="#030a11"/>
        </linearGradient>
        <linearGradient id={`${id}-deck`} x1="100" y1="140" x2="133" y2="181" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7e919d"/><stop offset=".13" stopColor="#455565"/><stop offset="1" stopColor="#172637"/>
        </linearGradient>
        <radialGradient id={`${id}-pool`}><stop stopColor={accent} stopOpacity=".22"/><stop offset="1" stopColor={accent} stopOpacity="0"/></radialGradient>
        <radialGradient id={`${id}-ball`} cx=".3" cy=".2"><stop stopColor="#fff"/><stop offset=".3" stopColor={accent}/><stop offset="1" stopColor="#324b63"/></radialGradient>
      </defs>
      <ellipse cx="141" cy="218" rx="118" ry="21" fill={fill("pool")}/>
      <ellipse cx="143" cy="215" rx="77" ry="12" fill="#02060c" opacity=".85"/>
      <path d="M65 44 160 22 213 43 117 67Z" fill="#546371" stroke="#8c9aa4" strokeWidth=".8"/>
      <path d="M65 44 117 67 117 104 107 138 108 163 99 206 58 183 61 140 74 107Z" fill={fill("side")} stroke="#556677"/>
      <path d="M117 67 213 43 211 84 196 124 214 143 204 202 99 226 99 169 107 138 117 104Z" fill={fill("body")} stroke="#8397a5"/>
      <path d="m121 69 86-21-1 26-85 21Z" fill="#081620" stroke={accent} strokeOpacity=".75"/>
      <path d="m132 77 61-15m-60 21 41-10" stroke={accent} strokeWidth="3"/>
      <path d="m122 104 78-20-14 43-75 20Z" fill="#02070d" stroke="#05090e" strokeWidth="5"/>
      <path d="m124 105 73-18-13 38-70 19Z" fill={fill("glass")} stroke="#6f8998" strokeWidth=".7"/>
      <g transform="matrix(.91 -.23 -.24 .73 128 109)">
        {kind === "match" ? <><path d="M4 0v30M68 0v30" stroke={accent} strokeWidth="5"/><path d="M37 0v4m0 5v4m0 5v4m0 5v4" stroke="#547587"/><path d="M30 12h7v7h-7z" fill="#f2ffff"/></> : kind === "invite" ? <><circle cx="24" cy="8" r="7" fill={accent}/><path d="M10 31v-6c0-13 28-13 28 0v6" fill={accent} fillOpacity=".7"/><path d="M51 9v18m-9-9h18" stroke="#f5f4ff" strokeWidth="4"/></> : <><circle cx="19" cy="7" r="5" fill={accent}/><circle cx="49" cy="7" r="5" fill={accent}/><circle cx="34" cy="22" r="5" fill="#fff"/><path d="M8 23c0-13 22-13 22 0m8 0c0-13 22-13 22 0M23 38c0-13 22-13 22 0" stroke={accent} strokeWidth="4"/></>}
      </g>
      <path d="m125 106 69-18-8 7-64 17Z" fill="#d3f6ff" opacity=".09"/>
      <path d="m107 145 85-22 22 20-108 27-11-12Z" fill={fill("deck")} stroke="#98a8b5" strokeWidth=".8"/>
      <path d="m106 171 106-27-2 7-104 27Z" fill={accent} fillOpacity=".72"/>
      <ellipse cx="125" cy="152" rx="11" ry="5" fill="#060c17"/>
      <path d="m125 152-3-15" stroke="#acb6c4" strokeWidth="4"/>
      <circle cx="121" cy="134" r="8" fill={fill("ball")}/>
      <ellipse cx="178" cy="143" rx="7" ry="4" fill="#060b13"/><ellipse cx="178" cy="140" rx="7" ry="4" fill={accent}/>
      <ellipse cx="193" cy="139" rx="7" ry="4" fill="#060b13"/><ellipse cx="193" cy="136" rx="7" ry="4" fill="#d5edf4"/>
      <path d="m109 184 87-22-4 32-83 21Z" fill="#0c1421" stroke="#4c5e6e"/>
      <path d="m143 184 15-4v15l-15 4Z" fill="#050910" stroke="#718493"/><path d="m146 189 9-2" stroke={accent}/>
      <path d="m65 58 5 47-13 39-2 34m52-3 1 40m98-59-7 40" stroke={accent} strokeOpacity=".7" strokeWidth="2"/>
      <path d="m77 91 15 7 4 39-14-7Z" stroke={accent} strokeOpacity=".25" strokeWidth="2"/>
      <path d="m100 226 104-24-1 6-104 25Z" fill="#060b13"/>
    </svg>
  );
}
