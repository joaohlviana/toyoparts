import { projectId, publicAnonKey } from '../../../utils/supabase/info';

const BASE_URL = `https://${projectId}.supabase.co/functions/v1/make-server-1d6e33e0/magento`;

export interface MagentoCustomer {
  id: number;
  email: string;
  firstname: string;
  lastname: string;
  created_at: string;
  group_id: number;
  addresses?: MagentoAddress[];
}

export interface MagentoAddress {
  id: number;
  customer_id: number;
  region: { region_code: string; region: string };
  country_id: string;
  street: string[];
  telephone: string;
  postcode: string;
  city: string;
  firstname: string;
  lastname: string;
}

export interface MagentoOrder {
  entity_id: number;
  increment_id: string;
  created_at: string;
  status: string;
  grand_total: number;
  base_currency_code: string;
  customer_firstname: string;
  customer_lastname: string;
  customer_email: string;
  items?: MagentoOrderItem[];
}

export interface MagentoOrderItem {
  item_id: number;
  sku: string;
  name: string;
  qty_ordered: number;
  price: number;
}

export interface SearchResult<T> {
  items: T[];
  search_criteria: any;
  total_count: number;
}

async function fetchApi<T>(path: string, params: Record<string, any> = {}): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, String(v)));
  
  const res = await fetch(url.toString(), {
    headers: {
      'Authorization': `Bearer ${publicAnonKey}`,
      'Content-Type': 'application/json'
    }
  });
  
  if (!res.ok) {
    const text = await res.text();
    try {
      const json = JSON.parse(text);
      throw new Error(json.error || `Erro API: ${res.status}`);
    } catch {
      throw new Error(`Erro API: ${res.status}`);
    }
  }
  
  return res.json();
}

export async function fetchMagentoCustomers(page = 1, limit = 20, search = '') {
  return fetchApi<SearchResult<MagentoCustomer>>('/customers', { page, limit, search });
}

export async function fetchMagentoOrders(page = 1, limit = 20, search = '') {
  return fetchApi<SearchResult<MagentoOrder>>('/orders', { page, limit, search });
}