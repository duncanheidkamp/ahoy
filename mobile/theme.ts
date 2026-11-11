// The single source of colors, type, spacing, radii and motion for the app.
// No other file may hard-code a color or font (enforced by
// __tests__/theme.test.ts). Two palettes: dark (the default look, also used
// when the OS doesn't say) and light (parchment), picked from the system
// setting by useTheme(). Screens build their styles with createStyles().

import { StyleSheet, useColorScheme, type ImageStyle, type TextStyle, type ViewStyle } from 'react-native'

/** Raw nautical palette (the PWA's design system in CLAUDE.md, plus neutrals). */
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
  parchmentTan: '#f8e9c0', // raised parchment (rows, sheet actions) in light mode
  parchmentLine: '#d9c08a', // hairlines on parchment
  ink: '#1f1408', // body text on parchment
  inkMuted: '#8a6a44', // placeholders on white
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
  green700: '#15803d',
  green400: '#4ade80',
} as const

export type ColorScheme = 'light' | 'dark'

export interface ThemeColors {
  background: string
  surface: string
  surfaceRaised: string
  border: string
  text: string
  textMuted: string
  textSubtle: string
  /** Headings / brand text. */
  accent: string
  /** Text links. */
  link: string
  primary: string
  primaryText: string
  secondary: string
  secondaryText: string
  danger: string
  /** Text on a danger button. */
  dangerOn: string
  /** Error text on the background. */
  dangerText: string
  success: string
  inputBackground: string
  placeholder: string
  /** Text on the bold crew-row bands (always white). */
  onRow: string
  onRowMuted: string
  badgeBackground: string
  toastBackground: string
  toastText: string
  overlay: string
  countBadge: string
  countBadgeText: string
  /** Invite card on add/<username> (white text). */
  cardBackground: string
  /** Full-screen "Yo!" reveal (the PWA's black screen, white text). */
  revealBackground: string
  revealText: string
  /** The wave that sweeps across a row on send. */
  ripple: string
  /** Loading placeholders. */
  skeleton: string
}

const dark: ThemeColors = {
  background: palette.night950,
  surface: palette.night900,
  surfaceRaised: palette.night800,
  border: palette.night700,
  text: palette.white,
  textMuted: palette.slate400,
  textSubtle: palette.slate300,
  accent: palette.parchment100,
  link: palette.brass500,
  primary: palette.brass500,
  primaryText: palette.night950,
  secondary: palette.night800,
  secondaryText: palette.parchment100,
  danger: palette.red700,
  dangerOn: palette.white,
  dangerText: palette.red400,
  success: palette.green400,
  inputBackground: palette.night800,
  placeholder: palette.slate400,
  onRow: palette.white,
  onRowMuted: palette.white, // translucent white drops under 4.5:1 on the brass/gold bands
  badgeBackground: 'rgba(0,0,0,0.28)',
  toastBackground: palette.parchment100,
  toastText: palette.wood900,
  overlay: 'rgba(0,0,0,0.55)',
  countBadge: palette.red700,
  countBadgeText: palette.white,
  cardBackground: palette.ocean900,
  revealBackground: palette.black,
  revealText: palette.white,
  ripple: 'rgba(255,255,255,0.32)',
  skeleton: 'rgba(255,255,255,0.08)',
}

const light: ThemeColors = {
  background: palette.parchment50,
  surface: palette.parchment100,
  surfaceRaised: palette.parchmentTan,
  border: palette.parchmentLine,
  text: palette.ink,
  textMuted: palette.wood800,
  textSubtle: palette.wood900,
  accent: palette.ocean900,
  link: palette.ocean700,
  primary: palette.ocean900,
  primaryText: palette.parchment50,
  secondary: palette.parchment100,
  secondaryText: palette.ocean900,
  danger: palette.red700,
  dangerOn: palette.white,
  dangerText: palette.red700,
  success: palette.green700,
  inputBackground: palette.white,
  placeholder: palette.inkMuted,
  onRow: palette.white,
  onRowMuted: palette.white, // translucent white drops under 4.5:1 on the brass/gold bands
  badgeBackground: 'rgba(0,0,0,0.28)',
  toastBackground: palette.ocean900,
  toastText: palette.parchment50,
  overlay: 'rgba(12,74,110,0.45)',
  countBadge: palette.red700,
  countBadgeText: palette.white,
  cardBackground: palette.ocean900,
  revealBackground: palette.black,
  revealText: palette.white,
  ripple: 'rgba(255,255,255,0.32)',
  skeleton: 'rgba(120,53,15,0.10)',
}

