// Imported first by index.ts, before expo-router mounts anything, so that:
//   * the foreground handler and the "ahoy" category exist before any
//     notification is presented,
//   * the response listener is attached before the native side flushes
//     responses that launched the app,
//   * the Android background task is defined at module scope (required: the
//     headless runtime loads this bundle and only runs module-scope code).

import * as Notifications from 'expo-notifications'
import * as TaskManager from 'expo-task-manager'
import { Platform } from 'react-native'

import { BACKGROUND_NOTIFICATION_TASK } from './constants'
import { checkLastNotificationResponse, configureNotifications, responseHandler } from './native'

configureNotifications()

Notifications.addNotificationResponseReceivedListener((response) => {
  void responseHandler.handle(response, 'listener')
})

// Cold start (tap or action launched the app). Also re-checked on every
// foreground by usePushSession(); dedupe makes repeats harmless.
void checkLastNotificationResponse()

// Android: action buttons tapped while the app is backgrounded or killed run
// this task (headless). iOS never delivers responses here — it wakes the app
// and uses the listener / last-response path instead — so iOS doesn't
// register the task (that would also require the remote-notification
// background mode, which we don't otherwise need).
TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, async ({ data, error }) => {
  if (error || !data) return
  await responseHandler.handle(data, 'task')
})

if (Platform.OS === 'android') {
  Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK).catch(() => {})
}
