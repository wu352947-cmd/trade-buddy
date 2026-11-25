import React from "react";

export interface IconProps {
  size?: number;
  className?: string;
}

const baseProps = (size: number, className?: string) => ({
  width: size,
  height: size,
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className,
});

export const IconCrosshair = ({ size = 18, className }: IconProps) => (
  <svg {...baseProps(size, className)}>
    <line x1="10" y1="2.5" x2="10" y2="7.5" />
    <line x1="10" y1="12.5" x2="10" y2="17.5" />
    <line x1="2.5" y1="10" x2="7.5" y2="10" />
    <line x1="12.5" y1="10" x2="17.5" y2="10" />
    <circle cx="10" cy="10" r="1.2" fill="currentColor" stroke="none" />
  </svg>
);

export const IconTrendline = ({ size = 18, className }: IconProps) => (
  <svg {...baseProps(size, className)}>
    <line x1="4" y1="15.5" x2="16" y2="4.5" />
    <circle cx="4" cy="15.5" r="1.5" fill="currentColor" />
    <circle cx="16" cy="4.5" r="1.5" fill="currentColor" />
  </svg>
);

export const IconHorizontalLine = ({ size = 18, className }: IconProps) => (
  <svg {...baseProps(size, className)}>
    <line x1="2.5" y1="10" x2="17.5" y2="10" />
    <circle cx="10" cy="10" r="1.6" fill="currentColor" />
  </svg>
);

export const IconRayLine = ({ size = 18, className }: IconProps) => (
  <svg {...baseProps(size, className)}>
    <line x1="4" y1="15" x2="16.5" y2="4.5" />
    <circle cx="4" cy="15" r="1.6" fill="currentColor" />
    <polyline points="12.5,4.5 16.5,4.5 16.5,8.5" />
  </svg>
);

export const IconParallelChannel = ({ size = 18, className }: IconProps) => (
  <svg {...baseProps(size, className)}>
    <line x1="3" y1="12.5" x2="14" y2="4" />
    <line x1="6" y1="16" x2="17" y2="7.5" />
    <line x1="4.5" y1="14.25" x2="15.5" y2="5.75" strokeDasharray="2 2" opacity="0.6" />
  </svg>
);

export const IconRectangle = ({ size = 18, className }: IconProps) => (
  <svg {...baseProps(size, className)}>
    <rect x="3.5" y="5" width="13" height="10" rx="1" />
    <circle cx="3.5" cy="5" r="1.1" fill="currentColor" />
    <circle cx="16.5" cy="15" r="1.1" fill="currentColor" />
  </svg>
);

export const IconFibonacci = ({ size = 18, className }: IconProps) => (
  <svg {...baseProps(size, className)}>
    <line x1="3" y1="4.5" x2="17" y2="4.5" />
    <line x1="3" y1="8.5" x2="17" y2="8.5" strokeDasharray="2 1.8" />
    <line x1="3" y1="12" x2="17" y2="12" strokeDasharray="2 1.8" />
    <line x1="3" y1="15.5" x2="17" y2="15.5" />
    <line x1="5" y1="15.5" x2="15" y2="4.5" opacity="0.7" />
  </svg>
);

export const IconTextTool = ({ size = 18, className }: IconProps) => (
  <svg {...baseProps(size, className)}>
    <path d="M4.5 5.5H15.5" />
    <path d="M10 5.5V15.5" />
    <path d="M7.5 15.5H12.5" />
  </svg>
);

export const IconMeasure = ({ size = 18, className }: IconProps) => (
  <svg {...baseProps(size, className)}>
    <path d="M3.5 13.5L13.5 3.5L16.5 6.5L6.5 16.5L3.5 13.5Z" />
    <line x1="8" y1="9" x2="9.5" y2="10.5" />
    <line x1="10.5" y1="6.5" x2="12" y2="8" />
    <line x1="5.5" y1="11.5" x2="7" y2="13" />
  </svg>
);

