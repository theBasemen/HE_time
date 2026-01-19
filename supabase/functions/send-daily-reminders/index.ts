// Supabase Edge Function: Send Daily Reminders
// Sends push notifications at 17:00 to users who haven't registered at least 6 hours

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import * as webpush from 'jsr:@negrel/webpush@0.5.0';

// Danish holidays (fixed dates)
const DANISH_HOLIDAYS: Array<{ month: number; day: number; name: string }> = [
  { month: 0, day: 1, name: 'Nytårsdag' },
  { month: 4, day: 1, name: 'Store Bededag' },
  { month: 5, day: 5, name: 'Grundlovsdag' },
  { month: 11, day: 24, name: 'Juleaften' },
  { month: 11, day: 25, name: 'Juledag' },
  { month: 11, day: 26, name: '2. Juledag' },
];

// Calculate Easter Sunday (using algorithm)
function getEasterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month, day);
}

// Get all Danish holidays for a given year (including Easter-based holidays)
function getDanishHolidays(year: number): Date[] {
  const holidays: Date[] = [];
  
  // Fixed holidays
  DANISH_HOLIDAYS.forEach(({ month, day, name }) => {
    holidays.push(new Date(year, month, day));
  });
  
  // Easter-based holidays
  const easter = getEasterSunday(year);
  holidays.push(new Date(easter.getTime() - 3 * 24 * 60 * 60 * 1000)); // Maundy Thursday
  holidays.push(new Date(easter.getTime() - 2 * 24 * 60 * 60 * 1000)); // Good Friday
  holidays.push(new Date(easter.getTime() + 1 * 24 * 60 * 60 * 1000)); // Easter Monday
  holidays.push(new Date(easter.getTime() + 39 * 24 * 60 * 60 * 1000)); // Ascension Day
  holidays.push(new Date(easter.getTime() + 49 * 24 * 60 * 60 * 1000)); // Whit Monday
  
  return holidays;
}

// Check if a date is a weekday (Monday-Friday) and not a Danish holiday
function isWorkday(date: Date): boolean {
  const dayOfWeek = date.getDay();
  
  // Check if weekend (Saturday = 6, Sunday = 0)
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return false;
  }
  
  // Check if Danish holiday
  const year = date.getFullYear();
  const holidays = getDanishHolidays(year);
  
  const isHoliday = holidays.some(holiday => {
    return (
      holiday.getFullYear() === date.getFullYear() &&
      holiday.getMonth() === date.getMonth() &&
      holiday.getDate() === date.getDate()
    );
  });
  
  return !isHoliday;
}

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
    
    // Try to import VAPID keys - handle both sync and async cases
    let vapidKeys;
    try {
      // Try importVapidKeys if it exists (may be sync or async)
      if (typeof webpush.importVapidKeys === 'function') {
        vapidKeys = await Promise.resolve(webpush.importVapidKeys({
          publicKey: vapidPublicKey,
          privateKey: vapidPrivateKey,
        }));
      } else {
        // If importVapidKeys doesn't exist, try passing keys directly
        // The library might handle conversion internally
        vapidKeys = {
          publicKey: vapidPublicKey,
          privateKey: vapidPrivateKey,
        };
      }
    } catch (importError) {
      console.error('Error importing VAPID keys:', importError);
      // Fallback: pass keys directly - library might handle conversion
      vapidKeys = {
        publicKey: vapidPublicKey,
        privateKey: vapidPrivateKey,
      };
    }
    
    // Create ApplicationServer instance with VAPID keys
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
      subscription: subscription ? { 
        endpoint: subscription.endpoint,
        hasKeys: !!subscription.keys,
        keysType: typeof subscription.keys,
      } : 'null',
    });
    
    // Re-throw error with more details for better debugging
    const errorMessage = error.message || error.name || 'Unknown error';
    throw new Error(`Push notification failed: ${errorMessage}`);
  }
}

