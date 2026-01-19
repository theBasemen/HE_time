// Supabase Edge Function: Send Daily Reminders
// Native Web Push implementation - FIXED for Apple aes128gcm
// Sends push notifications at 17:00 to users who haven't registered at least 6 hours

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ============================================
// WEB PUSH UTILITIES (Native Implementation)
// ============================================

function base64UrlToUint8Array(base64Url: string): Uint8Array {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function uint8ArrayToBase64Url(uint8Array: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < uint8Array.length; i++) {
    binary += String.fromCharCode(uint8Array[i]);
  }
  const base64 = btoa(binary);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// Concatenate multiple Uint8Arrays
function concatUint8Arrays(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

async function createVapidJwt(
  audience: string,
  subject: string,
  publicKey: string,
  privateKey: string
): Promise<{ token: string; publicKey: string }> {
  const header = { alg: 'ES256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);

  const payload = {
    aud: audience,
    exp: now + 12 * 60 * 60,
    sub: subject,
  };

  const headerB64 = uint8ArrayToBase64Url(new TextEncoder().encode(JSON.stringify(header)));
  const payloadB64 = uint8ArrayToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const unsignedToken = `${headerB64}.${payloadB64}`;

  const privateKeyBytes = base64UrlToUint8Array(privateKey);
  const publicKeyBytes = base64UrlToUint8Array(publicKey);
  const x = publicKeyBytes.slice(1, 33);
  const y = publicKeyBytes.slice(33, 65);

  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    x: uint8ArrayToBase64Url(x),
    y: uint8ArrayToBase64Url(y),
    d: uint8ArrayToBase64Url(privateKeyBytes),
  };

  const cryptoKey = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );

  const signatureBuffer = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    cryptoKey,
    new TextEncoder().encode(unsignedToken)
  );

  const signature = new Uint8Array(signatureBuffer);
  const signatureB64 = uint8ArrayToBase64Url(signature);

  return {
    token: `${unsignedToken}.${signatureB64}`,
    publicKey: publicKey,
  };
}

// HKDF implementation
async function hkdfSha256(
  ikm: Uint8Array,
  salt: Uint8Array,
  info: Uint8Array,
  length: number
): Promise<Uint8Array> {
  // If salt is empty, use zeros
  if (salt.length === 0) {
    salt = new Uint8Array(32);
  }

  // Extract
  const prkKey = await crypto.subtle.importKey(
    'raw',
    salt,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const prk = new Uint8Array(await crypto.subtle.sign('HMAC', prkKey, ikm));

  // Expand
  const infoBuffer = new Uint8Array(info.length + 1);
  infoBuffer.set(info);
  infoBuffer[info.length] = 1;

  const expandKey = await crypto.subtle.importKey(
    'raw',
    prk,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const okm = new Uint8Array(await crypto.subtle.sign('HMAC', expandKey, infoBuffer));

  return okm.slice(0, length);
}

// Encrypt payload using RFC 8291 (aes128gcm for Web Push)
async function encryptPayload(
  payload: string,
  subscriptionPublicKey: string,
  authSecret: string
): Promise<Uint8Array> {
  // Decode subscription keys
  const clientPublicKeyBytes = base64UrlToUint8Array(subscriptionPublicKey);
  const authSecretBytes = base64UrlToUint8Array(authSecret);

  // Generate ephemeral server key pair
  const serverKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  );

  // Export server public key
  const serverPublicKeyBuffer = await crypto.subtle.exportKey('raw', serverKeyPair.publicKey);
  const serverPublicKey = new Uint8Array(serverPublicKeyBuffer);

  // Import client public key
  const clientPublicKey = await crypto.subtle.importKey(
    'raw',
    clientPublicKeyBytes,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );

  // ECDH shared secret
  const sharedSecretBuffer = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: clientPublicKey },
    serverKeyPair.privateKey,
    256
  );
  const sharedSecret = new Uint8Array(sharedSecretBuffer);

  // Generate random salt
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // RFC 8291: IKM = HKDF-SHA-256(auth_secret, ecdh_secret, "WebPush: info" || 0x00 || client_public || server_public, 32)
  const webPushInfo = concatUint8Arrays(
    new TextEncoder().encode('WebPush: info\0'),
    clientPublicKeyBytes,
    serverPublicKey
  );

  const ikm = await hkdfSha256(sharedSecret, authSecretBytes, webPushInfo, 32);

  // Derive CEK: HKDF-SHA-256(salt, ikm, "Content-Encoding: aes128gcm" || 0x00, 16)
  const cekInfo = new TextEncoder().encode('Content-Encoding: aes128gcm\0');
  const cek = await hkdfSha256(ikm, salt, cekInfo, 16);

  // Derive nonce: HKDF-SHA-256(salt, ikm, "Content-Encoding: nonce" || 0x00, 12)
  const nonceInfo = new TextEncoder().encode('Content-Encoding: nonce\0');
  const nonce = await hkdfSha256(ikm, salt, nonceInfo, 12);

  // Import CEK for AES-GCM
  const aesKey = await crypto.subtle.importKey(
    'raw',
    cek,
    'AES-GCM',
    false,
    ['encrypt']
  );

  // Pad payload: payload || 0x02 (delimiter for final record)
  const payloadBytes = new TextEncoder().encode(payload);
  const paddedPayload = new Uint8Array(payloadBytes.length + 1);
  paddedPayload.set(payloadBytes);
  paddedPayload[payloadBytes.length] = 2; // Record padding delimiter

  // Encrypt
  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    aesKey,
    paddedPayload
  );
  const ciphertext = new Uint8Array(ciphertextBuffer);

  // Build aes128gcm body:
  // salt (16 bytes) || rs (4 bytes, big-endian) || idlen (1 byte) || keyid (server public key) || ciphertext
  const rs = 4096; // Record size
  const header = new Uint8Array(16 + 4 + 1 + serverPublicKey.length);
  header.set(salt, 0);
  header[16] = (rs >> 24) & 0xff;
  header[17] = (rs >> 16) & 0xff;
  header[18] = (rs >> 8) & 0xff;
  header[19] = rs & 0xff;
  header[20] = serverPublicKey.length;
  header.set(serverPublicKey, 21);

  // Combine header and ciphertext
  return concatUint8Arrays(header, ciphertext);
}

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

