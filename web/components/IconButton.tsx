import type { ButtonHTMLAttributes } from "react";

export function ControlIcon({ name }: { name: "close" | "up" | "down" }) {
  return (
    <svg className="control-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {name === "close" ? <path d="m6 6 12 12M6 18 18 6" /> :
        name === "up" ? <path d="M12 20V4m-6 6 6-6 6 6" /> :
          <path d="M12 4v16m-6-6 6 6 6-6" />}
    </svg>
  );
}

export function IconButton({ icon = "close", className = "", ...props }: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & { icon?: "close" | "up" | "down" }) {
  return <button type="button" {...props} className={`icon-button ${className}`}><ControlIcon name={icon} /></button>;
}
