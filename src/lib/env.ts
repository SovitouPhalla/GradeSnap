const publicEnvKeys = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"] as const;

export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  googleCloudVisionApiKey: process.env.GOOGLE_CLOUD_VISION_API_KEY ?? "",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
};

export function missingPublicEnv() {
  return publicEnvKeys.filter((key) => !process.env[key]);
}

export function hasSupabasePublicEnv() {
  return Boolean(env.supabaseUrl && env.supabaseAnonKey);
}

export function hasSupabaseServiceEnv() {
  return hasSupabasePublicEnv() && Boolean(env.supabaseServiceRoleKey);
}

export function hasVisionEnv() {
  return Boolean(env.googleCloudVisionApiKey);
}

export function hasAnthropicEnv() {
  return Boolean(env.anthropicApiKey);
}
