import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env, hasSupabasePublicEnv } from "@/lib/env";

let browserClient: SupabaseClient | null = null;

export function getBrowserSupabase() {
  if (!hasSupabasePublicEnv()) {
    return null;
  }

  if (!browserClient) {
    browserClient = createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  }

  return browserClient;
}