export const IconMagnet = ({ size = 18, className }: IconProps) => (
  <svg {...baseProps(size, className)}>
    <path d="M5.5 4.5V10.5C5.5 13 7.5 15 10 15C12.5 15 14.5 13 14.5 10.5V4.5" />
    <line x1="4" y1="7" x2="7" y2="7" />
    <line x1="13" y1="7" x2="16" y2="7" />
  </svg>
);

export const IconTrash = ({ size = 18, className }: IconProps) => (
  <svg {...baseProps(size, className)}>
    <path d="M4 5.5H16" />
    <path d="M7.5 5.5V4C7.5 3.45 7.95 3 8.5 3H11.5C12.05 3 12.5 3.45 12.5 4V5.5" />
    <path d="M5.5 5.5L6.3 15.6C6.35 16.4 7 17 7.8 17H12.2C13 17 13.65 16.4 13.7 15.6L14.5 5.5" />
    <line x1="8.5" y1="8.5" x2="8.5" y2="14" />
    <line x1="11.5" y1="8.5" x2="11.5" y2="14" />
  </svg>
);

export const IconCandles = ({ size = 16, className }: IconProps) => (
  <svg {...baseProps(size, className)}>
    <line x1="6.5" y1="3" x2="6.5" y2="17" />
    <rect x="4.8" y="6.5" width="3.4" height="6.5" rx="0.6" fill="currentColor" />
    <line x1="13.5" y1="4" x2="13.5" y2="16" />
    <rect x="11.8" y="6" width="3.4" height="6" rx="0.6" />
  </svg>
);

export const IconHollowCandles = ({ size = 16, className }: IconProps) => (
  <svg {...baseProps(size, className)}>
    <line x1="6.5" y1="3" x2="6.5" y2="6.5" />
    <line x1="6.5" y1="13" x2="6.5" y2="17" />
    <rect x="4.8" y="6.5" width="3.4" height="6.5" rx="0.6" />
    <line x1="13.5" y1="4" x2="13.5" y2="6" />
    <line x1="13.5" y1="12" x2="13.5" y2="16" />
    <rect x="11.8" y="6" width="3.4" height="6" rx="0.6" />
  </svg>
);

export const IconBarsOHLC = ({ size = 16, className }: IconProps) => (
  <svg {...baseProps(size, className)}>
    <line x1="6.5" y1="4" x2="6.5" y2="16" />
    <line x1="4" y1="12" x2="6.5" y2="12" />
    <line x1="6.5" y1="7" x2="9" y2="7" />
    <line x1="13.5" y1="3.5" x2="13.5" y2="15.5" />
    <line x1="11" y1="8" x2="13.5" y2="8" />
    <line x1="13.5" y1="12.5" x2="16" y2="12.5" />
  </svg>
);

export const IconLineChart = ({ size = 16, className }: IconProps) => (
  <svg {...baseProps(size, className)}>
    <polyline points="2.5,14 7,9.5 11,12 17.5,5.5" />
  </svg>
);

export const IconAreaChart = ({ size = 16, className }: IconProps) => (
  <svg {...baseProps(size, className)}>
    <path d="M2.5 14L7 9.5L11 12L17.5 5.5V16H2.5V14Z" fill="currentColor" fillOpacity="0.18" stroke="none" />
    <polyline points="2.5,14 7,9.5 11,12 17.5,5.5" />
  </svg>
);

export const IconIndicators = ({ size = 16, className }: IconProps) => (
  <svg {...baseProps(size, className)}>
    <path d="M3 15.5C5.5 15.5 6.5 6.5 9.5 6.5C12.5 6.5 12.5 13 15 13C16.2 13 17 11.5 17.5 9.5" />
    <line x1="3" y1="10.5" x2="17" y2="10.5" strokeDasharray="2 2" opacity="0.6" />
  </svg>
);

export const IconSearch = ({ size = 15, className }: IconProps) => (
  <svg {...baseProps(size, className)}>
    <circle cx="9" cy="9" r="5.5" />
    <line x1="13.2" y1="13.2" x2="17" y2="17" />
  </svg>
);

