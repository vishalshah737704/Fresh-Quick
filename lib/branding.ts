export const BRAND = {
  name: "Fresh & Quick",
  theme: {
    primary: "#F5821F",
    accent: "#1E8A3E",
    // Darkened for white text at >=4.5:1 (WCAG AA) — use for text-bearing
    // fills (buttons/pills/badges); keep primary/accent for decorative use.
    primaryTextSafe: "#A85800",
    accentTextSafe: "#187033",
    background: "#F4F4F4",
    surface: "#FFFFFF",
    ink: "#0B1D3A",
    inkMuted: "#6B7280",
    danger: "#E0524D",
  },
} as const;
