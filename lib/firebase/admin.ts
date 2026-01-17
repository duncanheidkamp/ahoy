import { initializeApp, getApps, cert, App } from 'firebase-admin/app'
import { getMessaging, Messaging } from 'firebase-admin/messaging'

let app: App | undefined
let messaging: Messaging | undefined

function formatPrivateKey(key: string | undefined): string | undefined {
  if (!key) return undefined

  // Handle various formats the key might be in
  let formatted = key

  // Remove surrounding quotes if present
  if ((formatted.startsWith('"') && formatted.endsWith('"')) ||
      (formatted.startsWith("'") && formatted.endsWith("'"))) {
    formatted = formatted.slice(1, -1)
  }

  // Replace literal \n with actual newlines
  formatted = formatted.replace(/\\n/g, '\n')

  // Ensure proper PEM format
  if (!formatted.includes('-----BEGIN')) {
    console.error('Private key does not appear to be in PEM format')
    return undefined
  }

  return formatted
}

function getFirebaseAdmin() {
  if (!app && getApps().length === 0) {
    // Check for service account credentials
    const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
    const privateKey = formatPrivateKey(process.env.FIREBASE_PRIVATE_KEY)

    if (!projectId || !clientEmail || !privateKey) {
      console.warn('Firebase Admin credentials not configured:', {
        hasProjectId: !!projectId,
        hasClientEmail: !!clientEmail,
        hasPrivateKey: !!privateKey
      })
      return { app: undefined, messaging: undefined }
    }

    try {
      app = initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      })
    } catch (error) {
      console.error('Failed to initialize Firebase Admin:', error)
      return { app: undefined, messaging: undefined }
    }
  } else if (!app) {
    app = getApps()[0]
  }

  if (app && !messaging) {
    messaging = getMessaging(app)
  }

  return { app, messaging }
}

export async function sendPushNotification(
  token: string,
  title: string,
  body: string,
  data?: Record<string, string>
) {
  const { messaging } = getFirebaseAdmin()

  if (!messaging) {
    console.warn('Firebase messaging not initialized')
    return false
  }

  try {
    await messaging.send({
      token,
      notification: {
        title,
        body,
      },
      webpush: {
        notification: {
          icon: '/icons/icon-192.png',
          badge: '/icons/icon-72.png',
          actions: [
            {
              action: 'ahoy_back',
              title: 'Ahoy back!',
            },
          ],
        },
        fcmOptions: {
          link: '/dashboard',
        },
      },
      data,
    })
    return true
  } catch (error) {
    console.error('Failed to send push notification:', error)
    return false
  }
}
