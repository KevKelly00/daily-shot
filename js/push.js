import { supabase } from './auth.js';

const VAPID_PUBLIC_KEY = 'BB5FROIDvQKy7eljnAi_44rEPGksjtRkrpUyGQVV-1m9FH63PHr0zVoybbBntW1plmVZnpIgV72811oYeNdOI0Y';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw     = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

export async function subscribeToPush(userId) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return;

  const reg          = await navigator.serviceWorker.ready;
  const subscription = await reg.pushManager.subscribe({
    userVisibleOnly:      true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  });

  const { endpoint, keys: { p256dh, auth } } = subscription.toJSON();

  await supabase.from('push_subscriptions').upsert(
    { user_id: userId, endpoint, p256dh, auth },
    { onConflict: 'user_id,endpoint' }
  );
}

export async function unsubscribeFromPush(userId) {
  if (!('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    await supabase.from('push_subscriptions').delete()
      .eq('user_id', userId).eq('endpoint', sub.endpoint);
    await sub.unsubscribe();
  }
}

// Check current subscription state
export async function isPushSubscribed() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  return !!sub;
}

// Fire and forget — won't break anything if it fails
export function sendNotification(targetUserId, title, body, url) {
  fetch('/api/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target_user_id: targetUserId, title, body, url }),
  }).catch(() => {});
}
