/**
 * Web-Push Hilfsfunktionen.
 * - subscribePush(): Permission, ServiceWorker-Subscribe, an Backend pushen
 * - unsubscribePush(): bei Browser + Backend abbestellen
 * - getPushStatus(): { supported, permission, subscribed }
 */
import apiClient from './api';

function urlB64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

function arrayBufferToB64(buf) {
  return btoa(String.fromCharCode.apply(null, new Uint8Array(buf)));
}

export function pushSupported() {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window;
}

export async function getPushStatus() {
  if (!pushSupported()) {
    return { supported: false, permission: 'unsupported', subscribed: false };
  }
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  return {
    supported: true,
    permission: Notification.permission,  // default | granted | denied
    subscribed: !!sub,
  };
}

export async function subscribePush() {
  if (!pushSupported()) throw new Error('Push wird vom Browser nicht unterstützt');

  const perm = Notification.permission === 'default'
    ? await Notification.requestPermission()
    : Notification.permission;
  if (perm !== 'granted') throw new Error('Permission verweigert');

  const { data } = await apiClient.get('/users/push/public-key');
  if (!data?.public_key) throw new Error('Server hat keinen VAPID-Key konfiguriert');

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlB64ToUint8Array(data.public_key),
    });
  }
  const json = sub.toJSON();
  await apiClient.post('/users/me/push/subscribe', {
    endpoint: json.endpoint,
    p256dh: json.keys?.p256dh || '',
    auth: json.keys?.auth || '',
    user_agent: navigator.userAgent || '',
  });
  return true;
}

export async function unsubscribePush() {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    try { await apiClient.post('/users/me/push/unsubscribe', { endpoint: sub.endpoint }); } catch {}
    try { await sub.unsubscribe(); } catch {}
  }
}

export async function testPush() {
  await apiClient.post('/users/me/push/test');
}
