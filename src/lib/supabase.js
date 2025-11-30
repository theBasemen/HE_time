import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  const errorMsg = 'Mangler Supabase URL eller Key. Tjek at VITE_SUPABASE_URL og VITE_SUPABASE_ANON_KEY er sat i Netlify environment variables.'
  console.error(errorMsg)
  throw new Error(errorMsg)
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)