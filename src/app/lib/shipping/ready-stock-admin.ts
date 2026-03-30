import { projectId } from '../../../../utils/supabase/info';
import { adminFetch } from '../admin-auth';

const API = `https://${projectId}.supabase.co/functions/v1/make-server-1d6e33e0/admin/ready-stock`;

export interface ReadyStockConfig {
  enabled: boolean;
  crossdockAdditionalDays: number;
  reservationTtlMinutes: number;
}

export interface ReadyStockBranch {
  id: string;
  name: string;
  active: boolean;
  additionalDays: number;
}

export interface ReadyStockItem {
  sku: string;
  totalQty: number;
  allocations: Array<{
    branchId: string;
    qty: number;
  }>;
  updatedAt: string;
}

export interface ReadyStockSummary {
  skuCount: number;
  totalQty: number;
  branchCount: number;
  byBranch: Array<{
    branchId: string;
    name: string;
    totalQty: number;
    skuCount: number;
  }>;
}

export interface ReadyStockSnapshot {
  config: ReadyStockConfig;
  branches: ReadyStockBranch[];
  items: ReadyStockItem[];
  summary: ReadyStockSummary;
}

export interface ReadyStockPreviewResponse {
  preview: {
    validRows: Array<{
      line: number;
      sku: string;
      branchId: string;
      qty: number;
    }>;
    invalidRows: Array<{
      line: number;
      reason: string;
      raw?: string;
    }>;
    summary: ReadyStockSummary;
  };
}

export async function fetchReadyStockSnapshot(): Promise<ReadyStockSnapshot> {
  const response = await adminFetch(`${API}/snapshot`);
  if (!response.ok) throw new Error('Falha ao carregar pronta entrega');
  return response.json();
}

export async function saveReadyStockConfig(config: ReadyStockConfig): Promise<ReadyStockConfig> {
  const response = await adminFetch(`${API}/config`, {
    method: 'POST',
    body: JSON.stringify(config),
  });
  if (!response.ok) throw new Error('Falha ao salvar configuracao');
  const data = await response.json();
  return data.config;
}

export async function saveReadyStockBranches(branches: ReadyStockBranch[]): Promise<ReadyStockBranch[]> {
  const response = await adminFetch(`${API}/branches`, {
    method: 'POST',
    body: JSON.stringify({ branches }),
  });
  if (!response.ok) throw new Error('Falha ao salvar filiais');
  const data = await response.json();
  return data.branches || [];
}

export async function previewReadyStockImport(payload: {
  text: string;
  defaultBranchId?: string;
  defaultQty?: number;
}): Promise<ReadyStockPreviewResponse> {
  const response = await adminFetch(`${API}/import/preview`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error('Falha ao gerar preview da importacao');
  return response.json();
}

export async function applyReadyStockImport(payload: {
  text: string;
  defaultBranchId?: string;
  defaultQty?: number;
  mode: 'replace' | 'merge';
}): Promise<{ ok: boolean; items: ReadyStockItem[]; summary: ReadyStockSummary }> {
  const response = await adminFetch(`${API}/import/apply`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error('Falha ao aplicar importacao');
  return response.json();
}

