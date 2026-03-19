/**
 * Web Worker — Price List Parser (com resolução de cadeia de substituição)
 *
 * Recebe:
 *   { type: 'parse', text: string, siteSkusArray: string[] }
 *
 * Envia:
 *   { type: 'progress', linesProcessed, totalLines, phase: 'parsing'|'resolving' }
 *   { type: 'done', matchedItems, missingSkus, stats }
 *   { type: 'error', message }
 *
 * ─── Lógica de substituição ───────────────────────────────────────────────────
 * Quando a coluna CodSubstitutivo [8] está preenchida, significa que esse SKU
 * foi substituído pelo código novo. O preço que deve ser aplicado ao SKU
 * original é o preço do substituto FINAL (sem substituto, ou cujo substituto
 * não consta no arquivo). A cadeia é resolvida recursivamente com proteção
 * contra loops (max 20 saltos).
 */

export interface PriceItem {
  sku          : string;
  price        : number;
  special_price: number;
  resolvedSku  : string;  // SKU cujo preço foi efetivamente usado
}

export interface ParseStats {
  totalLines      : number;
  validLines      : number;
  parseErrors     : number;
  duplicates      : number;
  substitutedCount: number;
  matchedCount    : number;
  missingCount    : number;
  missingIgnored? : number;
  missingTotal?   : number;
}

// ─── Tipos internos ──────────────────────────────────────────────────────────

interface FileEntry {
  publCents: number;
  codSub   : string | null; // normalizado, ou null se vazio
}

// ─── Normalização de SKU ─────────────────────────────────────────────────────

function normalizeSku(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '');
}

// ─── Resolver cadeia de substituição ─────────────────────────────────────────
// Retorna o publCents e o SKU "raiz" (o definitivo sem substituto).
// Se o substituto não existir no mapa do arquivo, usa o preço do próprio SKU.

function resolveChain(
  sku      : string,
  entries  : Map<string, FileEntry>,
  depth    = 0,
): { publCents: number; resolvedSku: string } | null {
  if (depth > 20) return null;                    // proteção contra loop

  const entry = entries.get(sku);
  if (!entry) return null;                        // SKU não existe no arquivo

  if (entry.codSub && entries.has(entry.codSub)) {
    // Tem substituto válido no arquivo → seguir a cadeia
    const next = resolveChain(entry.codSub, entries, depth + 1);
    if (next) return next;
  }

  // Sem substituto (ou substituto inexistente no arquivo) → usar preço próprio
  return { publCents: entry.publCents, resolvedSku: sku };
}

// ─── Worker ──────────────────────────────────────────────────────────────────

self.onmessage = (e: MessageEvent) => {
  try {
    const { type, text, siteSkusArray } = e.data as {
      type          : string;
      text          : string;
      siteSkusArray : string[];
    };

    if (type !== 'parse') return;

    const siteSkuSet = new Set<string>(siteSkusArray);

    // ── Passo 1: Construir mapa completo do arquivo ───────────────────────────
    // Lê TODAS as linhas A; e constrói allEntries (incluindo SKUs que não
    // existem no site, pois podem ser alvos de cadeias de substituição).

    const allEntries  = new Map<string, FileEntry>();
    // Remover BOM se presente
    const cleanText   = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
    const lines       = cleanText.split('\n');
    const totalLines  = lines.length;

    let validLines  = 0;
    let parseErrors = 0;
    let duplicates  = 0;

    const PROGRESS_EVERY = 5_000;

    for (let i = 0; i < lines.length; i++) {
      if (i > 0 && i % PROGRESS_EVERY === 0) {
        self.postMessage({
          type          : 'progress',
          linesProcessed: i,
          totalLines,
          phase         : 'parsing',
        });
      }

      const rawLine = lines[i]?.replace(/\r/g, '').trimStart();
      if (!rawLine || !rawLine.startsWith('A;')) continue;
      validLines++;

      const parts = rawLine.split(';');
      if (parts.length < 8) { parseErrors++; continue; }

      const rawSku   = parts[1];
      const rawPubl  = parts[7];
      const rawCodSub = parts.length > 8 ? parts[8] : '';

      if (!rawSku || !rawPubl) { parseErrors++; continue; }

      const sku = normalizeSku(rawSku);
      if (!sku) continue;

      const publCents = parseInt(rawPubl.trim(), 10);
      if (isNaN(publCents) || publCents <= 0) { parseErrors++; continue; }

      const codSubRaw = normalizeSku(rawCodSub);
      const codSub    = codSubRaw.length > 0 ? codSubRaw : null;

      if (allEntries.has(sku)) duplicates++;
      allEntries.set(sku, { publCents, codSub }); // último vence
    }

    // Progresso: fim do parse
    self.postMessage({
      type          : 'progress',
      linesProcessed: totalLines,
      totalLines,
      phase         : 'resolving',
    });

    // ── Passo 2: Resolver preços para os SKUs do site ─────────────────────────

    const matchedItems  : PriceItem[] = [];
    const missingSkus   : string[]    = [];
    let substitutedCount = 0;

    for (const sku of siteSkuSet) {
      const resolved = resolveChain(sku, allEntries);

      if (!resolved) {
        missingSkus.push(sku);
        continue;
      }

      const { publCents, resolvedSku } = resolved;

      if (resolvedSku !== sku) substitutedCount++;

      const price        = publCents / 100;
      // 9,9% de desconto → multiplica por 0,901, arredonda em centavos
      const specialCents = Math.round(publCents * 0.901);
      const special_price = specialCents / 100;

      matchedItems.push({ sku, price, special_price, resolvedSku });
    }

    const stats: ParseStats = {
      totalLines,
      validLines,
      parseErrors,
      duplicates,
      substitutedCount,
      matchedCount: matchedItems.length,
      missingCount : missingSkus.length,
    };

    self.postMessage({ type: 'done', matchedItems, missingSkus, stats });

  } catch (err: any) {
    self.postMessage({ type: 'error', message: err?.message ?? String(err) });
  }
};