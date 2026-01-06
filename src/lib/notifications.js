import { supabase } from './supabase';

/**
 * Request notification permission from user
 * @returns {Promise<string>} 'granted', 'denied', or 'default'
 */
export async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    console.warn('This browser does not support notifications');
    return 'denied';
  }

  if (Notification.permission === 'granted') {
    return 'granted';
  }

  if (Notification.permission === 'denied') {
    return 'denied';
  }

  const permission = await Notification.requestPermission();
  return permission;
}

/**
 * Check if notifications are supported
 * @returns {boolean}
 */
export function isNotificationSupported() {
  return 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
}

/**
 * Register service worker
 * @returns {Promise<ServiceWorkerRegistration>}
 */
export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    throw new Error('Service Workers are not supported');
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });
    return registration;
  } catch (error) {
    console.error('Service Worker registration failed:', error);
    throw error;
  }
}

/**
 * Subscribe to push notifications
 * @param {ServiceWorkerRegistration} registration
 * @param {string} vapidPublicKey - VAPID public key from Supabase
 * @returns {Promise<PushSubscription>}
 */
export async function subscribeToPush(registration, vapidPublicKey) {
  try {
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });
    return subscription;
  } catch (error) {
    console.error('Push subscription failed:', error);
    throw error;
  }
}

/**
 * Save push subscription to Supabase
 * @param {string} userId
 * @param {PushSubscription} subscription
 * @returns {Promise<void>}
 */
export async function savePushSubscription(userId, subscription) {
  const subscriptionData = {
    user_id: userId,
    subscription: subscription.toJSON(),
  };

  // Check if subscription already exists for this user
  const { data: existing } = await supabase
    .from('he_push_subscriptions')
    .select('id')
    .eq('user_id', userId)
    .single();

  if (existing) {
    // Update existing subscription
    const { error } = await supabase
      .from('he_push_subscriptions')
      .update({
        subscription: subscriptionData.subscription,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    if (error) {
      console.error('Error updating push subscription:', error);
      throw error;
    }
  } else {
    // Insert new subscription
    const { error } = await supabase
      .from('he_push_subscriptions')
      .insert([subscriptionData]);

    if (error) {
      console.error('Error saving push subscription:', error);
      throw error;
    }
  }
}

/**
 * Check if user has an active push subscription
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
export async function hasPushSubscription(userId) {
  try {
    const { data, error } = await supabase
      .from('he_push_subscriptions')
      .select('id')
      .eq('user_id', userId)
      .limit(1);
    
    if (error) {
      console.error('Error checking subscription:', error);
      return false;
    }
    
    return data && data.length > 0;
  } catch (error) {
    console.error('Error checking subscription:', error);
    return false;
  }
}

/**
 * Initialize push notifications for a user
 * @param {string} userId
 * @param {string} vapidPublicKey - VAPID public key from Supabase
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function initializePushNotifications(userId, vapidPublicKey) {
  if (!isNotificationSupported()) {
    console.warn('Push notifications are not supported in this browser');
    throw new Error('Push notifications are not supported in this browser');
  }

  try {
    // Request permission
    const permission = await requestNotificationPermission();
    if (permission !== 'granted') {
      console.log('Notification permission denied');
      throw new Error('Notification permission was denied. Please enable notifications in your browser settings.');
    }

    // Register service worker
    const registration = await registerServiceWorker();
    console.log('Service Worker registered:', registration);

    // Subscribe to push
    const subscription = await subscribeToPush(registration, vapidPublicKey);
    console.log('Push subscription created:', subscription);

    // Save subscription to database
    await savePushSubscription(userId, subscription);
    console.log('Push subscription saved to database');

    return true;
  } catch (error) {
    console.error('Failed to initialize push notifications:', error);
    throw error;
  }
}

/**
 * Convert VAPID public key from base64 URL to Uint8Array
 * @param {string} base64String
 * @returns {Uint8Array}
 */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Get VAPID public key from Supabase Edge Function
 * This will be stored as an environment variable or fetched from a config endpoint
 * For now, we'll need to get it from Supabase secrets or a config endpoint
 * @returns {Promise<string>}
 */
export async function getVapidPublicKey() {
  // TODO: Fetch from Supabase Edge Function or environment variable
  // For now, this should be set as an environment variable in the app
  // The VAPID public key should be exposed via a public endpoint or env variable
  const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  
  if (!vapidPublicKey) {
    throw new Error('VAPID_PUBLIC_KEY not found. Please set VITE_VAPID_PUBLIC_KEY in environment variables.');
  }
  
  return vapidPublicKey;
}