export const IconWatchlist = ({ size = 18, className }: IconProps) => (
  <svg {...baseProps(size, className)}>
    <line x1="6.5" y1="5.5" x2="16.5" y2="5.5" />
    <line x1="6.5" y1="10" x2="16.5" y2="10" />
    <line x1="6.5" y1="14.5" x2="16.5" y2="14.5" />
    <circle cx="3.8" cy="5.5" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="3.8" cy="10" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="3.8" cy="14.5" r="0.9" fill="currentColor" stroke="none" />
  </svg>
);

export const IconDataWindow = ({ size = 18, className }: IconProps) => (
  <svg {...baseProps(size, className)}>
    <rect x="3" y="3.5" width="14" height="13" rx="1.8" />
    <line x1="3" y1="7.5" x2="17" y2="7.5" />
    <line x1="6" y1="10.8" x2="10" y2="10.8" />
    <line x1="12.5" y1="10.8" x2="14" y2="10.8" />
    <line x1="6" y1="13.5" x2="9.5" y2="13.5" />
    <line x1="12" y1="13.5" x2="14" y2="13.5" />
  </svg>
);

export const IconObjectTree = ({ size = 18, className }: IconProps) => (
  <svg {...baseProps(size, className)}>
    <polygon points="10,3 17,6.8 10,10.5 3,6.8" />
    <polyline points="3,10.5 10,14.2 17,10.5" />
    <polyline points="3,13.8 10,17.5 17,13.8" />
  </svg>
);

export const IconNews = ({ size = 18, className }: IconProps) => (
  <svg {...baseProps(size, className)}>
    <rect x="3.5" y="4" width="13" height="12" rx="1.5" />
    <line x1="6.5" y1="7.5" x2="13.5" y2="7.5" />
    <line x1="6.5" y1="10.5" x2="13.5" y2="10.5" />
    <line x1="6.5" y1="13.2" x2="10.5" y2="13.2" />
  </svg>
);

export const IconCalendar = ({ size = 18, className }: IconProps) => (
  <svg {...baseProps(size, className)}>
    <rect x="3.5" y="4.5" width="13" height="12" rx="1.5" />
    <line x1="3.5" y1="8.5" x2="16.5" y2="8.5" />
    <line x1="7" y1="2.8" x2="7" y2="5.8" />
    <line x1="13" y1="2.8" x2="13" y2="5.8" />
  </svg>
);

export const IconSun = ({ size = 16, className }: IconProps) => (
  <svg {...baseProps(size, className)}>
    <circle cx="10" cy="10" r="3.4" />
    <line x1="10" y1="2.5" x2="10" y2="4.2" />
    <line x1="10" y1="15.8" x2="10" y2="17.5" />
    <line x1="2.5" y1="10" x2="4.2" y2="10" />
    <line x1="15.8" y1="10" x2="17.5" y2="10" />
    <line x1="4.7" y1="4.7" x2="5.9" y2="5.9" />
    <line x1="14.1" y1="14.1" x2="15.3" y2="15.3" />
    <line x1="15.3" y1="4.7" x2="14.1" y2="5.9" />
    <line x1="5.9" y1="14.1" x2="4.7" y2="15.3" />
  </svg>
);

export const IconMoon = ({ size = 16, className }: IconProps) => (
  <svg {...baseProps(size, className)}>
    <path d="M15.8 11.8A6.2 6.2 0 0 1 8.2 4.2A6.2 6.2 0 1 0 15.8 11.8Z" />
  </svg>
);

export const IconChevronDown = ({ size = 14, className }: IconProps) => (
  <svg {...baseProps(size, className)}>
    <polyline points="5.5,7.5 10,12 14.5,7.5" />
  </svg>
);

export const IconClose = ({ size = 16, className }: IconProps) => (
  <svg {...baseProps(size, className)}>
    <line x1="5" y1="5" x2="15" y2="15" />
    <line x1="15" y1="5" x2="5" y2="15" />
  </svg>
);

export const IconNotes = ({ size = 15, className }: IconProps) => (
  <svg {...baseProps(size, className)}>
    <path d="M4.5 3.5H13L15.5 6V16.5H4.5V3.5Z" />
    <line x1="7" y1="9" x2="13" y2="9" />
    <line x1="7" y1="12.5" x2="11.5" y2="12.5" />
  </svg>
);

