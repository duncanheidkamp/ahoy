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

const appConfig = ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Ahoy',
  slug: 'ahoy',
  scheme: 'ahoy',
  version: '1.0.0',
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
      ITSAppUsesNonExemptEncryption: false,
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
    'expo-secure-store',
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

export default appConfig
