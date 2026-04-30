import { projectId } from '../../../utils/supabase/info';
import { adminFetch } from './admin-auth';

const API = `https://${projectId}.supabase.co/functions/v1/make-server-1d6e33e0/admin/discounts`;

export type DiscountStatus =
  | 'desconto_publicado'
  | 'pronto_para_publicar'
  | 'publicacao_pendente_reversao'
  | 'sem_desconto_adicional'
  | 'sem_special_price_valido';

export interface DiscountMetaSummary {
  importedAt: string | null;
  total: number;
  valid?: number;
  invalid?: number;
  source?: string | null;
  rejectedCount?: number;
  totalWithAdditional?: number;
  publishedAt?: string | null;
}

export interface DraftAdditionalRow {
  sku: string;
  additionalDiscountPercent: number;
  updatedAt: string;
  source: 'csv' | 'manual';
}

export interface DiscountResultRow {
  sku: string;
  price: number;
  special_price: number | null;
  currentDiscountPercent: number;
  additionalDiscountPercent: number;
  finalPrice: number | null;
  totalDiscountPercent: number | null;
  status: DiscountStatus;
  isPublished: boolean;
  publishedAt: string | null;
}

export interface DiscountResultsResponse {
  rows: DiscountResultRow[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  summary: {
    total: number;
    eligible: number;
    invalid: number;
    changed: number;
    published: number;
  };
}

export interface DiscountSnapshotResponse {
  meta: {
    prices: DiscountMetaSummary;
    additional: DiscountMetaSummary;
    published: DiscountMetaSummary;
  };
  counts: {
    draftPrices: number;
    draftAdditional: number;
    published: number;
  };
  recentAdditional: DraftAdditionalRow[];
}

export interface DiscountImportStatus {
  status: 'idle' | 'running' | 'completed' | 'error';
  source?: 'magento' | 'catalog_cache_fallback' | null;
  startedAt?: string | null;
  importedAt?: string | null;
  completedAt?: string | null;
  failedAt?: string | null;
  totalMagentoProducts?: number;
  totalPages?: number;
  currentPage?: number;
  processedPages?: number;
  matchedRows?: number;
  valid?: number;
  invalid?: number;
  pagesPerStep?: number;
  resumePage?: number | null;
  lastBatchPages?: number[];
  lastStepMs?: number | null;
  lastError?: string | null;
  stale?: boolean;
  elapsedMinutes?: number;
}

async function parseResponse<T>(response: Response, fallbackMessage: string): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok || (data as any)?.error) {
    throw new Error((data as any)?.error || fallbackMessage);
  }
  return data as T;
}

export async function fetchDiscountSnapshot(): Promise<DiscountSnapshotResponse> {
  const response = await adminFetch(`${API}/snapshot`);
  return parseResponse<DiscountSnapshotResponse>(response, 'Falha ao carregar descontos');
}

export async function importMagentoDiscountPrices() {
  const response = await adminFetch(`${API}/import-magento`, {
    method: 'POST',
  });
  return parseResponse<{
    ok: boolean;
    source: string;
    importedAt: string;
    summary: DiscountMetaSummary;
  }>(response, 'Falha ao importar precos do Magento');
}

export async function fetchDiscountImportStatus() {
  const response = await adminFetch(`${API}/import-magento/status`);
  return parseResponse<DiscountImportStatus>(response, 'Falha ao carregar status do import');
}

export async function startMagentoDiscountImport(force = false) {
  const suffix = force ? '?force=1' : '';
  const response = await adminFetch(`${API}/import-magento/start${suffix}`, {
    method: 'POST',
  });
  return parseResponse<{
    ok: boolean;
    message: 'started' | 'completed';
    status: DiscountImportStatus;
    summary?: DiscountMetaSummary;
  }>(response, 'Falha ao iniciar importacao do Magento');
}

export async function stepMagentoDiscountImport() {
  const response = await adminFetch(`${API}/import-magento/step`, {
    method: 'POST',
  });
  return parseResponse<{
    ok: boolean;
    message: 'step_done' | 'completed';
    status: DiscountImportStatus;
    step?: {
      pages: number[];
      matchedRows: number;
      valid: number;
      invalid: number;
      stepMs: number;
    };
    summary?: DiscountMetaSummary;
  }>(response, 'Falha ao executar etapa do import');
}

export async function resetMagentoDiscountImport() {
  const response = await adminFetch(`${API}/import-magento/reset`, {
    method: 'POST',
  });
  return parseResponse<{ ok: boolean; status: DiscountImportStatus }>(response, 'Falha ao resetar importacao');
}

export async function importAdditionalDiscounts(text: string) {
  const response = await adminFetch(`${API}/import-additional`, {
    method: 'POST',
    body: JSON.stringify({ text }),
  });
  return parseResponse<{
    ok: boolean;
    importedAt: string;
    appliedCount: number;
    invalidRows: Array<{ line: number; reason: string; raw: string }>;
  }>(response, 'Falha ao importar desconto adicional');
}

export async function upsertAdditionalDiscount(sku: string, additionalDiscountPercent: number) {
  const response = await adminFetch(`${API}/upsert-sku`, {
    method: 'POST',
    body: JSON.stringify({ sku, additionalDiscountPercent }),
  });
  return parseResponse<{
    ok: boolean;
    row?: DraftAdditionalRow;
    removed?: boolean;
    sku: string;
  }>(response, 'Falha ao salvar desconto por SKU');
}

export async function fetchDiscountResults(params: {
  q?: string;
  status?: string;
  limit?: number;
  offset?: number;
} = {}) {
  const search = new URLSearchParams();
  if (params.q) search.set('q', params.q);
  if (params.status) search.set('status', params.status);
  search.set('limit', String(params.limit || 50));
  search.set('offset', String(params.offset || 0));
  const response = await adminFetch(`${API}/results?${search.toString()}`);
  return parseResponse<DiscountResultsResponse>(response, 'Falha ao carregar resultado de descontos');
}

export async function publishDiscounts() {
  const response = await adminFetch(`${API}/publish`, {
    method: 'POST',
  });
  return parseResponse<{
    ok: boolean;
    publishedAt: string;
    publishedCount: number;
    unpublishedCount: number;
    updatedProducts: number;
    meiliTaskUid: number | null;
  }>(response, 'Falha ao publicar descontos');
}

export function buildDiscountExportUrl(kind: 'prices' | 'results') {
  return `${API}/export?kind=${kind}`;
}
