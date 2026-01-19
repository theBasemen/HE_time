// Supabase Edge Function: Test Push Notification
// Sends a test push notification to a specific user (Mads)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import * as webpush from 'jsr:@negrel/webpush@0.5.0';

// Send push notification using @negrel/webpush (Deno-compatible)
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
    
    // Use subscription object directly - library should handle format conversion
    // Ensure it's a plain object (not a class instance)
    const subscriptionObj = subscription;
    
    // Validate subscription structure
    if (!subscriptionObj.endpoint || !subscriptionObj.keys) {
      throw new Error('Invalid subscription structure');
    }
    
    console.log('Sending notification with subscription:', {
      endpoint: subscriptionObj.endpoint.substring(0, 50) + '...',
      hasP256dh: !!subscriptionObj.keys.p256dh,
      hasAuth: !!subscriptionObj.keys.auth,
      p256dhType: typeof subscriptionObj.keys.p256dh,
      authType: typeof subscriptionObj.keys.auth,
    });
    
    // Import VAPID keys first - this converts them to CryptoKey objects
    const vapidKeys = webpush.importVapidKeys({
      publicKey: vapidPublicKey,
      privateKey: vapidPrivateKey,
    });
    
    // Create ApplicationServer instance with imported VAPID keys
    const appServer = await webpush.ApplicationServer.new({
      vapidKeys: vapidKeys,
      contactInformation: vapidSubject,
    });
    
    // Subscribe to get PushSubscriber - pass subscription directly
    const subscriber = appServer.subscribe(subscriptionObj);
    
    // Use pushTextMessage with just the body text (simplest approach)
    // This avoids complex JSON payload that might cause offset errors
    await subscriber.pushTextMessage(body, {
      ttl: 86400, // 24 hours
    });
    
    return true;
  } catch (error) {
    console.error('Error sending push notification:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
    });
    throw error;
  }
}

serve(async (req) => {
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
    const notificationBody = `Hej ${user.name}! Dette er en test-notifikation fra Himmelstrup Time Tracker.`;
    
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
          notificationBody,
          vapidPublicKey,
          vapidPrivateKey,
          vapidSubject
        );
        
        if (success) {
          notificationsSent++;
        } else {
          notificationsFailed++;
          errors.push('sendPushNotification returned false');
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
