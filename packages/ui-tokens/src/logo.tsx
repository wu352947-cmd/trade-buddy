import React from "react";

interface LogoProps {
  size?: number;
  className?: string;
}

/**
 * Trade Buddy 原创「双柱伴行 + 护盾弧」极简几何标识
 * 左柱：伴侣钴蓝 (#3B82F6)，右柱：翡翠青绿 (#16B981)，贯穿柔和上升折线
 */
export function TradeBuddyLogo({ size = 24, className }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Trade Buddy Logo"
    >
      <rect
        x="1"
        y="1"
        width="26"
        height="26"
        rx="6"
        fill="url(#tb-bg-grad)"
        stroke="rgba(59,130,246,0.35)"
        strokeWidth="1.2"
      />
      {/* Subtle shield arc */}
      <path
        d="M5.5 20.5C8.5 22.8 19.5 22.8 22.5 20.5"
        stroke="rgba(148,163,184,0.3)"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      {/* Left candle bar (Slate Cobalt Blue) */}
      <line
        x1="10"
        y1="7"
        x2="10"
        y2="20"
        stroke="#3B82F6"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <rect x="8.1" y="10.2" width="3.8" height="7.2" rx="1.1" fill="#3B82F6" />
      {/* Right candle bar (Emerald Green) */}
      <line
        x1="18"
        y1="5.5"
        x2="18"
        y2="19.5"
        stroke="#16B981"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <rect x="16.1" y="7.8" width="3.8" height="8.4" rx="1.1" fill="#16B981" />
      {/* Connecting companion trend arc */}
      <path
        d="M6.5 16.5L10 13.4L14 14.8L18 10.2L21.5 8"
        stroke="#E6EDF7"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <defs>
        <linearGradient
          id="tb-bg-grad"
          x1="2"
          y1="2"
          x2="26"
          y2="26"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#1B2336" />
          <stop offset="1" stopColor="#0E131E" />
        </linearGradient>
      </defs>
    </svg>
  );
}