async function sendPushNotification(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: { title: string; body: string },
  vapidPublicKey: string,
  vapidPrivateKey: string,
  vapidSubject: string
): Promise<{ success: boolean; status?: number; message?: string }> {
  try {
    const endpointUrl = new URL(subscription.endpoint);
    const audience = `${endpointUrl.protocol}//${endpointUrl.host}`;

    const vapid = await createVapidJwt(audience, vapidSubject, vapidPublicKey, vapidPrivateKey);

    const payloadString = JSON.stringify(payload);

    const encryptedBody = await encryptPayload(
      payloadString,
      subscription.keys.p256dh,
      subscription.keys.auth
    );

    const response = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Encoding': 'aes128gcm',
        'Authorization': `vapid t=${vapid.token}, k=${vapid.publicKey}`,
        'TTL': '86400',
        'Urgency': 'normal',
      },
      body: encryptedBody,
    });

    if (response.status === 201 || response.status === 200) {
      return { success: true, status: response.status };
    }

    const responseText = await response.text();

    return {
      success: false,
      status: response.status,
      message: responseText || `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      success: false,
      message: error.message || 'Unknown error',
    };
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
          const notificationPayload = {
            title: 'Husk at registrere timer',
            body: `Du har kun registreret ${hoursDisplay} timer i dag. Husk at få det hele med i runde tal. Firmarelevante møder og telefonsamtaler registreres som Administration`,
          };
          
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
              if (!subscriptionObj?.endpoint || !subscriptionObj?.keys?.p256dh || !subscriptionObj?.keys?.auth) {
                errors.push(`Invalid subscription structure for user ${user.id}`);
                debugInfo[debugInfo.length - 1].subscriptionInvalid = 'missing endpoint or keys';
                notificationsFailed++;
                continue;
              }
              
              debugInfo[debugInfo.length - 1].subscriptionEndpoint = subscriptionObj.endpoint.substring(0, 50) + '...';
              
              const result = await sendPushNotification(
                {
                  endpoint: subscriptionObj.endpoint,
                  keys: {
                    p256dh: subscriptionObj.keys.p256dh,
                    auth: subscriptionObj.keys.auth,
                  },
                },
                notificationPayload,
                vapidPublicKey,
                vapidPrivateKey,
                vapidSubject
              );
              
              if (result.success) {
                notificationsSent++;
                debugInfo[debugInfo.length - 1].notificationSent = true;
              } else {
                notificationsFailed++;
                errors.push(`Push error for user ${user.id}: ${result.message || `HTTP ${result.status}`}`);
                debugInfo[debugInfo.length - 1].pushError = result.message || `HTTP ${result.status}`;
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

