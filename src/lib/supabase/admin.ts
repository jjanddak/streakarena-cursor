import { createClient } from '@supabase/supabase-js';

/**
 * Server-only Supabase client with service role key.
 * Use in API routes and server actions for admin/match logic.
 */
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL');
  }
  return createClient(supabaseUrl, serviceRoleKey);
}
