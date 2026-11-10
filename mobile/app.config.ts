import type { ConfigContext, ExpoConfig } from 'expo/config'

// Values come from mobile/.env locally (see .env.example) or from EAS
// environment variables in cloud builds (`eas env:create`). EXPO_PUBLIC_* are
// also inlined into the JS bundle by Metro; `extra` mirrors them so they are
// visible via expo-constants and so a missing value is obvious in
// `npx expo config`.
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
const EAS_PROJECT_ID = process.env.EAS_PROJECT_ID

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
