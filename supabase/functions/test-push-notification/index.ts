// Supabase Edge Function: Test Push Notification
// Native Web Push implementation - FIXED for Apple aes128gcm

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

async function sendPushNotification(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: { title: string; body: string },
  vapidPublicKey: string,
  vapidPrivateKey: string,
  vapidSubject: string
): Promise<{ success: boolean; status?: number; message?: string }> {
  try {
    console.log('Starting push notification...');
    console.log('Endpoint:', subscription.endpoint.substring(0, 60) + '...');

    const endpointUrl = new URL(subscription.endpoint);
    const audience = `${endpointUrl.protocol}//${endpointUrl.host}`;

    console.log('Creating VAPID JWT for audience:', audience);
    const vapid = await createVapidJwt(audience, vapidSubject, vapidPublicKey, vapidPrivateKey);
    console.log('VAPID JWT created');

    const payloadString = JSON.stringify(payload);
    console.log('Encrypting payload:', payloadString);

    const encryptedBody = await encryptPayload(
      payloadString,
      subscription.keys.p256dh,
      subscription.keys.auth
    );
    console.log('Encrypted body size:', encryptedBody.length, 'bytes');

    console.log('Sending to push service...');
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

    console.log('Response status:', response.status);

    if (response.status === 201 || response.status === 200) {
      return { success: true, status: response.status };
    }

    const responseText = await response.text();
    console.error('Push service error:', responseText);

    return {
      success: false,
      status: response.status,
      message: responseText || `HTTP ${response.status}`,
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      success: false,
      message: error.message || 'Unknown error',
    };
  }
}

// ============================================
// MAIN HANDLER
// ============================================

serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Credentials': 'true',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing Authorization header' }),
        { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY') || '';
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY') || '';
    const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@himmelstrup.dk';

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: 'Missing Supabase environment variables' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    if (!vapidPublicKey || !vapidPrivateKey) {
      return new Response(
        JSON.stringify({ error: 'Missing VAPID keys' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const requestBody = await req.json().catch(() => ({}));
    const userId = requestBody.userId || '5d634c2c-e98d-4e39-966e-b1e5fe6a2c16';

    const { data: user, error: userError } = await supabase
      .from('he_time_users')
      .select('id, name')
      .eq('id', userId)
      .eq('is_active', true)
      .single();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: `User not found: ${userError?.message || 'Unknown error'}`, userId }),
        { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    const { data: subscriptions, error: subsError } = await supabase
      .from('he_push_subscriptions')
      .select('subscription')
      .eq('user_id', userId);

    if (subsError) {
      return new Response(
        JSON.stringify({ error: `Error fetching subscriptions: ${subsError.message}` }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No push subscriptions found', userId, userName: user.name }),
        { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    const notificationPayload = {
      title: 'Test',
      body: `Hej ${user.name}!`,
    };

    let notificationsSent = 0;
    let notificationsFailed = 0;
    const errors: string[] = [];
    const results: any[] = [];

    for (const sub of subscriptions) {
      try {
        let subscriptionObj = sub.subscription;
        if (typeof subscriptionObj === 'string') {
          subscriptionObj = JSON.parse(subscriptionObj);
        }

        if (!subscriptionObj?.endpoint || !subscriptionObj?.keys?.p256dh || !subscriptionObj?.keys?.auth) {
          errors.push('Invalid subscription format');
          notificationsFailed++;
          continue;
        }

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

        results.push(result);

        if (result.success) {
          notificationsSent++;
        } else {
          notificationsFailed++;
          errors.push(result.message || `HTTP ${result.status}`);
        }
      } catch (pushError) {
        notificationsFailed++;
        errors.push(`Exception: ${pushError.message}`);
        results.push({ success: false, message: pushError.message });
      }
    }

    return new Response(
      JSON.stringify({
        message: 'Test notification process completed',
        userId,
        userName: user.name,
        subscriptionsFound: subscriptions.length,
        notificationsSent,
        notificationsFailed,
        errors: errors.length > 0 ? errors : undefined,
        results,
        payloadSent: notificationPayload,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  } catch (error) {
    console.error('Unhandled error:', error);
    return new Response(
      JSON.stringify({ error: error.message, stack: error.stack }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }
});