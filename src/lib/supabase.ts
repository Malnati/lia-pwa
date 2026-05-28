import { createClient } from '@supabase/supabase-js';

import { supabasePublishableKey, supabaseUrl } from './config';

export function createSupabaseBrowserClient() {
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error('Supabase frontend config ausente');
  }

  return createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: false,
      persistSession: true
    }
  });
}
