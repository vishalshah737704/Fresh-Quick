// Brand tokens mirrored from repo root lib/branding.ts and app/globals.css.
// Single source of truth for the mobile app, per project convention of
// isolating brand values (never hardcode name/colors in components).

export const BRAND = {
  name: "Fresh & Quick",
  colors: {
    primary: "#F5821F",
    accent: "#1E8A3E",
    background: "#F4F4F4",
    surface: "#FFFFFF",
    ink: "#0B1D3A",
    inkMuted: "#6B7280",
    danger: "#E0524D",
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
