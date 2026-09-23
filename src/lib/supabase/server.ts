import { createClient } from "@supabase/supabase-js";
import { env, hasSupabasePublicEnv, hasSupabaseServiceEnv } from "@/lib/env";

export function getAnonSupabase() {
  if (!hasSupabasePublicEnv()) {
    throw new Error("Supabase public environment variables are missing.");
  }

  return createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function getServiceSupabase() {
  if (!hasSupabaseServiceEnv()) {
    throw new Error("Supabase service role environment variable is missing.");
  }

  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