serve(async (req) => {
  try {
    // Get environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY') || '';
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY') || '';
    const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@himmelstrup.dk';
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase environment variables');
    }
    
    if (!vapidPublicKey || !vapidPrivateKey) {
      throw new Error('Missing VAPID keys');
    }
    
    // Create Supabase client with service role key
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Check if today is a workday
    const today = new Date();
    const todayUTC = new Date(Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth(),
      today.getUTCDate()
    ));
    
    if (!isWorkday(todayUTC)) {
      return new Response(
        JSON.stringify({ 
          message: 'Today is not a workday, skipping notifications',
          date: todayUTC.toISOString(),
        }),
        { 
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
    
    // Get start and end of today in UTC
    const startOfDay = new Date(Date.UTC(
      todayUTC.getUTCFullYear(),
      todayUTC.getUTCMonth(),
      todayUTC.getUTCDate(),
      0, 0, 0, 0
    ));
    const endOfDay = new Date(Date.UTC(
      todayUTC.getUTCFullYear(),
      todayUTC.getUTCMonth(),
      todayUTC.getUTCDate(),
      23, 59, 59, 999
    ));
    
    // Get all active users
    const { data: users, error: usersError } = await supabase
      .from('he_time_users')
      .select('id, name')
      .eq('is_active', true);
    
    if (usersError) {
      throw new Error(`Error fetching users: ${usersError.message}`);
    }
    
    if (!users || users.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No active users found' }),
        { 
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
    
    let notificationsSent = 0;
    let notificationsFailed = 0;
    const errors: string[] = [];
    const debugInfo: any[] = [];
    
    // Process each user
    for (const user of users) {
      try {
        // Get user's time logs for today
        const { data: logs, error: logsError } = await supabase
          .from('he_time_logs')
          .select('hours')
          .eq('user_id', user.id)
          .gte('timestamp', startOfDay.toISOString())
          .lte('timestamp', endOfDay.toISOString());
        
        if (logsError) {
          errors.push(`Error fetching logs for user ${user.id}: ${logsError.message}`);
          debugInfo.push({ userId: user.id, userName: user.name, error: logsError.message });
          continue;
        }
        
        // Calculate total hours registered today
        const totalHours = logs?.reduce((sum, log) => sum + (log.hours || 0), 0) || 0;
        
        debugInfo.push({
          userId: user.id,
          userName: user.name,
          totalHours,
          needsReminder: totalHours < 6,
          logsCount: logs?.length || 0,
        });
        
        // Only send notification if user has registered less than 6 hours
        if (totalHours < 6) {
          // Get user's push subscriptions
          const { data: subscriptions, error: subsError } = await supabase
            .from('he_push_subscriptions')
            .select('subscription')
            .eq('user_id', user.id);
          
          if (subsError) {
            errors.push(`Error fetching subscriptions for user ${user.id}: ${subsError.message}`);
            debugInfo[debugInfo.length - 1].subscriptionError = subsError.message;
            continue;
          }
          
          debugInfo[debugInfo.length - 1].subscriptionsCount = subscriptions?.length || 0;
          
          if (!subscriptions || subscriptions.length === 0) {
            // User has no push subscriptions, skip
            debugInfo[debugInfo.length - 1].skipped = 'No push subscriptions';
            continue;
          }
          
          // Format hours for display
          const hoursDisplay = totalHours.toFixed(1).replace('.', ',');
          
          // Send notification to all user's devices
          const title = 'Husk at registrere timer';
          const body = `Du har kun registreret ${hoursDisplay} timer i dag. Husk at få det hele med i runde tal. Firmarelevante møder og telefonsamtaler registreres som Administration`;
          
          for (const sub of subscriptions) {
            try {
              // Ensure subscription is a proper object (not JSONB string)
              let subscriptionObj = sub.subscription;
              if (typeof subscriptionObj === 'string') {
                try {
                  subscriptionObj = JSON.parse(subscriptionObj);
                } catch (e) {
                  errors.push(`Invalid subscription JSON for user ${user.id}: ${e.message}`);
                  debugInfo[debugInfo.length - 1].subscriptionParseError = e.message;
                  notificationsFailed++;
                  continue;
                }
              }
              
              // Validate subscription structure
              if (!subscriptionObj || !subscriptionObj.endpoint) {
                errors.push(`Invalid subscription structure for user ${user.id}: missing endpoint`);
                debugInfo[debugInfo.length - 1].subscriptionInvalid = 'missing endpoint';
                notificationsFailed++;
                continue;
              }
              
              if (!subscriptionObj.keys || !subscriptionObj.keys.p256dh || !subscriptionObj.keys.auth) {
                errors.push(`Invalid subscription structure for user ${user.id}: missing keys`);
                debugInfo[debugInfo.length - 1].subscriptionInvalid = 'missing keys';
                notificationsFailed++;
                continue;
              }
              
              debugInfo[debugInfo.length - 1].subscriptionEndpoint = subscriptionObj.endpoint.substring(0, 50) + '...';
              debugInfo[debugInfo.length - 1].subscriptionKeys = {
                hasP256dh: !!subscriptionObj.keys?.p256dh,
                hasAuth: !!subscriptionObj.keys?.auth,
                p256dhLength: subscriptionObj.keys?.p256dh?.length || 0,
                authLength: subscriptionObj.keys?.auth?.length || 0,
              };
              
              // Create a clean subscription object to avoid prototype issues
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
                debugInfo[debugInfo.length - 1].notificationSent = true;
              } else {
                notificationsFailed++;
                errors.push(`Failed to send notification to user ${user.id} - sendNotification returned false`);
                debugInfo[debugInfo.length - 1].notificationFailed = true;
              }
            } catch (pushError) {
              notificationsFailed++;
              const errorMessage = pushError.message || pushError.toString() || 'Unknown error';
              errors.push(`Push error for user ${user.id}: ${errorMessage}`);
              debugInfo[debugInfo.length - 1].pushError = errorMessage;
              if (pushError.stack) {
                debugInfo[debugInfo.length - 1].pushErrorStack = pushError.stack.substring(0, 300);
              }
            }
          }
        }
      } catch (error) {
        errors.push(`Error processing user ${user.id}: ${error.message}`);
        notificationsFailed++;
        debugInfo.push({ userId: user.id, error: error.message });
      }
    }
    
    return new Response(
      JSON.stringify({
        message: 'Daily reminders processed',
        date: todayUTC.toISOString(),
        isWorkday: true,
        usersProcessed: users.length,
        notificationsSent,
        notificationsFailed,
        errors: errors.length > 0 ? errors : undefined,
        debug: debugInfo,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in send-daily-reminders function:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        stack: error.stack,
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
});

