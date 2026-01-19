// Supabase Edge Function: Test Push Notification
// Sends a test push notification to a specific user (Mads)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Helper function to convert base64 URL to Uint8Array
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Send push notification using Deno-compatible webpush library
async function sendPushNotification(
  subscription: any,
  title: string,
  body: string,
  vapidPublicKey: string,
  vapidPrivateKey: string,
  vapidSubject: string
): Promise<boolean> {
  try {
    // Validate subscription object
    if (!subscription || !subscription.endpoint) {
      console.error('Invalid subscription object:', subscription);
      return false;
    }
    
    if (!subscription.keys || !subscription.keys.p256dh || !subscription.keys.auth) {
      console.error('Missing subscription keys');
      return false;
    }
    
    // Use negrel/webpush - Deno-compatible web push library
    // This library uses Web Crypto API instead of Node's crypto.ECDH
    const { WebPush } = await import('https://deno.land/x/webpush@1.0.0/mod.ts');
    
    // Create subscription object
    const subscriptionObj = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
    };
    
    const payload = JSON.stringify({
      title,
      body,
      icon: '/he_logo.png',
      badge: '/he_logo.png',
      tag: 'test-notification',
    });
    
    console.log('Sending notification with subscription:', {
      endpoint: subscriptionObj.endpoint.substring(0, 50) + '...',
      hasP256dh: !!subscriptionObj.keys.p256dh,
      hasAuth: !!subscriptionObj.keys.auth,
    });
    
    // Create WebPush instance with VAPID keys
    const webpush = new WebPush({
      vapid: {
        subject: vapidSubject,
        publicKey: vapidPublicKey,
        privateKey: vapidPrivateKey,
      },
    });
    
    // Send notification
    await webpush.send(subscriptionObj, payload);
    
    return true;
  } catch (error) {
    console.error('Error sending push notification:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      subscriptionType: typeof subscription,
      subscriptionKeys: subscription ? Object.keys(subscription) : 'null',
    });
    throw error;
  }
}

serve(async (req) => {
  // Get origin from request for CORS
  const origin = req.headers.get('origin') || req.headers.get('Origin') || '*';
  
  // CORS headers to use in all responses
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Credentials': 'true',
  };

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  try {
    // Get authorization header to verify request
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing Authorization header' }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
          },
        }
      );
    }

    // Get environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY') || '';
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY') || '';
    const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@himmelstrup.dk';
    
    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: 'Missing Supabase environment variables' }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
          },
        }
      );
    }
    
    if (!vapidPublicKey || !vapidPrivateKey) {
      return new Response(
        JSON.stringify({ error: 'Missing VAPID keys' }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
          },
        }
      );
    }
    
    // Create Supabase client with service role key
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Get user ID from request body or use Mads' ID as default
    const requestBody = await req.json().catch(() => ({}));
    const userId = requestBody.userId || '5d634c2c-e98d-4e39-966e-b1e5fe6a2c16'; // Mads' user ID
    
    // Get user info
    const { data: user, error: userError } = await supabase
      .from('he_time_users')
      .select('id, name')
      .eq('id', userId)
      .eq('is_active', true)
      .single();
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ 
          error: `User not found: ${userError?.message || 'Unknown error'}`,
          userId,
        }),
        {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
          },
        }
      );
    }
    
    // Get user's push subscriptions
    const { data: subscriptions, error: subsError } = await supabase
      .from('he_push_subscriptions')
      .select('subscription')
      .eq('user_id', userId);
    
    if (subsError) {
      return new Response(
        JSON.stringify({ 
          error: `Error fetching subscriptions: ${subsError.message}`,
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
          },
        }
      );
    }
    
    if (!subscriptions || subscriptions.length === 0) {
      return new Response(
        JSON.stringify({ 
          error: 'No push subscriptions found for user',
          userId,
          userName: user.name,
        }),
        {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
          },
        }
      );
    }
    
    // Send test notification to all user's devices
    const title = 'Test Notifikation';
    const body = `Hej ${user.name}! Dette er en test-notifikation fra Himmelstrup Time Tracker.`;
    
    let notificationsSent = 0;
    let notificationsFailed = 0;
    const errors: string[] = [];
    
    for (const sub of subscriptions) {
      try {
        // Ensure subscription is a proper object (not JSONB string)
        let subscriptionObj = sub.subscription;
        if (typeof subscriptionObj === 'string') {
          subscriptionObj = JSON.parse(subscriptionObj);
        }
        
        // Validate subscription structure
        if (!subscriptionObj || !subscriptionObj.endpoint) {
          errors.push('Invalid subscription: missing endpoint');
          notificationsFailed++;
          continue;
        }
        
        if (!subscriptionObj.keys || !subscriptionObj.keys.p256dh || !subscriptionObj.keys.auth) {
          errors.push('Invalid subscription: missing keys');
          notificationsFailed++;
          continue;
        }
        
        // Create clean subscription object
        const cleanSubscription = {
          endpoint: subscriptionObj.endpoint,
          keys: {
            p256dh: subscriptionObj.keys.p256dh,
            auth: subscriptionObj.keys.auth,
          },
        };
        
        const success = await sendPushNotification(
          cleanSubscription,
          title,
          body,
          vapidPublicKey,
          vapidPrivateKey,
          vapidSubject
        );
        
        if (success) {
          notificationsSent++;
        } else {
          notificationsFailed++;
          errors.push('sendNotification returned false');
        }
      } catch (pushError) {
        notificationsFailed++;
        const errorMessage = pushError.message || pushError.toString() || 'Unknown error';
        errors.push(`Push error: ${errorMessage}`);
        console.error('Push error details:', pushError);
      }
    }
    
    return new Response(
      JSON.stringify({
        message: 'Test notification sent',
        userId,
        userName: user.name,
        subscriptionsFound: subscriptions.length,
        notificationsSent,
        notificationsFailed,
        errors: errors.length > 0 ? errors : undefined,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      }
    );
  } catch (error) {
    console.error('Error in test-push-notification function:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        stack: error.stack,
      }),
      {
        status: 500,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
          },
      }
    );
  }
});

