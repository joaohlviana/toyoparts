import { Hono } from 'npm:hono';
import * as kv from './kv_store.tsx';

export const readyStockAdmin = new Hono();

const CONFIG_KEY = 'meta:ready_stock_config';
const BRANCHES_KEY = 'meta:ready_stock_branches';
const STOCK_PREFIX = 'ready-stock:sku:';
const PRODUCT_PREFIX = 'product:';

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

interface ParsedImportRow {
  line: number;
  sku: string;
  branchId: string;
  qty: number;
}

const DEFAULT_CONFIG: ReadyStockConfig = {
  enabled: true,
  crossdockAdditionalDays: 5,
  reservationTtlMinutes: 30,
};

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function normalizeSku(value: unknown): string {
  return String(value || '').trim().toUpperCase();
}

function normalizeBranchId(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function sanitizeConfig(raw: any): ReadyStockConfig {
  return {
    enabled: raw?.enabled !== false,
    crossdockAdditionalDays: Number.isFinite(Number(raw?.crossdockAdditionalDays))
      ? Math.max(0, Number(raw.crossdockAdditionalDays))
      : DEFAULT_CONFIG.crossdockAdditionalDays,
    reservationTtlMinutes: Number.isFinite(Number(raw?.reservationTtlMinutes))
      ? Math.max(5, Number(raw.reservationTtlMinutes))
      : DEFAULT_CONFIG.reservationTtlMinutes,
  };
}

function sanitizeBranch(raw: any): ReadyStockBranch {
  return {
    id: normalizeBranchId(raw?.id || raw?.branchId || raw?.name || crypto.randomUUID()),
    name: String(raw?.name || 'Filial sem nome').trim() || 'Filial sem nome',
    active: raw?.active !== false,
    additionalDays: Number.isFinite(Number(raw?.additionalDays))
      ? Math.max(0, Number(raw.additionalDays))
      : 0,
  };
}

function sanitizeBranches(raw: any): ReadyStockBranch[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw
    .map(sanitizeBranch)
    .filter((branch) => {
      if (!branch.id || seen.has(branch.id)) return false;
      seen.add(branch.id);
      return true;
    });
}

function sanitizeItem(raw: any): ReadyStockItem | null {
  const sku = normalizeSku(raw?.sku);
  if (!sku) return null;

  const allocations = Array.isArray(raw?.allocations)
    ? raw.allocations
        .map((allocation: any) => ({
          branchId: normalizeBranchId(allocation?.branchId),
          qty: Math.max(0, Number(allocation?.qty || 0)),
        }))
        .filter((allocation: any) => allocation.branchId && allocation.qty > 0)
    : [];

  return {
    sku,
    totalQty: allocations.reduce((sum: number, allocation: any) => sum + allocation.qty, 0),
    allocations,
    updatedAt: raw?.updatedAt || new Date().toISOString(),
  };
}

async function getConfig(): Promise<ReadyStockConfig> {
  return sanitizeConfig(await kv.get(CONFIG_KEY));
}

async function saveConfig(config: ReadyStockConfig) {
  await kv.set(CONFIG_KEY, sanitizeConfig(config));
}

async function getBranches(): Promise<ReadyStockBranch[]> {
  return sanitizeBranches(await kv.get(BRANCHES_KEY));
}

async function saveBranches(branches: ReadyStockBranch[]) {
  await kv.set(BRANCHES_KEY, sanitizeBranches(branches));
}

async function listItems(): Promise<ReadyStockItem[]> {
  const raw = await kv.getByPrefix(STOCK_PREFIX);
  return (raw || [])
    .map(sanitizeItem)
    .filter(Boolean)
    .sort((a: any, b: any) => (b.totalQty - a.totalQty) || a.sku.localeCompare(b.sku));
}

async function deleteAllItems(): Promise<void> {
  const keys = await kv.keysByPrefix(STOCK_PREFIX);
  if (!Array.isArray(keys) || keys.length === 0) return;
  await Promise.all(keys.map((key: string) => kv.del(key)));
}

async function saveItems(items: ReadyStockItem[]): Promise<void> {
  await Promise.all(
    items.map((item) => kv.set(`${STOCK_PREFIX}${item.sku}`, {
      sku: item.sku,
      allocations: item.allocations,
      updatedAt: item.updatedAt,
    }))
  );
}

async function productExists(sku: string): Promise<boolean> {
  try {
    const product = await kv.get(`${PRODUCT_PREFIX}${sku}`);
    return !!product;
  } catch {
    return false;
  }
}

function parseImportPayload(payload: {
  text?: string;
  defaultBranchId?: string;
  defaultQty?: number;
}, branches: ReadyStockBranch[]) {
  const text = String(payload?.text || '').trim();
  const defaultBranchId = normalizeBranchId(payload?.defaultBranchId);
  const defaultQty = Math.max(1, Number(payload?.defaultQty || 1));
  const branchIds = new Set(branches.map((branch) => branch.id));

  const lines = text
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return {
      validRows: [] as ParsedImportRow[],
      invalidRows: [{ line: 0, reason: 'Nenhum dado informado' }],
    };
  }

  const headerCols = lines[0].split(/\t|;|,/g).map((col) => col.trim().toLowerCase());
  const headerLooksValid = headerCols.includes('sku')
    || headerCols.includes('filial')
    || headerCols.includes('branch_id')
    || headerCols.includes('qty')
    || headerCols.includes('quantidade');

  const dataLines = headerLooksValid ? lines.slice(1) : lines;
  const headerIndex = {
    sku: headerCols.findIndex((col) => col === 'sku'),
    branch: headerCols.findIndex((col) => ['branch_id', 'filial', 'filial_id', 'branch'].includes(col)),
    qty: headerCols.findIndex((col) => ['qty', 'quantidade', 'quantity'].includes(col)),
  };

  const validRows: ParsedImportRow[] = [];
  const invalidRows: Array<{ line: number; reason: string; raw?: string }> = [];

  dataLines.forEach((rawLine, index) => {
    const cols = rawLine.split(/\t|;|,/g).map((col) => col.trim());
    const lineNumber = headerLooksValid ? index + 2 : index + 1;

    const sku = normalizeSku(headerLooksValid && headerIndex.sku >= 0 ? cols[headerIndex.sku] : cols[0]);
    const branchId = normalizeBranchId(
      headerLooksValid && headerIndex.branch >= 0
        ? cols[headerIndex.branch]
        : cols[1] || defaultBranchId
    );
    const qty = Number(
      headerLooksValid && headerIndex.qty >= 0
        ? cols[headerIndex.qty]
        : cols[2] || cols[1] || defaultQty
    );

    if (!sku) {
      invalidRows.push({ line: lineNumber, reason: 'SKU ausente', raw: rawLine });
      return;
    }

    if (!branchId) {
      invalidRows.push({ line: lineNumber, reason: 'Filial ausente', raw: rawLine });
      return;
    }

    if (!branchIds.has(branchId)) {
      invalidRows.push({ line: lineNumber, reason: `Filial invalida: ${branchId}`, raw: rawLine });
      return;
    }

    if (!Number.isFinite(qty) || qty <= 0) {
      invalidRows.push({ line: lineNumber, reason: 'Quantidade invalida', raw: rawLine });
      return;
    }

    validRows.push({
      line: lineNumber,
      sku,
      branchId,
      qty: Math.round(qty),
    });
  });

  return { validRows, invalidRows };
}

