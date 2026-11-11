import fs from 'fs'
import path from 'path'

import type { ConfigContext, ExpoConfig } from 'expo/config'
import { withInfoPlist, type ConfigPlugin } from 'expo/config-plugins'

// Values come from mobile/.env locally (see .env.example) or from EAS
// environment variables in cloud builds (`eas env:create`). EXPO_PUBLIC_* are
// also inlined into the JS bundle by Metro; `extra` mirrors them so they are
// visible via expo-constants and so a missing value is obvious in
// `npx expo config`.
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
const EAS_PROJECT_ID = process.env.EAS_PROJECT_ID

// Invite-links domain (links/ static site). Same variable and default as
// lib/env.ts. Drives iOS associated domains and the Android App Links intent
// filter, so changing it needs a new native build.
const LINKS_DOMAIN = (process.env.EXPO_PUBLIC_LINKS_DOMAIN ?? '').trim() || 'ahoy.example'

// Google Sign-In (iOS) registers the reversed iOS client ID as a URL scheme:
// 1234-abc.apps.googleusercontent.com -> com.googleusercontent.apps.1234-abc.
// Without a client ID a placeholder keeps prebuild working; the app hides the
// Google button until the EXPO_PUBLIC_GOOGLE_* ids are set (README).
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? ''
const GOOGLE_IOS_URL_SCHEME = GOOGLE_IOS_CLIENT_ID.endsWith('.apps.googleusercontent.com')
  ? `com.googleusercontent.apps.${GOOGLE_IOS_CLIENT_ID.replace('.apps.googleusercontent.com', '')}`
  : 'com.googleusercontent.apps.not-configured'

// Android FCM client config. Never committed (gitignored). In EAS cloud builds
// it comes from a *file* environment variable named GOOGLE_SERVICES_JSON
// (`eas env:create --type file`), whose value is the path to the file on the
// build machine. Locally, set GOOGLE_SERVICES_JSON to a path, or drop the file
// at mobile/google-services.json. Without it the app builds but Android can't
// get a push token. See README "Push notifications".
const LOCAL_GOOGLE_SERVICES = './google-services.json'
const GOOGLE_SERVICES_FILE =
  process.env.GOOGLE_SERVICES_JSON ??
  (fs.existsSync(path.join(__dirname, LOCAL_GOOGLE_SERVICES)) ? LOCAL_GOOGLE_SERVICES : undefined)

// APNs environment for the aps-environment entitlement. Store/TestFlight
// builds need 'production'; dev-client builds use 'development'.
const APNS_MODE = process.env.EAS_BUILD_PROFILE === 'production' ? 'production' : 'development'

const BUNDLE_ID = 'com.duncanheidkamp.ahoy'

// Builds that don't contain the dev client (EAS preview/production). Local
// prebuilds and the development profiles keep the dev launcher's keys.
const RELEASE_PROFILE = ['preview', 'production'].includes(process.env.EAS_BUILD_PROFILE ?? '')

// EAS Update. runtimeVersion policy 'appVersion': an update only reaches
// binaries with the same `version` below. Rule: ANY native change (new native
// module or config plugin, sound, icon/splash, permissions, associated
// domains, Google iOS client id, expo SDK bump) => bump `version` and make new
// builds. Chosen over 'fingerprint' because this config reads env vars that
// differ between the build machine and the machine running `eas update`
// (EAS_BUILD_PROFILE -> APNs mode, GOOGLE_SERVICES_JSON path), which would make
// the fingerprints disagree and updates silently never apply.
const APP_VERSION = '1.0.0'

/**
 * Store hygiene for the iOS Info.plist (runs after the library plugins, see
 * the note where it is registered):
 *   * expo-task-manager always adds the `fetch` background mode. Ahoy has no
 *     background fetch: the only task is the Android-only notification-action
 *     task (lib/push/bootstrap.ts). "Ahoy back!" on iOS is a notification
 *     action, which needs no background mode, and there are no silent pushes,
 *     so `remote-notification` is not needed either. App Review asks about
 *     declared-but-unused modes.
 *   * Release builds drop the dev launcher's local-network keys
 *     (NSLocalNetworkUsageDescription / NSBonjourServices): the dev client
 *     isn't in those builds, so the strings would be unused.
 */
