// Local notifications for Store Tasks.
// Schedules a device notification (with alert sound) at the task's due time so
// the team gets reminded even when the app is closed. Falls back gracefully if
// permissions are denied or the module isn't available (e.g. Expo Go on web).
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

let Notifications = null;
try {
  // Loaded lazily so the app still runs if the native module is missing.
  Notifications = require('expo-notifications');
} catch {
  Notifications = null;
}

const MAP_KEY = 'storeTaskNotifs';   // { [taskId]: scheduledNotificationId }
const CHANNEL = 'store-tasks';

// Foreground behaviour: show the banner AND play the alert sound.
if (Notifications?.setNotificationHandler) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

// Create the Android channel once at startup (controls sound + importance).
export async function initNotifications() {
  if (!Notifications) return;
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL, {
        name: 'Store Tasks',
        importance: Notifications.AndroidImportance.MAX,
        sound: 'default',
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#2dd4bf',
        enableVibrate: true,
      });
    }
  } catch { /* ignore */ }
}

export async function ensurePermission() {
  if (!Notifications) return false;
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.status === 'granted') return true;
    const req = await Notifications.requestPermissionsAsync();
    return req.status === 'granted';
  } catch { return false; }
}

async function readMap() {
  try { return JSON.parse((await AsyncStorage.getItem(MAP_KEY)) || '{}'); }
  catch { return {}; }
}
async function writeMap(m) {
  try { await AsyncStorage.setItem(MAP_KEY, JSON.stringify(m)); } catch { /* ignore */ }
}

// Schedule (or reschedule) a reminder for a task. task = { id, title, details, due_at }.
// Returns the scheduled notification id, or null if not scheduled.
export async function scheduleTaskReminder(task) {
  if (!Notifications || !task?.id || !task?.due_at) return null;
  const when = new Date(task.due_at);
  if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now() + 1000) return null;

  const ok = await ensurePermission();
  if (!ok) return null;

  // Replace any previous reminder for this task first.
  await cancelTaskReminder(task.id);

  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: task.title || 'Store task',
        body: task.details ? String(task.details) : 'Tap to open the task.',
        sound: 'default',
        data: { taskId: task.id, type: 'store-task' },
      },
      trigger: Platform.OS === 'android' ? { date: when, channelId: CHANNEL } : when,
    });
    const m = await readMap();
    m[task.id] = id;
    await writeMap(m);
    return id;
  } catch { return null; }
}

// Cancel a previously scheduled reminder (when a task is done or deleted).
export async function cancelTaskReminder(taskId) {
  if (!Notifications || !taskId) return;
  try {
    const m = await readMap();
    const id = m[taskId];
    if (id) {
      try { await Notifications.cancelScheduledNotificationAsync(id); } catch { /* ignore */ }
      delete m[taskId];
      await writeMap(m);
    }
  } catch { /* ignore */ }
}
