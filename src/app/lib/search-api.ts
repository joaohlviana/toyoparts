import { projectId, publicAnonKey } from '../../../utils/supabase/info';

const BASE_URL = `https://${projectId}.supabase.co/functions/v1/make-server-1d6e33e0/search-ops`;

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
    throw new Error(`API Error ${res.status}: ${errorText}`);
  }

  return res.json();
}

export const searchApi = {
  getStats: () => fetchApi('/stats'),
  
  searchLab: (query: string, options: any = {}) => fetchApi('/lab/search', {
    method: 'POST',
    body: JSON.stringify({ q: query, ...options }),
  }),
  
  analyzeAi: (query: string) => fetchApi('/ai/analyze', {
    method: 'POST',
    body: JSON.stringify({ q: query }),
  }),
  
  getSettings: () => fetchApi('/settings'),
  updateSettings: (settings: any) => fetchApi('/settings', {
    method: 'POST',
    body: JSON.stringify(settings),
  }),
  
  getTasks: (limit = 20) => fetchApi(`/tasks?limit=${limit}`),
  getIndexes: () => fetchApi('/indexes'),
  
  getMerchRules: () => fetchApi('/merchandising'),
  saveMerchRules: (data: any) => fetchApi('/merchandising', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  repairIndex: () => fetchApi('/repair-index', {
    method: 'POST'
  }),
};
