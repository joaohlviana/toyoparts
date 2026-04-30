import { createClient } from '@supabase/supabase-js';
import { projectId, publicAnonKey } from '../../utils/supabase/info';

export { projectId, publicAnonKey };

const supabaseUrl = `https://${projectId}.supabase.co`;
export const supabase = createClient(supabaseUrl, publicAnonKey, {
  auth: {
    // This storefront only needs refreshes during explicit customer auth flows.
    autoRefreshToken: false,
    persistSession: true,
    detectSessionInUrl: true,
  },
});
