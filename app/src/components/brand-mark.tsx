"use client";

import { cn } from "../lib/utils";

type Props = {
  className?: string;
};

export function BrandMark({ className }: Props) {
  return (
    <div
      aria-hidden="true"
      className={cn("size-11 overflow-hidden rounded-[1.35rem] shadow-md", className)}
    >
      <svg
        viewBox="0 0 48 48"
        xmlns="http://www.w3.org/2000/svg"
        className="size-full"
        fill="none"
      >
        <defs>
          <linearGradient id="dfl-bg" x1="6" y1="4" x2="42" y2="44">
            <stop stopColor="#0F172A" />
            <stop offset="1" stopColor="#111827" />
          </linearGradient>
          <radialGradient id="dfl-glow" cx="0" cy="0" r="1" gradientTransform="translate(24 17) rotate(90) scale(14 15)">
            <stop stopColor="#5EEAD4" stopOpacity="0.72" />
            <stop offset="1" stopColor="#5EEAD4" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="dfl-core" x1="20" y1="16" x2="29" y2="27">
            <stop stopColor="#A7F3D0" />
            <stop offset="1" stopColor="#67E8F9" />
          </linearGradient>
        </defs>

        <rect x="2" y="2" width="44" height="44" rx="14" fill="url(#dfl-bg)" />
        <rect
          x="2.75"
          y="2.75"
          width="42.5"
          height="42.5"
          rx="13.25"
          stroke="rgba(148, 163, 184, 0.16)"
          strokeWidth="1.5"
        />

        <circle cx="24" cy="17.5" r="13" fill="url(#dfl-glow)" />

        <path
          d="M24 11.25C18.27 11.25 14 15.54 14 21.03C14 24.84 16 28.03 19.42 29.71C20.7 30.34 21.5 31.53 21.5 32.92V33.67C21.5 34.49 22.39 34.98 23.09 34.55L25.63 32.97C26.19 32.63 26.83 32.44 27.48 32.44C33.78 32.44 38 27.81 38 21.12C38 15.44 33.77 11.25 24 11.25Z"
          fill="#F8FAFC"
          fillOpacity="0.97"
        />

        <path
          d="M24.07 15.1C26.73 15.1 28.97 17.14 28.97 19.86C28.97 22.11 27.71 23.94 25.47 25.06C26.09 22.35 24.82 20.23 21.6 18.68C21.9 16.63 22.95 15.1 24.07 15.1Z"
          fill="url(#dfl-core)"
        />

        <path
          d="M16.35 34.45C18.24 32.58 20.83 31.62 24 31.62C27.17 31.62 29.76 32.58 31.65 34.45"
          stroke="#5EEAD4"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <circle cx="14.2" cy="35.18" r="2.15" stroke="#93C5FD" strokeWidth="1.6" />
        <circle cx="33.8" cy="35.18" r="2.15" stroke="#93C5FD" strokeWidth="1.6" />
        <path
          d="M16.35 35.18H18.9M29.1 35.18H31.65"
          stroke="#93C5FD"
          strokeWidth="1.6"
          strokeLinecap="round"
        />

        <circle cx="18.1" cy="13.2" r="1.2" fill="#C4B5FD" fillOpacity="0.85" />
        <circle cx="31.4" cy="11.7" r="0.95" fill="#67E8F9" fillOpacity="0.95" />
      </svg>
    </div>
  );
}
