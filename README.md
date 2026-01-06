# Himmelstrup Time Tracker

A time tracking application built with Vite, React, Tailwind CSS, and Supabase.

## Setup

### Local Development

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file in the root directory:
```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_VAPID_PUBLIC_KEY=your_vapid_public_key
```

**Note:** For push notifications to work, you also need to set up VAPID keys. See [Push Notifications Setup](#push-notifications-setup) below.

3. Start the development server:
```bash
npm run dev
```

### Netlify Deployment

To deploy on Netlify, you need to set environment variables in the Netlify dashboard:

1. Go to your Netlify site dashboard
2. Navigate to **Site settings** → **Environment variables**
3. Add the following variables:
   - `VITE_SUPABASE_URL` - Your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` - Your Supabase anonymous key
   - `VITE_VAPID_PUBLIC_KEY` - Your VAPID public key (for push notifications)

**Important:** Make sure the variable names start with `VITE_` so Vite includes them in the build.

After setting the environment variables, trigger a new deploy or push a new commit.

## Tech Stack

- **Vite** - Build tool and dev server
- **React** - UI framework
- **Tailwind CSS** - Styling
- **Supabase** - Backend database
- **Lucide React** - Icons

## Push Notifications Setup

This app includes push notification functionality to remind users to register their time. See [supabase/README.md](supabase/README.md) for detailed setup instructions.

**Quick Setup:**
1. Run the database migration to create `he_push_subscriptions` table
2. Generate VAPID keys and add them to Supabase secrets
3. Deploy the Edge Function `send-daily-reminders`
4. Set up a cron job to run the function daily at 17:00
5. Add `VITE_VAPID_PUBLIC_KEY` to your environment variables

## Project Structure

```
├── src/
│   ├── App.jsx          # Main application component
│   ├── main.jsx         # React entry point
│   ├── index.css        # Global styles
│   └── lib/
│       ├── supabase.js  # Supabase client configuration
│       └── notifications.js  # Push notification utilities
├── public/
│   ├── manifest.json    # PWA manifest
│   └── sw.js            # Service Worker for push notifications
├── supabase/
│   ├── functions/
│   │   └── send-daily-reminders/  # Edge Function for daily reminders
│   ├── migrations/      # Database migrations
│   └── README.md        # Supabase setup instructions
├── index.html           # HTML entry point
├── vite.config.js       # Vite configuration
├── tailwind.config.js   # Tailwind configuration
└── netlify.toml         # Netlify deployment configuration
```

