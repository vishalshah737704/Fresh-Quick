// Brand tokens mirrored from repo root lib/branding.ts and app/globals.css.
// Single source of truth for the mobile app, per project convention of
// isolating brand values (never hardcode name/colors in components).

export const BRAND = {
  name: "Fresh & Quick",
  colors: {
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
    // Darker danger for error TEXT on white (#E0524D is ~3.8:1, below AA); matches --color-brand-danger-text-safe.
    dangerTextSafe: "#B3302B",
    primaryTint: "#FFF4E8",
    accentTint: "#EAF7EE",
    inkTint: "#E8ECF4",
  },
  fonts: {
    body: "Inter_400Regular",
    bodyMedium: "Inter_500Medium",
    bodySemiBold: "Inter_600SemiBold",
    heading: "Poppins_700Bold",
  },
  radius: 8,
  radiusPill: 999,
} as const;
