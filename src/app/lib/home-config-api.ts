import { projectId, publicAnonKey } from '../../../utils/supabase/info';

export const HOME_CONFIG_API = `https://${projectId}.supabase.co/functions/v1/make-server-1d6e33e0/home-config`;
export const HOME_PAGE_API = `https://${projectId}.supabase.co/functions/v1/make-server-1d6e33e0/home-page`;
export const HOME_BANNERS_API = `https://${projectId}.supabase.co/functions/v1/home-config-1d6e33e0/banners`;
export const HOME_CATEGORY_TREE_API = `https://${projectId}.supabase.co/functions/v1/make-server-1d6e33e0/categories/tree`;
export const HOME_CATEGORY_IMAGES_API = `https://${projectId}.supabase.co/functions/v1/make-server-1d6e33e0/categories/images`;

export const HOME_CONFIG_PUBLIC_HEADERS: HeadersInit = {
  Authorization: `Bearer ${publicAnonKey}`,
  apikey: publicAnonKey,
};
