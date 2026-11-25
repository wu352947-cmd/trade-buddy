export * from "./logo";
export * from "./icons";

export interface ChartPalette {
  bgCanvas: string;
  gridColor: string;
  axisLineColor: string;
  axisTickTextColor: string;
  crosshairLineColor: string;
  crosshairLabelBg: string;
  crosshairLabelText: string;
  upColor: string;
  downColor: string;
  upVolColor: string;
  downVolColor: string;
  noChangeColor: string;
  areaLineColor: string;
  areaTopColor: string;
  areaBottomColor: string;
  tooltipTextColor: string;
  indColors: [string, string, string, string];
}

export function getChartPalette(
  theme: "dark" | "light",
  colorScheme: "intl" | "cn"
): ChartPalette {
  const isDark = theme === "dark";
  const green = isDark ? "#16B981" : "#0D9668";
  const red = isDark ? "#F2485B" : "#E03146";
  const greenVol = isDark ? "rgba(22, 185, 129, 0.35)" : "rgba(13, 150, 104, 0.32)";
  const redVol = isDark ? "rgba(242, 72, 91, 0.35)" : "rgba(224, 49, 70, 0.32)";

  const upColor = colorScheme === "intl" ? green : red;
  const downColor = colorScheme === "intl" ? red : green;
  const upVolColor = colorScheme === "intl" ? greenVol : redVol;
  const downVolColor = colorScheme === "intl" ? redVol : greenVol;

  return {
    bgCanvas: isDark ? "#0E1117" : "#FFFFFF",
    gridColor: isDark ? "rgba(148, 163, 184, 0.08)" : "rgba(15, 23, 42, 0.06)",
    axisLineColor: isDark ? "#222938" : "#E2E7F0",
    axisTickTextColor: isDark ? "#9AA6BC" : "#4B5563",
    crosshairLineColor: isDark ? "rgba(148, 163, 184, 0.48)" : "rgba(15, 23, 42, 0.4)",
    crosshairLabelBg: isDark ? "#2B364F" : "#334155",
    crosshairLabelText: "#F8FAFC",
    upColor,
    downColor,
    upVolColor,
    downVolColor,
    noChangeColor: isDark ? "#8895AA" : "#64748B",
    areaLineColor: "#3B82F6",
    areaTopColor: "rgba(59, 130, 246, 0.24)",
    areaBottomColor: "rgba(59, 130, 246, 0.01)",
    tooltipTextColor: isDark ? "#CBD5E1" : "#334155",
    indColors: isDark
      ? ["#38BDF8", "#FBBF24", "#C084FC", "#FB7185"]
      : ["#0284C7", "#D97706", "#9333EA", "#E11D48"],
  };
}
