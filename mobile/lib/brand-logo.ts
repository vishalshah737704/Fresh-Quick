// Fresh & Quick logo mark (concept "A": bolt + leaf), as plain SVG data so the
// web dialog and the mobile (react-native-svg) animation render the same shapes.
// Brand colours here mirror lib/branding.ts's primary/accent; kept as literals
// because this file is copied byte-for-byte into mobile/lib/.
export const LOGO_VIEWBOX = 80;

export const LOGO_PATHS = {
  disc: { cx: 40, cy: 40, r: 38 },
  bolt: "M46 12 L22 46 H38 L32 68 L60 32 H44 Z",
  leaf: "M50 14 C64 12 72 22 70 34 C58 36 50 28 50 14 Z",
} as const;

export const LOGO_COLORS = {
  disc: "#FFFFFF",
  bolt: "#F5821F",
  leaf: "#1E8A3E",
} as const;
