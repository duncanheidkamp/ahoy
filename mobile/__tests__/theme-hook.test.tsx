import { describe, expect, it, jest } from '@jest/globals'
import { renderHook } from '@testing-library/react-native'

import { createStyles, themes, useTheme } from '@/theme'

const mockScheme = jest.fn<() => 'light' | 'dark' | null>(() => null)
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({ __esModule: true, default: () => mockScheme() }))

const useStyles = createStyles((c) => ({ box: { backgroundColor: c.background, borderColor: c.border } }))

describe('useTheme / createStyles follow the system appearance', () => {
  it('dark when the system says nothing (the default look)', async () => {
    mockScheme.mockReturnValue(null)
    const { result } = await renderHook(() => useTheme())
    expect(result.current).toBe(themes.dark)
  })

  it('light palette and dark status bar text when the system is light', async () => {
    mockScheme.mockReturnValue('light')
    const { result } = await renderHook(() => ({ theme: useTheme(), styles: useStyles() }))
    expect(result.current.theme.scheme).toBe('light')
    expect(result.current.theme.statusBar).toBe('dark')
    expect(result.current.styles.box.backgroundColor).toBe(themes.light.colors.background)
  })

  it('styles are rebuilt for dark and cached per scheme', async () => {
    mockScheme.mockReturnValue('dark')
    const a = await renderHook(() => useStyles())
    const b = await renderHook(() => useStyles())
    expect(a.result.current.box.backgroundColor).toBe(themes.dark.colors.background)
    expect(a.result.current).toBe(b.result.current)
  })
})