const withStoreHygiene: ConfigPlugin = (config) =>
  withInfoPlist(config, (cfg) => {
    const plist = cfg.modResults as Record<string, unknown>
    const modes = Array.isArray(plist.UIBackgroundModes) ? (plist.UIBackgroundModes as string[]) : []
    const kept = modes.filter((m) => m !== 'fetch')
    if (kept.length > 0) plist.UIBackgroundModes = kept
    else delete plist.UIBackgroundModes
    if (RELEASE_PROFILE) {
      delete plist.NSLocalNetworkUsageDescription
      delete plist.NSBonjourServices
    }
    return cfg
  })

const baseConfig = ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Ahoy',
  slug: 'ahoy',
  scheme: 'ahoy',
  version: APP_VERSION,
  // See APP_VERSION above. Channels are set per build profile in eas.json.
  runtimeVersion: { policy: 'appVersion' },
  ...(EAS_PROJECT_ID
    ? {
        updates: {
          url: `https://u.expo.dev/${EAS_PROJECT_ID}`,
          // Check on launch, never block it: a new update is downloaded in the
          // background and runs on the next cold start.
          checkAutomatically: 'ON_LOAD' as const,
          fallbackToCacheTimeout: 0,
        },
      }
    : {}),
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  // Light/dark follow the system (theme.ts has both palettes; dark is the
  // default look). The root view color is set at runtime per theme.
  userInterfaceStyle: 'automatic',
  backgroundColor: '#0a0f1a', // themes.dark.colors.background (app.config can't import theme.ts)
  platforms: ['ios', 'android'],
  ios: {
    bundleIdentifier: BUNDLE_ID,
    supportsTablet: false,
    // Home-screen appearances (iOS 18+): light, dark (transparent, the system
    // adds the backdrop) and tinted (grayscale). Sources: scripts/make-icons.py.
    icon: {
      light: './assets/images/icon.png',
      dark: './assets/images/icon-dark.png',
      tinted: './assets/images/icon-tinted.png',
    },
    // Sign in with Apple capability (com.apple.developer.applesignin).
    usesAppleSignIn: true,
    // Universal links for invites: https://<LINKS_DOMAIN>/add/<username>.
    associatedDomains: [`applinks:${LINKS_DOMAIN}`],
    infoPlist: {
      // Only standard HTTPS (Supabase, Expo) -> exempt; TestFlight stops asking
      // the export-compliance question on every build.
      ITSAppUsesNonExemptEncryption: false,
    },
    // Required-reason APIs (Apple privacy manifest). Ahoy's own JS calls none
    // directly; these are the union of what the bundled native dependencies
    // declare in their own PrivacyInfo.xcprivacy files, copied here because
    // Apple doesn't reliably read manifests from static CocoaPods
    // (docs.expo.dev/guides/apple-privacy). Recheck after adding a native
    // dependency: find node_modules -name PrivacyInfo.xcprivacy
    //   UserDefaults CA92.1: expo-constants, expo-notifications, expo-system-ui,
    //     expo-task-manager, expo-eas-client (expo-updates), React Native
    //   FileTimestamp C617.1: expo-application, React Native (+ folly, glog, boost);
    //     0A2A.1 / 3B52.1: expo-file-system (pulled in by expo)
    //   SystemBootTime 35F9.1: expo-device, React Native timing, boost
    //   DiskSpace E174.1 / 85F4.1: expo-file-system
    // No AsyncStorage (key-value data is in SecureStore = Keychain, which is
    // not a required-reason API). No tracking, no tracking domains, and no
    // collected-data types here: those are declared in App Store Connect
    // (store/app-store-connect.md).
    privacyManifests: {
      NSPrivacyTracking: false,
      NSPrivacyTrackingDomains: [],
      NSPrivacyCollectedDataTypes: [],
      NSPrivacyAccessedAPITypes: [
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
          NSPrivacyAccessedAPITypeReasons: ['CA92.1'],
        },
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryFileTimestamp',
          NSPrivacyAccessedAPITypeReasons: ['C617.1', '0A2A.1', '3B52.1'],
        },
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategorySystemBootTime',
          NSPrivacyAccessedAPITypeReasons: ['35F9.1'],
        },
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryDiskSpace',
          NSPrivacyAccessedAPITypeReasons: ['E174.1', '85F4.1'],
        },
      ],
    },
  },
  android: {
    package: BUNDLE_ID,
    // Adaptive icon: AHOY on the ocean/wave background; monochrome for
    // Android 13+ themed icons.
    adaptiveIcon: {
      backgroundColor: '#0c4a6e',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    // targetSdk/compileSdk come from Expo SDK 58 / React Native 0.88 defaults
    // (targetSdk 36, compileSdk 37, minSdk 24), which meets Google Play's
    // "target API 36" rule (from 31 Aug 2026). No expo-build-properties
    // override on purpose — see README "Ship it".
    //
    // Permissions libraries or the template add that Ahoy never uses
    // (removed from the merged manifest with tools:node="remove"):
    // SYSTEM_ALERT_WINDOW (template; dev overlays only), READ/WRITE_EXTERNAL_STORAGE
    // (expo-file-system; Ahoy reads/writes no shared files), RECORD_AUDIO
    // (expo-audio only adds it if recording is enabled; blocked as a guard).
    // Kept: INTERNET, POST_NOTIFICATIONS + RECEIVE_BOOT_COMPLETED
    // (expo-notifications), VIBRATE (haptics, notification vibration),
    // MODIFY_AUDIO_SETTINGS (expo-audio playback; install-time, no prompt),
    // ACCESS_NETWORK_STATE (expo-updates), BIND_JOB_SERVICE (expo-task-manager's
    // job service, not a user permission).
    blockedPermissions: [
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.RECORD_AUDIO',
    ],
    // Android App Links for invites; verified against
    // https://<LINKS_DOMAIN>/.well-known/assetlinks.json.
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        data: [{ scheme: 'https', host: LINKS_DOMAIN, pathPrefix: '/add/' }],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
    ...(GOOGLE_SERVICES_FILE ? { googleServicesFile: GOOGLE_SERVICES_FILE } : {}),
  },
  plugins: [
    'expo-router',
    // No Face ID: Ahoy never uses requireAuthentication, so no
    // NSFaceIDUsageDescription.
    ['expo-secure-store', { faceIDPermission: false }],
    'expo-apple-authentication',
    ['@react-native-google-signin/google-signin', { iosUrlScheme: GOOGLE_IOS_URL_SCHEME }],
    [
      'expo-splash-screen',
      {
        // Follows the system appearance like the app (theme.ts backgrounds).
        backgroundColor: '#fffbeb',
        image: './assets/images/splash-icon-light.png',
        dark: {
          backgroundColor: '#0a0f1a',
          image: './assets/images/splash-icon-dark.png',
        },
        imageWidth: 240,
        resizeMode: 'contain',
      },
    ],
    [
      'expo-notifications',
      {
        // Bundled into the iOS app and android/app/src/main/res/raw. Pushes
        // name it as sound: 'ahoy.wav'; the Android channel ahoy-v1 uses it.
        sounds: ['./assets/sounds/ahoy.wav'],
        // Android status bar: white anchor silhouette (scripts/make-icons.py).
        icon: './assets/images/notification-icon.png',
        color: '#0c4a6e',
        // FCM fallback channel for pushes without a channelId.
        defaultChannel: 'ahoy-v1',
        mode: APNS_MODE,
        // No silent/content-available pushes, so no remote-notification
        // background mode. The "Ahoy back!" action does not need it (see README).
        enableBackgroundRemoteNotifications: false,
      },
    ],
    [
      // Playback only (the in-app ahoy sound). No mic, no background audio.
      'expo-audio',
      {
        microphonePermission: false,
        recordAudioAndroid: false,
        enableBackgroundPlayback: false,
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    supabaseUrl: SUPABASE_URL ?? null,
    supabaseAnonKey: SUPABASE_ANON_KEY ?? null,
    linksDomain: LINKS_DOMAIN,
    ...(EAS_PROJECT_ID ? { eas: { projectId: EAS_PROJECT_ID } } : {}),
  },
})

// withStoreHygiene wraps the config instead of sitting in `plugins` (ExpoConfig
// types only allow named plugins there). It is registered before the
// `plugins` array is applied, and mods run last-registered-first, so its
// Info.plist edit runs after every library plugin's, including
// expo-task-manager's, which adds `fetch`.
const appConfig = (ctx: ConfigContext): ExpoConfig => withStoreHygiene(baseConfig(ctx))

export default appConfig
