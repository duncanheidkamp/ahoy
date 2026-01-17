import { initializeApp, getApps, cert, App } from 'firebase-admin/app'
import { getMessaging, Messaging } from 'firebase-admin/messaging'

let app: App | undefined
let messaging: Messaging | undefined

function getFirebaseAdmin() {
  if (!app && getApps().length === 0) {
    // Check for service account credentials
    const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')

    if (!projectId || !clientEmail || !privateKey) {
      console.warn('Firebase Admin credentials not configured')
      return { app: undefined, messaging: undefined }
    }

    app = initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    })
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
