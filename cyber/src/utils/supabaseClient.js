import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://qvgpzxvnoxausyiemgaq.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF2Z3B6eHZub3hhdXN5aWVtZ2FxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTExMTg4MzgsImV4cCI6MjEwNjY5NDgzOH0.f0XMB46TQZjlRTeao0ayCMWxRvSNYMcyu_9WWzGOmvY';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

export default supabase;
