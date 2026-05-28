export const apiUrl = normalizeUrl(import.meta.env.VITE_API_URL || 'https://api.aneety.com');
export const supabaseUrl = normalizeUrl(import.meta.env.VITE_SUPABASE_URL || '');
export const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const hasSupabaseConfig = Boolean(supabaseUrl && supabasePublishableKey);

function normalizeUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}
