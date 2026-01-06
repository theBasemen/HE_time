# Supabase Setup for Push Notifications

## 1. Database Schema

Run the migration file to create the `he_push_subscriptions` table:

```sql
-- Run this in Supabase SQL Editor
\i supabase/migrations/001_create_push_subscriptions_table.sql
```

Or copy and paste the contents of `supabase/migrations/001_create_push_subscriptions_table.sql` into the Supabase SQL Editor.

## 2. Generate VAPID Keys

VAPID keys are required for Web Push notifications. Generate them using one of these methods:

### Option A: Using Node.js (web-push package)

```bash
npm install -g web-push
web-push generate-vapid-keys
```

This will output:
- Public Key (VAPID_PUBLIC_KEY)
- Private Key (VAPID_PRIVATE_KEY)

### Option B: Using online tool

Visit: https://web-push-codelab.glitch.me/

### Option C: Using Deno (if you have Deno installed)

```bash
deno run --allow-net https://deno.land/x/webpush@1.0.0/src/cli.ts generate-vapid-keys
```

## 3. Set VAPID Keys as Supabase Secrets

In Supabase Dashboard:

1. Go to **Project Settings** → **Edge Functions** → **Secrets**
2. Add the following secrets:
   - `VAPID_PUBLIC_KEY` - Your VAPID public key
   - `VAPID_PRIVATE_KEY` - Your VAPID private key
   - `VAPID_SUBJECT` - Your email or URL (e.g., `mailto:admin@himmelstrup.dk`)

## 4. Set VAPID Public Key as Environment Variable

The frontend needs access to the VAPID public key. Add it to your environment variables:

### For Netlify:
1. Go to **Site settings** → **Environment variables**
2. Add: `VITE_VAPID_PUBLIC_KEY` = (your VAPID public key)

### For Local Development:
Create a `.env` file in the project root:
```env
VITE_VAPID_PUBLIC_KEY=your_vapid_public_key_here
```

## 5. Deploy Edge Function

Deploy the Edge Function to Supabase:

```bash
# Install Supabase CLI if not already installed
npm install -g supabase

# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref your-project-ref

# Deploy the function
supabase functions deploy send-daily-reminders
```

Or use the Supabase Dashboard:
1. Go to **Edge Functions**
2. Click **New Function**
3. Name it `send-daily-reminders`
4. Copy the contents of `supabase/functions/send-daily-reminders/index.ts`
5. Click **Deploy**

## 6. Set Up Cron Job

Set up a cron job to run the Edge Function daily at 17:00 (CET/CEST):

### Option A: Using Supabase Cron (pg_cron extension)

Run this SQL in Supabase SQL Editor:

```sql
-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule the Edge Function to run daily at 17:00 CET (16:00 UTC in winter, 15:00 UTC in summer)
-- Note: Adjust timezone as needed. This example uses 16:00 UTC (17:00 CET in winter)
SELECT cron.schedule(
  'send-daily-reminders',
  '0 16 * * 1-5', -- Every day Monday-Friday at 16:00 UTC (17:00 CET)
  $$
  SELECT
    net.http_post(
      url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-daily-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $$
);
```

**Important:** Replace:
- `YOUR_PROJECT_REF` with your Supabase project reference
- `YOUR_SERVICE_ROLE_KEY` with your service role key (found in Project Settings → API)

### Option B: Using External Cron Service

You can use an external cron service like:
- cron-job.org
- EasyCron
- GitHub Actions (with scheduled workflows)

Set it to call:
```
POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-daily-reminders
Headers:
  Authorization: Bearer YOUR_SERVICE_ROLE_KEY
  Content-Type: application/json
```

Schedule: Daily at 17:00 CET (adjust UTC time accordingly)

## 7. Test the Setup

### Test Edge Function Manually

You can test the Edge Function by calling it directly:

```bash
curl -X POST \
  'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-daily-reminders' \
  -H 'Authorization: Bearer YOUR_SERVICE_ROLE_KEY' \
  -H 'Content-Type: application/json'
```

### Test Push Notifications

1. Open the app in a browser
2. Log in as a user
3. Grant notification permission when prompted
4. Register less than 6 hours for today
5. Manually trigger the Edge Function (or wait until 17:00)
6. You should receive a push notification

## Troubleshooting

### Notifications not working?

1. **Check VAPID keys**: Make sure they're correctly set in Supabase secrets
2. **Check environment variable**: Make sure `VITE_VAPID_PUBLIC_KEY` is set in your frontend environment
3. **Check service worker**: Open browser DevTools → Application → Service Workers to see if it's registered
4. **Check subscriptions**: Query `he_push_subscriptions` table to see if subscriptions are being saved
5. **Check Edge Function logs**: Go to Supabase Dashboard → Edge Functions → Logs

### iOS Notifications

- iOS 16.4+ is required for Web Push in PWAs
- The app must be installed on the home screen (added to home screen)
- Notifications only work when the app is installed as a PWA

