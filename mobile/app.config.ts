import fs from 'fs'
import path from 'path'

import type { ConfigContext, ExpoConfig } from 'expo/config'

// Values come from mobile/.env locally (see .env.example) or from EAS
// environment variables in cloud builds (`eas env:create`). EXPO_PUBLIC_* are
// also inlined into the JS bundle by Metro; `extra` mirrors them so they are
// visible via expo-constants and so a missing value is obvious in
// `npx expo config`.
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
const EAS_PROJECT_ID = process.env.EAS_PROJECT_ID

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

const appConfig = ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Ahoy',
  slug: 'ahoy',
  scheme: 'ahoy',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  userInterfaceStyle: 'dark',
  backgroundColor: '#0a0f1a', // theme.colors.background (app.config can't import theme.ts)
  platforms: ['ios', 'android'],
  ios: {
    bundleIdentifier: BUNDLE_ID,
    supportsTablet: false,
    icon: './assets/expo.icon',
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: BUNDLE_ID,
    adaptiveIcon: {
      backgroundColor: '#0c4a6e',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    ...(GOOGLE_SERVICES_FILE ? { googleServicesFile: GOOGLE_SERVICES_FILE } : {}),
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    [
      'expo-splash-screen',
      {
        backgroundColor: '#0a0f1a',
        image: './assets/images/splash-icon.png',
        imageWidth: 76,
      },
    ],
    [
      'expo-notifications',
      {
        // Bundled into the iOS app and android/app/src/main/res/raw. Pushes
        // name it as sound: 'ahoy.wav'; the Android channel ahoy-v1 uses it.
        sounds: ['./assets/sounds/ahoy.wav'],
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
    ...(EAS_PROJECT_ID ? { eas: { projectId: EAS_PROJECT_ID } } : {}),
  },
})

export default appConfig
