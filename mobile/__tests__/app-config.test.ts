// Store-readiness of app.config.ts (Phase 6). The generated Info.plist /
// AndroidManifest are also checked by hand with `npx expo prebuild` (README
// "Ship it"); these tests pin the config that drives them.
import { describe, expect, it, jest } from '@jest/globals'
import type { ExpoConfig } from 'expo/config'

type Ctx = Parameters<typeof import('../app.config').default>[0]

function load(env: Record<string, string | undefined> = {}): ExpoConfig {
  const saved = { ...process.env }
  Object.assign(process.env, env)
  for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k]
  try {
    let mod: typeof import('../app.config') | undefined
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- fresh module per env
      mod = require('../app.config')
    })
    return mod!.default({ config: {} } as Ctx)
  } finally {
    process.env = saved
  }
}

type PlistMod = (cfg: unknown) => Promise<{ modResults: Record<string, unknown> }>

async function runInfoPlistMod(config: ExpoConfig, plist: Record<string, unknown>) {
  const mod = (config as unknown as { mods: { ios: { infoPlist: PlistMod } } }).mods.ios.infoPlist
  const result = await mod({
    ...config,
    modResults: plist,
    modRequest: { platform: 'ios', modName: 'infoPlist', nextMod: (c: unknown) => c, introspect: false },
  })
  return result.modResults
}

describe('app config', () => {
  it('uses the appVersion runtime policy and EAS Update only with a project id', () => {
    const without = load({ EAS_PROJECT_ID: undefined })
    expect(without.runtimeVersion).toEqual({ policy: 'appVersion' })
    expect(without.updates).toBeUndefined()

    const withId = load({ EAS_PROJECT_ID: 'abc-123' })
    expect(withId.updates?.url).toBe('https://u.expo.dev/abc-123')
    expect(withId.updates?.fallbackToCacheTimeout).toBe(0)
    expect(withId.extra?.eas).toEqual({ projectId: 'abc-123' })
  })

  it('declares no tracking and the required-reason APIs the dependencies use', () => {
    const pm = load().ios?.privacyManifests
    expect(pm?.NSPrivacyTracking).toBe(false)
    const types = Object.fromEntries(
      (pm?.NSPrivacyAccessedAPITypes ?? []).map((t) => [t.NSPrivacyAccessedAPIType, t.NSPrivacyAccessedAPITypeReasons])
    )
    expect(types.NSPrivacyAccessedAPICategoryUserDefaults).toContain('CA92.1')
    expect(types.NSPrivacyAccessedAPICategoryFileTimestamp).toContain('C617.1')
    expect(types.NSPrivacyAccessedAPICategorySystemBootTime).toContain('35F9.1')
    expect(types.NSPrivacyAccessedAPICategoryDiskSpace).toContain('E174.1')
  })

  it('is export-compliance exempt and asks for no Face ID string', () => {
    const config = load()
    expect(config.ios?.infoPlist?.ITSAppUsesNonExemptEncryption).toBe(false)
    expect(config.plugins).toContainEqual(['expo-secure-store', { faceIDPermission: false }])
  })

  it('blocks Android permissions Ahoy never uses', () => {
    expect(load().android?.blockedPermissions).toEqual(
      expect.arrayContaining([
        'android.permission.SYSTEM_ALERT_WINDOW',
        'android.permission.READ_EXTERNAL_STORAGE',
        'android.permission.WRITE_EXTERNAL_STORAGE',
        'android.permission.RECORD_AUDIO',
      ])
    )
  })

  it('removes the fetch background mode (and dev-launcher keys in release builds)', async () => {
    const devKeys = { NSLocalNetworkUsageDescription: 'dev launcher', NSBonjourServices: ['_expo._tcp'] }

    const local = await runInfoPlistMod(load({ EAS_BUILD_PROFILE: undefined }), {
      UIBackgroundModes: ['fetch'],
      ...devKeys,
    })
    expect(local.UIBackgroundModes).toBeUndefined()
    expect(local.NSLocalNetworkUsageDescription).toBe('dev launcher')

    const prod = await runInfoPlistMod(load({ EAS_BUILD_PROFILE: 'production' }), {
      UIBackgroundModes: ['fetch', 'audio'],
      ...devKeys,
    })
    expect(prod.UIBackgroundModes).toEqual(['audio'])
    expect(prod.NSLocalNetworkUsageDescription).toBeUndefined()
    expect(prod.NSBonjourServices).toBeUndefined()
  })
})