function buildImportItems(rows: ParsedImportRow[]): ReadyStockItem[] {
  const bySku = new Map<string, Map<string, number>>();

  rows.forEach((row) => {
    if (!bySku.has(row.sku)) bySku.set(row.sku, new Map<string, number>());
    const branchMap = bySku.get(row.sku)!;
    branchMap.set(row.branchId, row.qty);
  });

  return Array.from(bySku.entries()).map(([sku, branchMap]) => ({
    sku,
    allocations: Array.from(branchMap.entries()).map(([branchId, qty]) => ({ branchId, qty })),
    totalQty: Array.from(branchMap.values()).reduce((sum, qty) => sum + qty, 0),
    updatedAt: new Date().toISOString(),
  }));
}

function buildSummary(items: ReadyStockItem[], branches: ReadyStockBranch[]) {
  const byBranch = branches.map((branch) => ({
    branchId: branch.id,
    name: branch.name,
    totalQty: items.reduce(
      (sum, item) => sum + item.allocations.filter((allocation) => allocation.branchId === branch.id).reduce((acc, allocation) => acc + allocation.qty, 0),
      0
    ),
    skuCount: items.filter((item) => item.allocations.some((allocation) => allocation.branchId === branch.id)).length,
  }));

  return {
    skuCount: items.length,
    totalQty: items.reduce((sum, item) => sum + item.totalQty, 0),
    branchCount: branches.length,
    byBranch,
  };
}

