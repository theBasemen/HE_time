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
  // Check for basic notification support
  const hasNotification = 'Notification' in window;
  const hasServiceWorker = 'serviceWorker' in navigator;
  const hasPushManager = 'PushManager' in window;
  
  // Log for debugging
  console.log('Notification support check:', {
    hasNotification,
    hasServiceWorker,
    hasPushManager,
    userAgent: navigator.userAgent,
    isStandalone: window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true,
  });
  
  // On iOS, PushManager might not be available until app is installed as PWA
  // But we should still show the button if basic notification support exists
  return hasNotification && hasServiceWorker;
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
  console.log('Saving push subscription for user:', userId);
  
  // Convert subscription to JSON format
  const subscriptionJson = subscription.toJSON();
  console.log('Subscription JSON:', {
    endpoint: subscriptionJson.endpoint?.substring(0, 50) + '...',
    hasKeys: !!subscriptionJson.keys,
    hasP256dh: !!subscriptionJson.keys?.p256dh,
    hasAuth: !!subscriptionJson.keys?.auth,
  });

  const subscriptionData = {
    user_id: userId,
    subscription: subscriptionJson,
  };

  // Check if subscription already exists for this user
  // Use maybeSingle() instead of single() to avoid errors when no subscription exists
  const { data: existing, error: checkError } = await supabase
    .from('he_push_subscriptions')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();

  if (checkError && checkError.code !== 'PGRST116') { // PGRST116 = no rows returned
    console.error('Error checking for existing subscription:', checkError);
    throw checkError;
  }

  if (existing) {
    console.log('Updating existing subscription:', existing.id);
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
    console.log('Subscription updated successfully');
  } else {
    console.log('Inserting new subscription');
    // Insert new subscription
    const { error, data } = await supabase
      .from('he_push_subscriptions')
      .insert([subscriptionData])
      .select();

    if (error) {
      console.error('Error saving push subscription:', error);
      console.error('Error details:', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      throw error;
    }
    console.log('Subscription saved successfully:', data);
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
  console.log('Initializing push notifications for user:', userId);
  
  if (!isNotificationSupported()) {
    console.warn('Push notifications are not supported in this browser');
    throw new Error('Push notifications are not supported in this browser');
  }

  try {
    // Request permission
    console.log('Requesting notification permission...');
    const permission = await requestNotificationPermission();
    console.log('Permission result:', permission);
    
    if (permission !== 'granted') {
      console.log('Notification permission denied');
      throw new Error('Notification permission was denied. Please enable notifications in your browser settings.');
    }

    // Register service worker
    console.log('Registering service worker...');
    const registration = await registerServiceWorker();
    console.log('Service Worker registered:', registration);

    // Subscribe to push
    console.log('Subscribing to push notifications...');
    const subscription = await subscribeToPush(registration, vapidPublicKey);
    console.log('Push subscription created:', {
      endpoint: subscription.endpoint?.substring(0, 50) + '...',
      expirationTime: subscription.expirationTime,
    });

    // Save subscription to database
    console.log('Saving subscription to database...');
    await savePushSubscription(userId, subscription);
    console.log('Push subscription saved to database successfully');

    return true;
  } catch (error) {
    console.error('Failed to initialize push notifications:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
    });
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
 * Reset push notification subscription for a user
 * This will unsubscribe and delete the subscription from the database
 * @param {string} userId
 * @returns {Promise<void>}
 */
export async function resetPushSubscription(userId) {
  console.log('Resetting push subscription for user:', userId);
  
  try {
    // Get current subscription from database
    const { data: existing, error: fetchError } = await supabase
      .from('he_push_subscriptions')
      .select('subscription')
      .eq('user_id', userId)
      .maybeSingle();

    if (fetchError && fetchError.code !== 'PGRST116') {
      console.error('Error fetching subscription:', fetchError);
      throw fetchError;
    }

    // If subscription exists, try to unsubscribe
    if (existing && existing.subscription) {
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        
        if (subscription) {
          const success = await subscription.unsubscribe();
          console.log('Unsubscribed from push:', success);
        }
      } catch (unsubError) {
        console.warn('Could not unsubscribe (may already be unsubscribed):', unsubError);
      }
    }

    // Delete subscription from database
    const { error: deleteError } = await supabase
      .from('he_push_subscriptions')
      .delete()
      .eq('user_id', userId);

    if (deleteError) {
      console.error('Error deleting subscription:', deleteError);
      throw deleteError;
    }

    console.log('Subscription reset successfully');
    
    // Clear localStorage flag
    localStorage.removeItem('he_notification_permission_asked');
  } catch (error) {
    console.error('Failed to reset push subscription:', error);
    throw error;
  }
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

