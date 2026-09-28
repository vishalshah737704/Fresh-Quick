// Brand tokens mirrored from repo root lib/branding.ts and app/globals.css.
// Single source of truth for the mobile app, per project convention of
// isolating brand values (never hardcode name/colors in components).

export const BRAND = {
  name: "Fresh & Quick",
  colors: {
    primary: "#12140f",
    accent: "#b6e02e",
    background: "#faf9f4",
    surface: "#ffffff",
    ink: "#12140f",
    inkMuted: "#6b6b62",
  },
  fonts: {
    body: "Inter_400Regular",
    bodyMedium: "Inter_500Medium",
    bodySemiBold: "Inter_600SemiBold",
    heading: "Poppins_300Light",
  },
  radius: 8,
} as const;