readyStockAdmin.get('/snapshot', async (c) => {
  const [config, branches, items] = await Promise.all([getConfig(), getBranches(), listItems()]);
  return c.json({
    config,
    branches,
    items,
    summary: buildSummary(items, branches),
  });
});

readyStockAdmin.post('/config', async (c) => {
  const payload = await c.req.json();
  const config = sanitizeConfig(payload);
  await saveConfig(config);
  return c.json({ config });
});

readyStockAdmin.post('/branches', async (c) => {
  const payload = await c.req.json();
  const branches = sanitizeBranches(payload?.branches || []);
  await saveBranches(branches);
  return c.json({ branches });
});

readyStockAdmin.post('/import/preview', async (c) => {
  const payload = await c.req.json();
  const branches = await getBranches();
  const { validRows, invalidRows } = parseImportPayload(payload, branches);
  const uniqueSkus = unique(validRows.map((row) => row.sku));
  const skuChecks = await Promise.all(uniqueSkus.map(async (sku) => ({ sku, exists: await productExists(sku) })));
  const missingSkus = skuChecks.filter((item) => !item.exists).map((item) => item.sku);

  const filteredRows = validRows.filter((row) => !missingSkus.includes(row.sku));
  const items = buildImportItems(filteredRows);

  return c.json({
    preview: {
      validRows: filteredRows,
      invalidRows: [
        ...invalidRows,
        ...missingSkus.map((sku) => ({ line: 0, reason: `SKU nao encontrado no catalogo: ${sku}` })),
      ],
      summary: buildSummary(items, branches),
    },
  });
});

readyStockAdmin.post('/import/apply', async (c) => {
  const payload = await c.req.json();
  const mode = payload?.mode === 'merge' ? 'merge' : 'replace';
  const branches = await getBranches();
  const { validRows } = parseImportPayload(payload, branches);
  const skuChecks = await Promise.all(unique(validRows.map((row) => row.sku)).map(async (sku) => ({ sku, exists: await productExists(sku) })));
  const existingSkus = new Set(skuChecks.filter((item) => item.exists).map((item) => item.sku));
  const importItems = buildImportItems(validRows.filter((row) => existingSkus.has(row.sku)));

  if (mode === 'replace') {
    await deleteAllItems();
    await saveItems(importItems);
  } else {
    const currentItems = await listItems();
    const merged = new Map<string, ReadyStockItem>(currentItems.map((item) => [item.sku, item]));

    importItems.forEach((item) => {
      merged.set(item.sku, item);
    });

    await saveItems(Array.from(merged.values()));
  }

  const finalItems = await listItems();
  return c.json({
    ok: true,
    items: finalItems,
    summary: buildSummary(finalItems, branches),
  });
});

readyStockAdmin.get('/items', async (c) => {
  const [branches, items] = await Promise.all([getBranches(), listItems()]);
  return c.json({ items, summary: buildSummary(items, branches) });
});
