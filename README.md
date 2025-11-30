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
```

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

**Important:** Make sure the variable names start with `VITE_` so Vite includes them in the build.

After setting the environment variables, trigger a new deploy or push a new commit.

## Tech Stack

- **Vite** - Build tool and dev server
- **React** - UI framework
- **Tailwind CSS** - Styling
- **Supabase** - Backend database
- **Lucide React** - Icons

## Project Structure

```
├── src/
│   ├── App.jsx          # Main application component
│   ├── main.jsx         # React entry point
│   ├── index.css        # Global styles
│   └── lib/
│       └── supabase.js  # Supabase client configuration
├── index.html           # HTML entry point
├── vite.config.js       # Vite configuration
├── tailwind.config.js   # Tailwind configuration
└── netlify.toml         # Netlify deployment configuration
```

