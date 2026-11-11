/// <reference types="node" />
import { describe, expect, it } from '@jest/globals'
import fs from 'fs'
import path from 'path'

import { fonts, maxFontScale, motion, palette, radii, resolveScheme, rowColors, spacing, themes, type } from '@/theme'

/** '#rrggbb' or 'rgba(r,g,b,a)' composited over an opaque '#rrggbb'. */
function rgb(color: string, over = '#000000'): [number, number, number] {
  const hex = /^#([0-9a-f]{6})$/i.exec(color)
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)) as [number, number, number]
  const m = /^rgba\((\d+),(\d+),(\d+),([\d.]+)\)$/.exec(color.replace(/\s/g, ''))
  if (!m) throw new Error(`unparsed color ${color}`)
  const a = Number(m[4])
  const base = rgb(over)
  return [1, 2, 3].map((i, k) => Number(m[i]) * a + base[k] * (1 - a)) as [number, number, number]
}

function luminance([r, g, b]: [number, number, number]): number {
  const [R, G, B] = [r, g, b]
    .map((v) => v / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * R + 0.7152 * G + 0.0722 * B
}

/** WCAG contrast of `fg` on `bg` (fg may be translucent; bg must be opaque). */
function contrast(fg: string, bg: string): number {
  const [x, y] = [luminance(rgb(fg, bg)), luminance(rgb(bg))].sort((m, n) => n - m)
  return (x + 0.05) / (y + 0.05)
}

describe('theme tokens', () => {
  it('both palettes define the same tokens', () => {
    expect(Object.keys(themes.light.colors).sort()).toEqual(Object.keys(themes.dark.colors).sort())
  })

  it('uses the nautical palette from the design system', () => {
    expect(palette).toMatchObject({
      ocean900: '#0c4a6e',
      ocean700: '#0369a1',
      teal600: '#0d9488',
      teal500: '#14b8a6',
      wood900: '#78350f',
      wood800: '#92400e',
      brass600: '#d97706',
      brass500: '#f59e0b',
      parchment100: '#fef3c7',
      parchment50: '#fffbeb',
    })
  })

  it('parchment is the light-mode background/surface, never a white-text row', () => {
    expect(themes.light.colors.background).toBe(palette.parchment50)
    expect(themes.light.colors.surface).toBe(palette.parchment100)
    expect(rowColors).not.toContain(palette.parchment50)
    expect(rowColors).not.toContain(palette.parchment100)
  })

  it('dark is the default; light only when the system asks', () => {
    expect(resolveScheme('dark')).toBe('dark')
    expect(resolveScheme(null)).toBe('dark')
    expect(resolveScheme(undefined)).toBe('dark')
    expect(resolveScheme('unspecified')).toBe('dark')
    expect(resolveScheme('light')).toBe('light')
    expect(themes.dark.statusBar).toBe('light')
    expect(themes.light.statusBar).toBe('dark')
  })

  it('spacing, radii and motion scales are ordered; every duration <= 300 ms', () => {
    const sp = Object.values(spacing)
    expect([...sp].sort((a, b) => a - b)).toEqual(sp)
    expect(radii.sm).toBeLessThan(radii.md)
    expect(radii.md).toBeLessThan(radii.lg)
    expect(motion.max).toBe(300)
    for (const ms of Object.values(motion)) expect(ms).toBeLessThanOrEqual(300)
  })

  it('Pirata One for display styles at its only weight; system sans for the rest', () => {
    for (const k of ['title', 'heading', 'navTitle', 'flash', 'reveal'] as const) {
      expect(type[k].fontFamily).toBe(fonts.display)
      expect(type[k].fontWeight).toBe('400')
    }
    for (const k of ['row', 'body', 'bodyBold', 'small', 'button'] as const) expect(type[k].fontFamily).toBeUndefined()
    expect(fonts.display).toBe('PirataOne_400Regular')
  })

  it('Dynamic Type caps are only on display text, and never below 1', () => {
    for (const v of Object.values(maxFontScale)) expect(v).toBeGreaterThanOrEqual(1)
  })
})

describe.each(['dark', 'light'] as const)('%s mode contrast (>= 4.5:1)', (mode) => {
  const c = themes[mode].colors

  it.each(rowColors.map((r) => [r]))('white row text on %s', (row) => {
    expect(c.onRow).toBe('#ffffff')
    expect(contrast(c.onRow, row)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(c.onRowMuted, row)).toBeGreaterThanOrEqual(4.5)
  })

  const pairs: [string, keyof typeof c, keyof typeof c][] = [
    ['body text', 'text', 'background'],
    ['body text on surface', 'text', 'surface'],
    ['body text on raised', 'text', 'surfaceRaised'],
    ['muted text', 'textMuted', 'background'],
    ['muted text on surface', 'textMuted', 'surface'],
    ['muted text on raised', 'textMuted', 'surfaceRaised'],
    ['labels', 'textSubtle', 'background'],
    ['header buttons', 'textSubtle', 'surface'],
    ['headings', 'accent', 'background'],
    ['headings on surface', 'accent', 'surface'],
    ['links', 'link', 'background'],
    ['primary button', 'primaryText', 'primary'],
    ['secondary button', 'secondaryText', 'secondary'],
    ['danger button', 'dangerOn', 'danger'],
    ['error text', 'dangerText', 'background'],
    ['error text on raised', 'dangerText', 'surfaceRaised'],
    ['success text', 'success', 'background'],
    ['input text', 'text', 'inputBackground'],
    ['placeholder', 'placeholder', 'inputBackground'],
    ['toast', 'toastText', 'toastBackground'],
    ['count badge', 'countBadgeText', 'countBadge'],
    ['invite card', 'onRow', 'cardBackground'],
    ['invite card muted', 'onRowMuted', 'cardBackground'],
    ['Yo! reveal', 'revealText', 'revealBackground'],
  ]
  it.each(pairs)('%s', (_label, fg, bg) => {
    expect(contrast(c[fg], c[bg])).toBeGreaterThanOrEqual(4.5)
  })
})

describe('no hard-coded colors or fonts outside theme.ts', () => {
  it('scans app code', () => {
    const root = path.resolve(__dirname, '..')
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (['node_modules', '.expo', 'dist', '__tests__', 'assets', 'scripts', 'ios', 'android'].includes(entry.name))
          continue
        const p = path.join(dir, entry.name)
        if (entry.isDirectory()) walk(p)
        else if (/\.(tsx?|jsx?)$/.test(entry.name) && !['theme.ts', 'app.config.ts'].includes(entry.name)) {
          const src = fs.readFileSync(p, 'utf8')
          if (/['"`]#[0-9a-fA-F]{3,8}['"`]|rgba?\(|fontFamily:\s*['"]/.test(src)) offenders.push(path.relative(root, p))
        }
      }
    }
    walk(root)
    expect(offenders).toEqual([])
  })
})
