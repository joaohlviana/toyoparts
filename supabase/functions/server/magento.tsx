import { Hono } from 'npm:hono';

export const magento = new Hono();

// Helper to fetch from Magento
export async function fetchMagento(path: string, query: Record<string, string> = {}) {
  const baseUrl = Deno.env.get('MAGENTO_URL') || 'https://www.toyoparts.com.br'; // Fallback logic
  const token = Deno.env.get('MAGENTO_TOKEN');

  if (!token) {
    throw new Error('Magento configuration missing (MAGENTO_TOKEN)');
  }

  // Remove trailing slash from baseUrl
  const cleanBase = baseUrl.replace(/\/$/, '');
  // Ensure path starts with slash
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  
  // Construct URL - assumes standard Magento REST path
  const apiUrl = new URL(`${cleanBase}/rest${cleanPath}`);

  // Add query params
  Object.entries(query).forEach(([k, v]) => apiUrl.searchParams.append(k, v));

  console.log(`[Magento Proxy] Fetching ${apiUrl.toString().split('?')[0]}...`);

  // Timeout de 30 segundos para evitar travamento da Edge Function
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  let res;
  try {
    res = await fetch(apiUrl.toString(), {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    });
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error(`Magento request timed out after 30s: ${cleanPath}`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  const text = await res.text();
  const contentType = res.headers.get('content-type');

  // Check for HTML content
  if ((contentType && contentType.includes('text/html')) || text.trim().startsWith('<')) {
    console.error(`[Magento Proxy] Expected JSON but got HTML from ${apiUrl.toString()}: ${text.substring(0, 500)}`);
    throw new Error(`Magento API returned HTML instead of JSON. Check URL configuration. Response: ${text.substring(0, 100)}...`);
  }

  if (!res.ok) {
    console.error(`[Magento Proxy] Error ${res.status}: ${text}`);
    try {
        const json = JSON.parse(text);
        throw new Error(json.message || `Magento Error ${res.status}`);
    } catch {
        throw new Error(`Magento Error ${res.status}: ${text}`);
    }
  }

  try {
    return JSON.parse(text);
  } catch (e) {
    console.error(`[Magento Proxy] Failed to parse JSON from ${apiUrl.toString()}: ${text.substring(0, 500)}`);
    throw new Error(`Invalid JSON response from Magento: ${text.substring(0, 100)}...`);
  }
}

// ─── Customers ───
magento.get('/customers', async (c) => {
  try {
    const page = c.req.query('page') || '1';
    const limit = c.req.query('limit') || '20';
    const search = c.req.query('search') || '';
    
    // Magento Search Criteria
    const query: Record<string, string> = {
      'searchCriteria[currentPage]': page,
      'searchCriteria[pageSize]': limit,
      'searchCriteria[sortOrders][0][field]': 'created_at',
      'searchCriteria[sortOrders][0][direction]': 'DESC',
    };

    if (search) {
      // Filter Group 0: First Name OR Last Name OR Email
      // Magento OR logic requires filters in the SAME filter group
      query['searchCriteria[filter_groups][0][filters][0][field]'] = 'firstname';
      query['searchCriteria[filter_groups][0][filters][0][value]'] = `%${search}%`;
      query['searchCriteria[filter_groups][0][filters][0][condition_type]'] = 'like';
      
      query['searchCriteria[filter_groups][0][filters][1][field]'] = 'lastname';
      query['searchCriteria[filter_groups][0][filters][1][value]'] = `%${search}%`;
      query['searchCriteria[filter_groups][0][filters][1][condition_type]'] = 'like';
      
      query['searchCriteria[filter_groups][0][filters][2][field]'] = 'email';
      query['searchCriteria[filter_groups][0][filters][2][value]'] = `%${search}%`;
      query['searchCriteria[filter_groups][0][filters][2][condition_type]'] = 'like';
    }

    const data = await fetchMagento('/V1/customers/search', query);
    return c.json(data);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ─── Orders ───
magento.get('/orders', async (c) => {
  try {
    const page = c.req.query('page') || '1';
    const limit = c.req.query('limit') || '20';
    const search = c.req.query('search') || '';
    
    const query: Record<string, string> = {
      'searchCriteria[currentPage]': page,
      'searchCriteria[pageSize]': limit,
      'searchCriteria[sortOrders][0][field]': 'created_at',
      'searchCriteria[sortOrders][0][direction]': 'DESC',
    };
    
    if (search) {
        // Search by Increment ID or Customer Email
        query['searchCriteria[filter_groups][0][filters][0][field]'] = 'increment_id';
        query['searchCriteria[filter_groups][0][filters][0][value]'] = `%${search}%`;
        query['searchCriteria[filter_groups][0][filters][0][condition_type]'] = 'like';
        
        query['searchCriteria[filter_groups][0][filters][1][field]'] = 'customer_email';
        query['searchCriteria[filter_groups][0][filters][1][value]'] = `%${search}%`;
        query['searchCriteria[filter_groups][0][filters][1][condition_type]'] = 'like';
    }

    const data = await fetchMagento('/V1/orders', query);
    return c.json(data);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});
