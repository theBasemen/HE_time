# Troubleshooting Push Notifications

## Problem: Edge Function runs but sends 0 notifications

### Step 1: Check if users have push subscriptions

Run this SQL query in Supabase SQL Editor:

```sql
SELECT 
  ps.id,
  ps.user_id,
  u.name as user_name,
  ps.created_at,
  ps.subscription->>'endpoint' as endpoint
FROM he_push_subscriptions ps
JOIN he_time_users u ON u.id = ps.user_id
WHERE u.is_active = true;
```

**If this returns 0 rows:** Users haven't granted notification permission in the app yet. They need to:
1. Open the app in a browser
2. Log in
3. Grant notification permission when prompted
4. The app will automatically register their push subscription

### Step 2: Check if users have registered less than 6 hours today

Run this SQL query to see current hours for each user today:

```sql
SELECT 
  u.id,
  u.name,
  COALESCE(SUM(l.hours), 0) as total_hours_today,
  COUNT(l.id) as log_count
FROM he_time_users u
LEFT JOIN he_time_logs l ON l.user_id = u.id
  AND l.timestamp >= CURRENT_DATE
  AND l.timestamp < CURRENT_DATE + INTERVAL '1 day'
WHERE u.is_active = true
GROUP BY u.id, u.name
ORDER BY u.name;
```

**If all users have >= 6 hours:** They won't receive notifications (this is correct behavior).

### Step 3: Test Edge Function with debug info

After deploying the updated Edge Function with debug info, test it again. The response should now include a `debug` array showing:
- Each user's total hours
- Whether they need a reminder (< 6 hours)
- How many subscriptions they have
- Any errors

Example response:
```json
{
  "message": "Daily reminders processed",
  "usersProcessed": 2,
  "notificationsSent": 0,
  "debug": [
    {
      "userId": "...",
      "userName": "John Doe",
      "totalHours": 2.5,
      "needsReminder": true,
      "subscriptionsCount": 0,
      "skipped": "No push subscriptions"
    }
  ]
}
```

### Step 4: Verify VAPID keys are set correctly

In Supabase Dashboard → Project Settings → Edge Functions → Secrets, verify:
- `VAPID_PUBLIC_KEY` is set
- `VAPID_PRIVATE_KEY` is set  
- `VAPID_SUBJECT` is set (e.g., `mailto:admin@himmelstrup.dk`)

### Step 5: Check Edge Function logs

1. Go to Supabase Dashboard → Edge Functions → `send-daily-reminders`
2. Click on "Logs" tab
3. Look for any error messages

Common errors:
- `Missing VAPID keys` - Keys not set in secrets
- `Invalid subscription` - Subscription object is malformed
- `web-push module not loaded` - Import error

### Step 6: Test push notification manually

To test if push notifications work at all:

1. Make sure a user has granted permission and has a subscription in the database
2. Make sure that user has < 6 hours registered today
3. Manually trigger the Edge Function
4. Check browser console for any errors
5. Check if notification appears (may need to wait a few seconds)

## Common Issues

### Issue: "No push subscriptions" for all users

**Solution:** Users need to grant notification permission in the app. The app automatically registers subscriptions when:
- User logs in
- Notification permission is granted
- VAPID_PUBLIC_KEY is set in environment variables

### Issue: Subscriptions exist but notifications don't send

**Possible causes:**
1. VAPID keys mismatch - Public key in frontend doesn't match private key in Edge Function
2. Subscription expired - Browser may have invalidated the subscription
3. Service worker not registered - Check browser DevTools → Application → Service Workers

**Solution:**
1. Verify `VITE_VAPID_PUBLIC_KEY` in Netlify matches `VAPID_PUBLIC_KEY` in Supabase secrets
2. Have user grant permission again (will create new subscription)
3. Check service worker is registered in browser

### Issue: Edge Function returns errors

Check the `errors` array in the response. Common errors:
- `Error fetching logs` - Database permission issue
- `Error fetching subscriptions` - Database permission issue  
- `Failed to send notification` - VAPID key issue or invalid subscription

## Testing Checklist

- [ ] Database migration has been run (`he_push_subscriptions` table exists)
- [ ] VAPID keys are set in Supabase secrets
- [ ] `VITE_VAPID_PUBLIC_KEY` is set in Netlify environment variables
- [ ] Edge Function is deployed
- [ ] At least one user has granted notification permission
- [ ] At least one user has < 6 hours registered today
- [ ] Service worker is registered (check browser DevTools)
- [ ] Edge Function logs show no errors