export const IconShield = ({ size = 15, className }: IconProps) => (
  <svg {...baseProps(size, className)}>
    <path d="M10 2.8L16 5.2V9.8C16 13.4 13.4 16 10 17.2C6.6 16 4 13.4 4 9.8V5.2L10 2.8Z" />
    <polyline points="7.5,10.2 9.3,12 12.8,8.2" />
  </svg>
);

export const IconRefresh = ({ size = 15, className }: IconProps) => (
  <svg {...baseProps(size, className)}>
    <path d="M16 10A6 6 0 1 1 14.2 5.7" />
    <polyline points="14.5,2.8 14.5,6.2 11.1,6.2" />
  </svg>
);

export const IconExternalLink = ({ size = 13, className }: IconProps) => (
  <svg {...baseProps(size, className)}>
    <path d="M11 4H16V9" />
    <line x1="9" y1="11" x2="16" y2="4" />
    <path d="M14 11.5V15C14 15.6 13.6 16 13 16H5C4.4 16 4 15.6 4 15V7C4 6.4 4.4 6 5 6H8.5" />
  </svg>
);

export const IconLayoutSingle = ({ size = 16, className }: IconProps) => (
  <svg {...baseProps(size, className)}>
    <rect x="3" y="3.5" width="14" height="13" rx="1.6" />
  </svg>
);

export const IconLayoutSplitH = ({ size = 16, className }: IconProps) => (
  <svg {...baseProps(size, className)}>
    <rect x="3" y="3.5" width="14" height="13" rx="1.6" />
    <line x1="10" y1="3.5" x2="10" y2="16.5" />
  </svg>
);

export const IconLayoutSplitV = ({ size = 16, className }: IconProps) => (
  <svg {...baseProps(size, className)}>
    <rect x="3" y="3.5" width="14" height="13" rx="1.6" />
    <line x1="3" y1="10" x2="17" y2="10" />
  </svg>
);

export const IconLayoutGrid4 = ({ size = 16, className }: IconProps) => (
  <svg {...baseProps(size, className)}>
    <rect x="3" y="3.5" width="14" height="13" rx="1.6" />
    <line x1="10" y1="3.5" x2="10" y2="16.5" />
    <line x1="3" y1="10" x2="17" y2="10" />
  </svg>
);

export const IconLink = ({ size = 13, className }: IconProps) => (
  <svg {...baseProps(size, className)}>
    <path d="M8.5 11.5L11.5 8.5" />
    <path d="M7.2 12.8L5.8 14.2C4.7 15.3 3 15.3 1.9 14.2C0.8 13.1 0.8 11.4 1.9 10.3L4.5 7.7C5.6 6.6 7.3 6.6 8.4 7.7" transform="translate(2.5 0) scale(0.85)" />
    <path d="M12.8 7.2L14.2 5.8C15.3 4.7 15.3 3 14.2 1.9C13.1 0.8 11.4 0.8 10.3 1.9L7.7 4.5C6.6 5.6 6.6 7.3 7.7 8.4" transform="translate(2.5 2.5) scale(0.85)" />
  </svg>
);

export const IconUnlink = ({ size = 13, className }: IconProps) => (
  <svg {...baseProps(size, className)}>
    <path d="M7.5 12.5L5.8 14.2C4.8 15.2 3.2 15.2 2.2 14.2C1.2 13.2 1.2 11.6 2.2 10.6L3.9 8.9" transform="translate(2.2 0.2) scale(0.86)" />
    <path d="M12.5 7.5L14.2 5.8C15.2 4.8 15.2 3.2 14.2 2.2C13.2 1.2 11.6 1.2 10.6 2.2L8.9 3.9" transform="translate(2.2 2.2) scale(0.86)" />
    <line x1="4" y1="4" x2="16" y2="16" />
  </svg>
);

export const IconReplay = ({ size = 15, className }: IconProps) => (
  <svg {...baseProps(size, className)}>
    <path d="M4.5 9.5A5.8 5.8 0 1 1 6.2 14.2" />
    <polyline points="2.8,6.5 4.5,9.8 7.8,8.1" />
    <polygon points="9.2,7.5 13.5,10 9.2,12.5" fill="currentColor" stroke="none" />
  </svg>
);

