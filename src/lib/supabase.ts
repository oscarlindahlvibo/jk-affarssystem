import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// I Basic-versionen körs appen mot mockdata (src/data) tills miljövariablerna
// VITE_SUPABASE_URL och VITE_SUPABASE_ANON_KEY sätts i .env. Schemat i
// supabase/migrations/0001_init.sql är förberett för direkt anslutning.
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl as string, supabaseAnonKey as string)
  : null;
