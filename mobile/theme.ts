// The single source of colors, spacing and type for the app.
// No other file should hard-code a color or font (enforced by
// __tests__/theme.test.ts). Full nautical polish (Pirata One, wave animation)
// is Phase 5; this is the plain, accessible baseline.

/** Raw nautical palette (same values as the PWA's design system in CLAUDE.md). */
export const palette = {
  ocean900: '#0c4a6e',
  ocean700: '#0369a1',
  teal600: '#0d9488',
  teal500: '#14b8a6',
  teal700: '#0f766e', // teal600 darkened for white-text contrast
  teal800: '#115e59', // teal500 darkened for white-text contrast
  wood900: '#78350f',
  wood800: '#92400e',
  brass600: '#d97706',
  brass500: '#f59e0b',
  brass700: '#b45309', // brass600 darkened for white-text contrast
  gold700: '#a16207', // brass500 darkened for white-text contrast
  parchment100: '#fef3c7',
  parchment50: '#fffbeb',
  white: '#ffffff',
  black: '#000000',
  night950: '#0a0f1a',
  night900: '#111827',
  night800: '#1f2937',
  night700: '#374151',
  slate400: '#9ca3af',
  slate300: '#d1d5db',
  red700: '#b91c1c',
  red400: '#f87171',
  green400: '#4ade80',
} as const

export const colors = {
  background: palette.night950,
  surface: palette.night900,
  surfaceRaised: palette.night800,
  border: palette.night700,
  text: palette.white,
  textMuted: palette.slate400,
  textSubtle: palette.slate300,
  /** Headings / brand text on the dark background. */
  accent: palette.parchment100,
  /** Primary buttons: brass with dark ink text. */
  primary: palette.brass500,
  primaryText: palette.night950,
  secondary: palette.night800,
  secondaryText: palette.parchment100,
  danger: palette.red700,
  dangerText: palette.red400,
  success: palette.green400,
  onRow: palette.white,
  onRowMuted: 'rgba(255,255,255,0.85)',
  badgeBackground: 'rgba(0,0,0,0.28)',
  toastBackground: palette.parchment100,
  toastText: palette.wood900,
  placeholder: palette.slate400,
  overlay: 'rgba(0,0,0,0.5)',
  countBadge: palette.red700,
  countBadgeText: palette.white,
  /** Invite card on the add/<username> screen (white text, >= 4.5:1). */
  cardBackground: palette.ocean900,
  /** Full-screen "Yo!" reveal (the PWA's black screen, white text). */
  revealBackground: palette.black,
  revealText: palette.white,
} as const

/**
 * Crew row backgrounds, cycled by index. Every entry has >= 4.5:1 contrast
 * with white text (checked in __tests__/theme.test.ts). Parchment is not a row
 * color because white text on it is ~1.1:1; it is used as the accent instead.
 */
export const rowColors = [
  palette.ocean900,
  palette.teal700,
  palette.wood800,
  palette.ocean700,
  palette.brass700,
  palette.teal800,
  palette.wood900,
  palette.gold700,
] as const

export function rowColor(index: number): string {
  return rowColors[((index % rowColors.length) + rowColors.length) % rowColors.length]
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const

export const radii = {
  sm: 6,
  md: 10,
  lg: 16,
  pill: 999,
} as const

/** Minimum touch target (Apple HIG 44pt, Android 48dp is satisfied by rows). */
export const minTouch = 44
export const rowMinHeight = 76

export const fonts = {
  // System fonts until Phase 5 brings in Pirata One.
  heading: undefined as string | undefined,
  body: undefined as string | undefined,
} as const

export const type = {
  title: { fontFamily: fonts.heading, fontSize: 28, fontWeight: '800' as const },
  heading: { fontFamily: fonts.heading, fontSize: 20, fontWeight: '700' as const },
  row: { fontFamily: fonts.heading, fontSize: 24, fontWeight: '900' as const, letterSpacing: 0.5 },
  body: { fontFamily: fonts.body, fontSize: 16, fontWeight: '400' as const },
  bodyBold: { fontFamily: fonts.body, fontSize: 16, fontWeight: '700' as const },
  small: { fontFamily: fonts.body, fontSize: 13, fontWeight: '500' as const },
  button: { fontFamily: fonts.body, fontSize: 16, fontWeight: '800' as const, letterSpacing: 0.5 },
} as const

export const theme = { palette, colors, rowColors, spacing, radii, type, fonts, minTouch, rowMinHeight }
export default theme
