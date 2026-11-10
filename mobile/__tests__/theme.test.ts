/// <reference types="node" />
import { describe, expect, it } from '@jest/globals'
import fs from 'fs'
import path from 'path'

import { colors, rowColors } from '@/theme'

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m)
  return (x + 0.05) / (y + 0.05)
}

describe('theme', () => {
  it.each(rowColors.map((c) => [c]))('white text on row color %s is >= 4.5:1', (c) => {
    expect(colors.onRow).toBe('#ffffff')
    expect(contrast(c, '#ffffff')).toBeGreaterThanOrEqual(4.5)
  })

  it('primary button text and body text meet 4.5:1', () => {
    expect(contrast(colors.primary, colors.primaryText)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(colors.background, colors.text)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(colors.background, colors.textMuted)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(colors.background, colors.accent)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(colors.toastBackground, colors.toastText)).toBeGreaterThanOrEqual(4.5)
  })

  it('no hard-coded colors or fonts outside theme.ts', () => {
    const root = path.resolve(__dirname, '..')
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (['node_modules', '.expo', 'dist', '__tests__', 'assets'].includes(entry.name)) continue
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
