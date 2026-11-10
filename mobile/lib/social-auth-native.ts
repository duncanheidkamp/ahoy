// Real Apple / Google SDK calls behind lib/social-auth.ts.

import {
  GoogleSignin,
  isCancelledResponse,
  isSuccessResponse,
} from '@react-native-google-signin/google-signin'
import * as AppleAuthentication from 'expo-apple-authentication'
import * as Crypto from 'expo-crypto'
import { Platform } from 'react-native'

import { GOOGLE_CLIENT_IDS } from './env'
import {
  availableProviders,
  signInWithApple,
  signInWithGoogle,
  type IdTokenSignIn,
  type NonceDeps,
  type Provider,
  type SocialResult,
} from './social-auth'
import { supabase } from './supabase'

const nonceDeps: NonceDeps = {
  randomBytes: (n) => Crypto.getRandomBytes(n),
  sha256Hex: (s) =>
    Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, s, { encoding: Crypto.CryptoEncoding.HEX }),
}

const signInWithIdToken: IdTokenSignIn = async ({ provider, token, nonce }) => {
  const { error } = await supabase.auth.signInWithIdToken({ provider, token, ...(nonce ? { nonce } : {}) })
  return { error: error ? { message: error.message } : null }
}

export async function appleAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false
  return AppleAuthentication.isAvailableAsync().catch(() => false)
}

export async function socialProviders(): Promise<Provider[]> {
  return availableProviders({
    platform: Platform.OS,
    appleAvailable: await appleAvailable(),
    googleClientIds: GOOGLE_CLIENT_IDS,
  })
}

export function appleSignIn(): Promise<SocialResult> {
  return signInWithApple({
    ...nonceDeps,
    appleSignIn: (hashedNonce) =>
      AppleAuthentication.signInAsync({
        // Email only: the username is picked in-app; we don't store names.
        requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL],
        nonce: hashedNonce,
      }),
    signInWithIdToken,
  })
}

let googleConfigured = false
function configureGoogle() {
  if (googleConfigured) return
  GoogleSignin.configure({
    webClientId: GOOGLE_CLIENT_IDS.web,
    ...(Platform.OS === 'ios' ? { iosClientId: GOOGLE_CLIENT_IDS.ios } : {}),
  })
  googleConfigured = true
}

export function googleSignIn(): Promise<SocialResult> {
  configureGoogle()
  return signInWithGoogle({
    ensurePlayServices: async () => {
      if (Platform.OS === 'android') await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true })
    },
    googleSignIn: async () => {
      const response = await GoogleSignin.signIn()
      if (isCancelledResponse(response)) return { type: 'cancelled' }
      if (isSuccessResponse(response)) return { type: 'success', idToken: response.data.idToken }
      return { type: 'cancelled' }
    },
    signInWithIdToken,
  })
}

/** Forget the Google account choice on this device (logout / deletion). */
export async function googleSignOut(): Promise<void> {
  try {
    if (GOOGLE_CLIENT_IDS.web) {
      configureGoogle()
      await GoogleSignin.signOut()
    }
  } catch {
    // Not signed in with Google / native module unavailable.
  }
}

/** For account deletion on iOS: a fresh Apple authorization code, or null. */
export async function appleAuthorizationCodeForDeletion(hasAppleIdentity: boolean): Promise<string | null> {
  if (!hasAppleIdentity || !(await appleAvailable())) return null
  try {
    const credential = await AppleAuthentication.signInAsync({ requestedScopes: [] })
    return credential.authorizationCode
  } catch {
    // Cancelled or failed: delete anyway (revocation is best effort).
    return null
  }
}
