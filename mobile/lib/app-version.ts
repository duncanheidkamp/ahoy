import Constants from 'expo-constants'
import * as Application from 'expo-application'
import { Platform } from 'react-native'

/** e.g. "1.0.0 (12) ios" — stored with feedback. */
export function appVersionLabel(): string {
  const version = Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? 'unknown'
  const build = Application.nativeBuildVersion
  return `${version}${build ? ` (${build})` : ''} ${Platform.OS}`
}