/**
 * Crew row backgrounds, cycled by index, in both modes (bold Yo-style bands
 * from the palette). Every entry has >= 4.5:1 contrast with white text
 * (checked in __tests__/theme.test.ts). Parchment is never a row color —
 * white on it is ~1.1:1 — it's the light-mode background instead.
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

/**
 * Animation durations (ms). Nothing in the app animates longer than
 * motion.max; with Reduce Motion on, moments fall back to a plain fade
 * (lib/motion.ts).
 */
export const motion = {
  fast: 150,
  base: 200,
  slow: 300,
  max: 300,
} as const

/** Minimum touch target (Apple HIG 44pt; Android's 48dp is met by rows/buttons). */
export const minTouch = 44
export const rowMinHeight = 76

export const fonts = {
  /** Pirata One, loaded in app/_layout.tsx before the splash hides. */
  display: 'PirataOne_400Regular',
  /** System sans (San Francisco / Roboto). */
  body: undefined as string | undefined,
} as const

/**
 * Dynamic Type caps, only where a layout truly breaks. Pirata One is a
 * display face drawn large already; body text always scales freely.
 */
export const maxFontScale = {
  /** Screen titles and the Crew header wordmark. */
  display: 1.6,
  /** The phrase flashed on a crew row (the row grows up to this). */
  flash: 1.5,
  /** The full-screen Yo! — already 160pt and fit to width. */
  reveal: 1,
} as const

// Pirata One ships one weight; asking for bold makes Android fall back to the
// system font, so display styles stay at 400.
export const type = {
  title: { fontFamily: fonts.display, fontSize: 36, fontWeight: '400' as const },
  heading: { fontFamily: fonts.display, fontSize: 26, fontWeight: '400' as const },
  /** Native stack header titles. */
  navTitle: { fontFamily: fonts.display, fontSize: 24, fontWeight: '400' as const },
  /** Phrase flash on a crew row and the in-app banner title. */
  flash: { fontFamily: fonts.display, fontSize: 40, fontWeight: '400' as const, letterSpacing: 0.5 },
  reveal: { fontFamily: fonts.display, fontSize: 160, fontWeight: '400' as const },
  row: { fontFamily: fonts.body, fontSize: 24, fontWeight: '900' as const, letterSpacing: 0.5 },
  body: { fontFamily: fonts.body, fontSize: 16, fontWeight: '400' as const },
  bodyBold: { fontFamily: fonts.body, fontSize: 16, fontWeight: '700' as const },
  small: { fontFamily: fonts.body, fontSize: 13, fontWeight: '500' as const },
  button: { fontFamily: fonts.body, fontSize: 16, fontWeight: '800' as const, letterSpacing: 0.5 },
} as const

export interface Theme {
  scheme: ColorScheme
  colors: ThemeColors
  /** expo-status-bar style: light text on dark, dark text on light. */
  statusBar: 'light' | 'dark'
}

export const themes: Record<ColorScheme, Theme> = {
  dark: { scheme: 'dark', colors: dark, statusBar: 'light' },
  light: { scheme: 'light', colors: light, statusBar: 'dark' },
}

/** Dark unless the system explicitly asks for light. */
export function resolveScheme(system: string | null | undefined): ColorScheme {
  return system === 'light' ? 'light' : 'dark'
}

export function useTheme(): Theme {
  return themes[resolveScheme(useColorScheme())]
}

/**
 * Themed StyleSheet hook factory, built once per scheme:
 *   const useStyles = createStyles((c) => ({ box: { backgroundColor: c.surface } }))
 *   function X() { const styles = useStyles() ... }
 */
type NamedStyles = { readonly [key: string]: ViewStyle | TextStyle | ImageStyle }

export function createStyles<S extends NamedStyles>(factory: (colors: ThemeColors, theme: Theme) => S & NamedStyles) {
  const cache: Partial<Record<ColorScheme, Readonly<S>>> = {}
  return function useStyles(): Readonly<S> {
    const theme = useTheme()
    const hit = cache[theme.scheme]
    if (hit) return hit
    const styles = StyleSheet.create(factory(theme.colors, theme))
    cache[theme.scheme] = styles
    return styles
  }
}

export const theme = { palette, themes, rowColors, spacing, radii, motion, type, fonts, maxFontScale, minTouch, rowMinHeight }
export default theme