export const IconPlay = ({ size = 14, className }: IconProps) => (
  <svg {...baseProps(size, className)}>
    <polygon points="6,4.5 15.5,10 6,15.5" fill="currentColor" stroke="none" />
  </svg>
);

export const IconPause = ({ size = 14, className }: IconProps) => (
  <svg {...baseProps(size, className)}>
    <rect x="5.5" y="4.5" width="3" height="11" rx="0.6" fill="currentColor" stroke="none" />
    <rect x="11.5" y="4.5" width="3" height="11" rx="0.6" fill="currentColor" stroke="none" />
  </svg>
);

export const IconStepForward = ({ size = 14, className }: IconProps) => (
  <svg {...baseProps(size, className)}>
    <polygon points="4.5,5 12,10 4.5,15" fill="currentColor" stroke="none" />
    <rect x="13.5" y="5" width="2" height="10" rx="0.5" fill="currentColor" stroke="none" />
  </svg>
);

export const IconSkipBack = ({ size = 14, className }: IconProps) => (
  <svg {...baseProps(size, className)}>
    <rect x="4.5" y="5" width="2" height="10" rx="0.5" fill="currentColor" stroke="none" />
    <polygon points="15.5,5 8,10 15.5,15" fill="currentColor" stroke="none" />
  </svg>
);

export const IconCrosshairPick = ({ size = 14, className }: IconProps) => (
  <svg {...baseProps(size, className)}>
    <circle cx="10" cy="10" r="5" />
    <line x1="10" y1="2.5" x2="10" y2="5" />
    <line x1="10" y1="15" x2="10" y2="17.5" />
    <line x1="2.5" y1="10" x2="5" y2="10" />
    <line x1="15" y1="10" x2="17.5" y2="10" />
    <circle cx="10" cy="10" r="1.4" fill="currentColor" stroke="none" />
  </svg>
);

export const IconScreener = ({ size = 16, className }: IconProps) => (
  <svg {...baseProps(size, className)}>
    <path d="M3 4.5H17L11.8 10.6V15.5L8.2 13.8V10.6L3 4.5Z" />
  </svg>
);

export const IconFundamentals = ({ size = 18, className }: IconProps) => (
  <svg {...baseProps(size, className)}>
    <rect x="3" y="3.5" width="14" height="13" rx="1.6" />
    <line x1="6.5" y1="13.5" x2="6.5" y2="10" />
    <line x1="10" y1="13.5" x2="10" y2="7.5" />
    <line x1="13.5" y1="13.5" x2="13.5" y2="9" />
  </svg>
);

export const IconSettings = ({ size = 15, className }: IconProps) => (
  <svg {...baseProps(size, className)}>
    <circle cx="10" cy="10" r="2.6" />
    <path d="M10 3V4.8M10 15.2V17M3 10H4.8M15.2 10H17M5.05 5.05L6.3 6.3M13.7 13.7L14.95 14.95M14.95 5.05L13.7 6.3M6.3 13.7L5.05 14.95" />
  </svg>
);

export const IconArrowLeft = ({ size = 15, className }: IconProps) => (
  <svg {...baseProps(size, className)}>
    <line x1="16" y1="10" x2="4.5" y2="10" />
    <polyline points="9.5,5 4.5,10 9.5,15" />
  </svg>
);

export const IconSort = ({ size = 12, className }: IconProps) => (
  <svg {...baseProps(size, className)}>
    <polyline points="6.5,8 10,4.5 13.5,8" />
    <polyline points="6.5,12 10,15.5 13.5,12" />
  </svg>
);

export const IconPaperSim = ({ size = 14, className }: IconProps) => (
  <svg {...baseProps(size, className)}>
    <rect x="2.8" y="4.5" width="14.4" height="11" rx="1.8" />
    <path d="M2.8 8.2H17.2" />
    <circle cx="13.5" cy="11.8" r="1.2" fill="currentColor" stroke="none" />
    <line x1="5.5" y1="11.8" x2="9.5" y2="11.8" />
  </svg>
);
