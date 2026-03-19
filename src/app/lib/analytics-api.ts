import { projectId, publicAnonKey } from '../../utils/supabase/info';

const BASE_URL = `https://${projectId}.supabase.co/functions/v1/make-server-1d6e33e0`;

async function fetchApi(endpoint: string, options: RequestInit = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${publicAnonKey}`,
    ...options.headers,
  };

  const res = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error(`API Error ${res.status}: ${errorText}`);
    return null; // Fail gracefully for analytics/tracking
  }

  return res.json();
}

export const analyticsApi = {
  // Rastreamento (Fire & Forget)
  trackEvent: (userId: string, event: string, data: any) => 
    fetchApi('/analytics/track', {
      method: 'POST',
      body: JSON.stringify({ userId, event, data }),
    }),

  // Sessão ("Voltar onde parou")
  getSession: (userId: string) => fetchApi(`/analytics/session/${userId}`),

  // Recomendações
  getContinueWatching: (userId: string) => fetchApi(`/recommendations/continue/${userId}`),
  
  getBundle: (sku: string) => fetchApi(`/recommendations/bundle/${sku}`),

  optimizeCart: (cartData: { cartTotal: number; cartItems: any[]; userId: string }) => 
    fetchApi('/recommendations/cart/optimize', {
      method: 'POST',
      body: JSON.stringify(cartData),
    }),
};
