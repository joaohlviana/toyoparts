import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Upload, Download, AlertTriangle, CheckCircle2, XCircle,
  Loader2, FileText, ChevronDown, ChevronUp, Search,
  ShieldCheck, Eye, ArrowRightLeft, RefreshCw, Terminal,
  Power,
} from 'lucide-react';
import { toast } from 'sonner';
import { projectId } from '../../../../utils/supabase/info';
import { adminFetch } from '../../lib/admin-auth';
import { Button }  from '../../components/base/button';
import { Badge }   from '../../components/base/badge';
import type { PriceItem, ParseStats } from '../../workers/priceUpdateParser';

// ─── Config ──────────────────────────────────────────────────────────────────

const API = `https://${projectId}.supabase.co/functions/v1/make-server-1d6e33e0`;
// Headers are injected automatically by adminFetch()

const VERIFY_BATCH = 2000;  // items per verify request

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase =
  | 'idle'
  | 'loading-skus'
  | 'parsing'
  | 'resolving'
  | 'ready'
  | 'verifying'
  | 'done'
  | 'error';

interface LogEntry {
  id   : number;
  level: 'info' | 'ok' | 'warn' | 'error';
  msg  : string;
  ts   : string;
}

interface MismatchItem {
  sku              : string;
  expectedPrice    : number;
  expectedSpecial  : number;
  meiliPrice       : number | null;
  meiliSpecial     : number | null;
  source           : string;
  priceDiff        : number | null;
  specialDiff      : number | null;
}

interface VerifyResult {
  checked      : number;
  ok           : number;
  mismatches   : MismatchItem[];
  notInMeili   : number;
  elapsed      : number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function yieldToBrowser() { return new Promise<void>(r => setTimeout(r, 0)); }

function fmtPrice(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function tsNow() {
  return new Date().toLocaleTimeString('pt-BR', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function exportCSV(rows: string[], filename: string) {
  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color = '' }: {
  label: string; value: string | number; sub?: string; color?: string;
}) {
  return (
    <div className="bg-white dark:bg-[#111] border border-black/[0.06] dark:border-white/10 rounded-xl p-4">
      <p className="text-[10px] font-bold text-[#86868b] uppercase tracking-widest mb-1">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${color || 'text-[#1d1d1f] dark:text-white'}`}>
        {typeof value === 'number' ? value.toLocaleString('pt-BR') : value}
      </p>
      {sub && <p className="text-[11px] text-[#86868b] mt-0.5">{sub}</p>}
    </div>
  );
}

function LogRow({ entry }: { entry: LogEntry }) {
  const colors: Record<string, string> = {
    info : 'text-[#86868b]',
    ok   : 'text-emerald-400',
    warn : 'text-amber-400',
    error: 'text-rose-400',
  };
  const icons: Record<string, string> = {
    info: '\u00b7', ok: '\u2714', warn: '\u26a0', error: '\u2718',
  };
  return (
    <div className={`flex gap-2 text-[11px] font-mono leading-relaxed ${colors[entry.level]}`}>
      <span className="shrink-0 text-[#555]">{entry.ts}</span>
      <span className="shrink-0">{icons[entry.level]}</span>
      <span>{entry.msg}</span>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function PriceVerifyTab() {
  // ── State ──
  const [phase, setPhase]               = useState<Phase>('idle');
  const [fileName, setFileName]         = useState('');
  const [siteSkuCount, setSiteSkuCount] = useState(0);
  const [parseStats, setParseStats]     = useState<ParseStats | null>(null);
  const [parseProgress, setParseProgress] = useState(0);

  // Verify progress
  const [verifyProgress, setVerifyProgress] = useState(0);

  // Logs
  const [logs, setLogs]     = useState<LogEntry[]>([]);
  const logIdRef            = useRef(0);

  // Data refs
  const siteSkusRef         = useRef<string[]>([]);
  const skuInfoRef          = useRef<Record<string, { active: boolean; inStock: boolean }>>({});
  const matchedItemsRef     = useRef<PriceItem[]>([]);
  const missingActiveRef    = useRef<string[]>([]);
  const fileInputRef        = useRef<HTMLInputElement>(null);
  const logEndRef           = useRef<HTMLDivElement>(null);

  // Results
  const [verifyResult, setVerifyResult]     = useState<VerifyResult | null>(null);
  const [showMismatches, setShowMismatches] = useState(false);
  const [showMissing, setShowMissing]       = useState(false);
  const [showOk, setShowOk]                 = useState(false);

  // UI
  const [isDragging, setIsDragging] = useState(false);

  // Deactivation state
  const [deactConfirm, setDeactConfirm]       = useState(false);
  const [deactRunning, setDeactRunning]        = useState(false);
  const [deactResult, setDeactResult]          = useState<{
    total: number; deactivated: number; failed: number;
    failedItems: Array<{ sku: string; error: string }>;
  } | null>(null);

  // ── Logging ──
  const addLog = useCallback((level: LogEntry['level'], msg: string) => {
    setLogs(prev => {
      const entry: LogEntry = { id: ++logIdRef.current, level, msg, ts: tsNow() };
      const next = [...prev, entry];
      return next.length > 500 ? next.slice(-500) : next;
    });
  }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // ── Step 1: Load site SKUs ──
  const loadSiteSkus = useCallback(async () => {
    setPhase('loading-skus');
    addLog('info', 'Carregando SKUs do catalogo (Meilisearch)...');
    try {
      const res  = await adminFetch(`${API}/admin/price-update/site-skus`);
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
      siteSkusRef.current = data.skus ?? [];
      skuInfoRef.current  = data.skuInfo ?? {};
      setSiteSkuCount(data.count ?? 0);
      addLog('ok', `${data.count.toLocaleString('pt-BR')} SKUs carregados${data.fromCache ? ' (cache)' : ''}`);
      return true;
    } catch (err: any) {
      addLog('error', `Falha ao carregar SKUs: ${err.message}`);
      setPhase('error');
      toast.error('Falha ao carregar SKUs do site');
      return false;
    }
  }, [addLog]);

  // ── Step 2: Parse file ──
  const parseFile = useCallback(async (file: File) => {
    setFileName(file.name);
    setPhase('loading-skus');
    setParseProgress(0);

    const ok = await loadSiteSkus();
    if (!ok) return;

    addLog('info', `Lendo arquivo: ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)`);
    setPhase('parsing');

    try {
      // ── Ler arquivo com detecção automática de encoding ────────────────────
      const rawBuf = await file.arrayBuffer();
      const bytes = new Uint8Array(rawBuf);

      let text: string;
      let usedEncoding = 'utf-8';

      // 1) Detectar BOM para identificar encoding
      if (bytes[0] === 0xFF && bytes[1] === 0xFE) {
        text = new TextDecoder('utf-16le').decode(rawBuf);
        usedEncoding = 'utf-16le (BOM)';
      } else if (bytes[0] === 0xFE && bytes[1] === 0xFF) {
        text = new TextDecoder('utf-16be').decode(rawBuf);
        usedEncoding = 'utf-16be (BOM)';
      } else if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
        text = new TextDecoder('utf-8').decode(rawBuf);
        text = text.slice(1);
        usedEncoding = 'utf-8 (BOM)';
      } else {
        // 2) Sem BOM — detectar null bytes (indica UTF-16 sem BOM)
        let nullCount = 0;
        const checkLen = Math.min(bytes.length, 1000);
        for (let b = 0; b < checkLen; b++) {
          if (bytes[b] === 0x00) nullCount++;
        }

        if (nullCount / checkLen > 0.2) {
          text = new TextDecoder('utf-16le').decode(rawBuf);
          usedEncoding = 'utf-16le (detectado)';
          if ((text.match(/\uFFFD/g) || []).length > 50) {
            text = new TextDecoder('utf-16be').decode(rawBuf);
            usedEncoding = 'utf-16be (fallback)';
          }
        } else {
          // 3) UTF-8 com fallback para Latin-1
          text = new TextDecoder('utf-8').decode(rawBuf);
          if ((text.match(/\uFFFD/g) || []).length > 10) {
            text = new TextDecoder('iso-8859-1').decode(rawBuf);
            usedEncoding = 'iso-8859-1 (fallback)';
          }
        }
      }

      // Remover BOM residual
      if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
      // Strip null bytes (safety net)
      if (text.includes('\0')) {
        text = text.replace(/\0/g, '');
        usedEncoding += ' +strip-nulls';
      }

      addLog('info', `Encoding: ${usedEncoding} · ${(file.size / 1024).toFixed(0)} KB`);

      const lines = text.split('\n');
      const totalLines = lines.length;
      addLog('info', `${totalLines.toLocaleString('pt-BR')} linhas encontradas - iniciando parse...`);

      // ── Diagnóstico: primeiras linhas ──────────────────────────────────────
      const sampleLines = lines.slice(0, 3).map((l, i) => {
        const clean = l.replace(/\r/g, '').slice(0, 80);
        const hex = clean.slice(0, 10).split('').map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join(' ');
        return `L${i}: "${clean}" [${hex}]`;
      });
      addLog('info', `[DIAG] Primeiras linhas:\n${sampleLines.join('\n')}`);

      // Passo 1: Construir mapa completo
      const allEntries = new Map<string, { publCents: number; codSub: string | null }>();
      let validLines  = 0;
      let parseErrors = 0;
      let duplicates  = 0;
      const CHUNK = 5_000;

      for (let i = 0; i < lines.length; i++) {
        if (i > 0 && i % CHUNK === 0) {
          setParseProgress(Math.round((i / totalLines) * 100));
          await yieldToBrowser();
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

        const sku = rawSku.trim().toUpperCase().replace(/\s+/g, '');
        if (!sku) continue;

        const publCents = parseInt(rawPubl.trim(), 10);
        if (isNaN(publCents) || publCents <= 0) { parseErrors++; continue; }

        const codSubRaw = rawCodSub.trim().toUpperCase().replace(/\s+/g, '');
        const codSub    = codSubRaw.length > 0 ? codSubRaw : null;

        if (allEntries.has(sku)) duplicates++;
        allEntries.set(sku, { publCents, codSub });
      }

      // Diagnóstico se 0 linhas válidas
      if (validLines === 0 && totalLines > 10) {
        const prefixCount = new Map<string, number>();
        for (const line of lines.slice(0, 200)) {
          const pfx = line.replace(/\r/g, '').trimStart().slice(0, 3);
          if (pfx) prefixCount.set(pfx, (prefixCount.get(pfx) ?? 0) + 1);
        }
        const top = [...prefixCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
          .map(([p, c]) => `"${p}"=${c}`).join(' | ');
        addLog('error', `⚠ ZERO linhas válidas (esperava "A;..."). Prefixos mais comuns: ${top}`);
      }

      setParseProgress(100);

      // Passo 2: Resolver cadeias de substituicao
      setPhase('resolving');
      await yieldToBrowser();

      function resolveChain(
        sku: string,
        depth = 0,
      ): { publCents: number; resolvedSku: string } | null {
        if (depth > 20) return null;
        const entry = allEntries.get(sku);
        if (!entry) return null;
        if (entry.codSub && allEntries.has(entry.codSub)) {
          const next = resolveChain(entry.codSub, depth + 1);
          if (next) return next;
        }
        return { publCents: entry.publCents, resolvedSku: sku };
      }

      const siteSkuSet       = new Set<string>(siteSkusRef.current);
      const matchedItems : Array<{ sku: string; price: number; special_price: number; resolvedSku: string }> = [];
      const missingSkus  : string[] = [];
      const missingActive: string[] = [];
      let missingIgnored  = 0;
      let substitutedCount = 0;

      const info = skuInfoRef.current;

      for (const sku of siteSkuSet) {
        const resolved = resolveChain(sku);
        if (!resolved) {
          missingSkus.push(sku);
          const meta = info[sku];
          if (meta && meta.active && meta.inStock) {
            missingActive.push(sku);
          } else {
            missingIgnored++;
          }
          continue;
        }

        const { publCents, resolvedSku } = resolved;
        if (resolvedSku !== sku) substitutedCount++;

        const price         = publCents / 100;
        const special_price = Math.round(publCents * 0.901) / 100;
        matchedItems.push({ sku, price, special_price, resolvedSku });
      }

      matchedItemsRef.current  = matchedItems;
      missingActiveRef.current = missingActive;

      const stats: ParseStats = {
        totalLines,
        validLines,
        parseErrors,
        duplicates,
        substitutedCount,
        matchedCount  : matchedItems.length,
        missingCount  : missingActive.length,
        missingIgnored,
        missingTotal  : missingSkus.length,
      };

      setParseStats(stats);

      addLog('ok',  `Parse concluido: ${validLines.toLocaleString('pt-BR')} linhas validas`);
      addLog('ok',  `Matched: ${matchedItems.length.toLocaleString('pt-BR')} SKUs com preco | Faltando: ${missingActive.length.toLocaleString('pt-BR')} ativos sem preco`);
      if (missingIgnored > 0) addLog('info', `  ${missingIgnored.toLocaleString('pt-BR')} SKUs sem preco ignorados (inativos ou sem estoque)`);
      if (substitutedCount > 0) addLog('info', `  ${substitutedCount.toLocaleString('pt-BR')} SKUs resolvidos via CodSubstitutivo`);
      if (duplicates   > 0) addLog('warn', `${duplicates.toLocaleString('pt-BR')} SKUs duplicados no arquivo`);
      if (parseErrors  > 0) addLog('warn', `${parseErrors.toLocaleString('pt-BR')} linhas com erro de formato`);

      setPhase('ready');
    } catch (err: any) {
      addLog('error', `Falha no parse: ${err.message}`);
      setPhase('error');
      toast.error('Erro ao processar o arquivo');
    }
  }, [addLog, loadSiteSkus]);

  // ── Drop zone handlers ──
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) parseFile(file);
  }, [parseFile]);

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
  }, [parseFile]);

  // ── Step 3: Verify all prices ──
  const runVerify = useCallback(async () => {
    const items = matchedItemsRef.current;
    if (items.length === 0) return;

    setPhase('verifying');
    setVerifyProgress(0);
    setVerifyResult(null);

    const t0 = performance.now();
    addLog('info', `Verificando ${items.length.toLocaleString('pt-BR')} precos no Meilisearch...`);

    try {
      // Send all at once (backend paginates Meili internally)
      const res = await adminFetch(`${API}/admin/price-update/verify-prices`, {
        method: 'POST',
        body: JSON.stringify({
          items: items.map(it => ({
            sku: it.sku,
            expectedPrice: it.price,
            expectedSpecialPrice: it.special_price,
          })),
          sampleMagento: 0,
        }),
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const elapsed = Math.round(performance.now() - t0);

      // Separate real mismatches from not_in_meili
      const realMismatches = (data.mismatches ?? []).filter((m: any) => m.source !== 'not_in_meili');
      const notInMeiliItems = (data.mismatches ?? []).filter((m: any) => m.source === 'not_in_meili');

      const result: VerifyResult = {
        checked    : data.checked ?? 0,
        ok         : data.ok ?? 0,
        mismatches : realMismatches,
        notInMeili : data.notInMeili ?? notInMeiliItems.length,
        elapsed,
      };

      setVerifyResult(result);
      setVerifyProgress(100);

      if (realMismatches.length === 0) {
        addLog('ok', `Verificacao OK! ${result.ok.toLocaleString('pt-BR')} precos corretos em ${(elapsed / 1000).toFixed(1)}s`);
        if (result.notInMeili > 0) {
          addLog('warn', `${result.notInMeili} SKUs nao encontrados no Meilisearch (podem estar inativos ou pendentes de indexacao)`);
        }
        toast.success('Todos os precos conferem no Meilisearch!');
      } else {
        addLog('warn', `${realMismatches.length} divergencias encontradas de ${result.checked} verificados em ${(elapsed / 1000).toFixed(1)}s`);
        if (result.notInMeili > 0) {
          addLog('warn', `${result.notInMeili} SKUs ausentes no Meilisearch`);
        }
        toast.warning(`${realMismatches.length} precos divergentes encontrados`);
      }

      setPhase('done');
    } catch (err: any) {
      addLog('error', `Falha na verificacao: ${err.message}`);
      setPhase('error');
      toast.error('Erro ao verificar precos');
    }
  }, [addLog]);

  // ── Exports ──
  const exportMismatches = useCallback(() => {
    if (!verifyResult?.mismatches?.length) return;
    const rows = ['sku,preco_esperado,special_esperado,preco_meili,special_meili,diff_preco,diff_special,tipo'];
    for (const m of verifyResult.mismatches) {
      rows.push(
        `${m.sku},${m.expectedPrice},${m.expectedSpecial},${m.meiliPrice ?? ''},${m.meiliSpecial ?? ''},${m.priceDiff != null ? m.priceDiff.toFixed(2) : ''},${m.specialDiff != null ? m.specialDiff.toFixed(2) : ''},${m.source}`
      );
    }
    exportCSV(rows, `verificacao-divergencias-${Date.now()}.csv`);
  }, [verifyResult]);

  const exportFullReport = useCallback(() => {
    if (!verifyResult) return;
    const items = matchedItemsRef.current;
    const mismatchSkuSet = new Set(verifyResult.mismatches.map(m => m.sku));
    const rows = ['sku,preco_esperado,special_esperado,preco_meili,special_meili,status,diff_preco,diff_special'];

    // All items — correct + mismatches
    for (const item of items) {
      const mismatch = verifyResult.mismatches.find(m => m.sku === item.sku);
      if (mismatch) {
        rows.push(
          `${item.sku},${item.price},${item.special_price},${mismatch.meiliPrice ?? ''},${mismatch.meiliSpecial ?? ''},DIVERGE,${mismatch.priceDiff != null ? mismatch.priceDiff.toFixed(2) : ''},${mismatch.specialDiff != null ? mismatch.specialDiff.toFixed(2) : ''}`
        );
      } else {
        rows.push(
          `${item.sku},${item.price},${item.special_price},,,OK,,`
        );
      }
    }
    exportCSV(rows, `verificacao-completa-${Date.now()}.csv`);
  }, [verifyResult]);

  const exportMissing = useCallback(() => {
    const rows = ['sku', ...missingActiveRef.current];
    exportCSV(rows, `skus-ativos-sem-preco-${Date.now()}.csv`);
  }, []);

  // ── Deactivate missing SKUs ──
  const deactivateMissing = useCallback(async (retrySkus?: string[]) => {
    const skus = retrySkus ?? missingActiveRef.current;
    if (skus.length === 0) return;

    const isRetry = !!retrySkus;
    setDeactRunning(true);
    if (!isRetry) setDeactResult(null);

    addLog('info', isRetry
      ? `🔄 Retry: re-tentando ${skus.length} SKUs que falharam por deadlock (delay 8s entre lotes)...`
      : `Desativando ${skus.length} SKUs no Magento (status=2) + Meilisearch...`
    );

    const BATCH_SIZE = isRetry ? 3 : 5; // Lotes menores para evitar deadlocks (3 no retry, 5 normal)
    const BATCH_DELAY = isRetry ? 15000 : 5000; // Delay entre lotes: 15s no retry, 5s normal
    let totalDeactivated = 0;
    let totalFailed      = 0;
    const allFailedItems: Array<{ sku: string; error: string }> = [];

    try {
      const totalBatches = Math.ceil(skus.length / BATCH_SIZE);

      for (let b = 0; b < totalBatches; b++) {
        // Delay entre lotes (não antes do primeiro)
        if (b > 0) await new Promise(r => setTimeout(r, BATCH_DELAY));

        const chunk = skus.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
        addLog('info', `Lote ${b + 1}/${totalBatches}: ${chunk.length} SKUs...`);

        const res = await adminFetch(`${API}/admin/price-update/deactivate-skus`, {
          method: 'POST',
          body: JSON.stringify({ skus: chunk, retryMode: isRetry }),
        });
        const data = await res.json();
        if (data.error) throw new Error(`Lote ${b + 1}: ${data.error}`);

        totalDeactivated += data.deactivated ?? 0;
        totalFailed      += data.failed ?? 0;
        if (data.failedItems?.length) allFailedItems.push(...data.failedItems);

        addLog(
          data.failed > 0 ? 'warn' : 'ok',
          `Lote ${b + 1}/${totalBatches}: ${data.deactivated ?? 0} ok, ${data.failed ?? 0} falhas`
        );

        if (data.meiliTaskUid) {
          addLog('info', `  Meili task uid=${data.meiliTaskUid}`);
        }
      }

      // Merge com resultado anterior no caso de retry
      const prevResult = isRetry ? deactResult : null;
      const result = {
        total       : (prevResult?.total ?? 0) || skus.length,
        deactivated : (prevResult?.deactivated ?? 0) + totalDeactivated,
        failed      : totalFailed, // só as falhas atuais restantes
        failedItems : allFailedItems,
      };
      setDeactResult(result);

      if (totalDeactivated > 0) {
        addLog('ok', `${isRetry ? 'Retry: ' : ''}${totalDeactivated} produtos desativados com sucesso`);
      }
      if (totalFailed > 0) {
        const deadlockFails = allFailedItems.filter(f => /deadlock|bloqueio/i.test(f.error));
        addLog('warn', `${totalFailed} falharam${deadlockFails.length > 0 ? ` (${deadlockFails.length} por deadlock — use "Retry" para re-tentar)` : ''}`);
        for (const f of allFailedItems.slice(0, 5)) {
          addLog('warn', `  ${f.sku}: ${f.error}`);
        }
        if (allFailedItems.length > 5) {
          addLog('warn', `  ...e mais ${allFailedItems.length - 5}`);
        }
      }

      if (totalFailed === 0) {
        toast.success(`${totalDeactivated} produtos desativados com sucesso!`);
      } else {
        toast.warning(`${totalDeactivated} desativados, ${totalFailed} falharam`);
      }
    } catch (err: any) {
      addLog('error', `Falha ao desativar: ${err.message}`);
      toast.error('Erro ao desativar produtos');
      if (totalDeactivated > 0 || totalFailed > 0) {
        const prevResult = isRetry ? deactResult : null;
        setDeactResult({
          total       : (prevResult?.total ?? 0) || skus.length,
          deactivated : (prevResult?.deactivated ?? 0) + totalDeactivated,
          failed      : totalFailed,
          failedItems : allFailedItems,
        });
      }
    }
    setDeactRunning(false);
    setDeactConfirm(false);
  }, [addLog, deactResult]);

  // ── Reset ──
  const reset = useCallback(() => {
    siteSkusRef.current       = [];
    skuInfoRef.current        = {};
    matchedItemsRef.current   = [];
    missingActiveRef.current  = [];
    setPhase('idle');
    setFileName('');
    setSiteSkuCount(0);
    setParseStats(null);
    setParseProgress(0);
    setVerifyProgress(0);
    setVerifyResult(null);
    setShowMismatches(false);
    setShowMissing(false);
    setShowOk(false);
    setLogs([]);
  }, []);

  // ── Render ──
  return (
    <div className="space-y-8">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[#86868b] text-sm mt-1">
            Carregue a tabela de precos da distribuidora para verificar se os precos no Meilisearch
            estao corretos, <strong>sem alterar nada</strong>. Apenas leitura.
          </p>
        </div>
        {phase !== 'idle' && (
          <Button variant="outline" size="sm" className="shrink-0 gap-2" onClick={reset}>
            <RefreshCw className="w-3.5 h-3.5" /> Reiniciar
          </Button>
        )}
      </div>

      {/* ── Upload zone ── */}
      {phase === 'idle' && (
        <div
          onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`
            border-2 border-dashed rounded-2xl p-12 flex flex-col items-center gap-4 cursor-pointer
            transition-all duration-200
            ${isDragging
              ? 'border-cyan-500 bg-cyan-500/5 scale-[1.01]'
              : 'border-black/[0.1] dark:border-white/10 hover:border-cyan-400 hover:bg-cyan-500/3 bg-white dark:bg-[#111]'}
          `}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.csv,.prn"
            className="hidden"
            onChange={onFileChange}
          />
          <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 flex items-center justify-center">
            <ShieldCheck className="w-7 h-7 text-cyan-500" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-[#1d1d1f] dark:text-white">
              Arraste o arquivo de precos aqui para verificar
            </p>
            <p className="text-[#86868b] text-xs mt-1">
              ou clique para selecionar &middot; .txt &middot; .csv &middot; delimitado por ponto-e-virgula
            </p>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-cyan-600 bg-cyan-500/10 px-3 py-1.5 rounded-full font-bold">
            <Eye className="w-3 h-3" /> SOMENTE LEITURA &mdash; nenhum preco sera alterado
          </div>
        </div>
      )}

      {/* ── Loading SKUs ── */}
      {phase === 'loading-skus' && (
        <div className="bg-white dark:bg-[#111] border border-black/[0.06] dark:border-white/10 rounded-2xl p-8 flex items-center gap-4">
          <Loader2 className="w-6 h-6 text-cyan-500 animate-spin shrink-0" />
          <div>
            <p className="text-sm font-semibold text-[#1d1d1f] dark:text-white">Carregando catalogo do site...</p>
            <p className="text-[#86868b] text-xs mt-0.5">Buscando SKUs do Meilisearch para cruzamento</p>
          </div>
        </div>
      )}

      {/* ── Parsing / Resolving ── */}
      {(phase === 'parsing' || phase === 'resolving') && (
        <div className="bg-white dark:bg-[#111] border border-black/[0.06] dark:border-white/10 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-3">
            <Loader2 className={`w-5 h-5 animate-spin shrink-0 ${phase === 'resolving' ? 'text-cyan-500' : 'text-amber-500'}`} />
            <div className="flex-1">
              <p className="text-sm font-semibold text-[#1d1d1f] dark:text-white">
                {phase === 'resolving'
                  ? 'Resolvendo cadeias de substituicao...'
                  : <>Analisando arquivo: <span className="font-normal text-[#86868b]">{fileName}</span></>
                }
              </p>
            </div>
            {phase === 'parsing' && (
              <span className="text-lg font-bold tabular-nums text-amber-500">{parseProgress}%</span>
            )}
          </div>
          <div className="h-2 bg-black/[0.05] dark:bg-white/10 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${phase === 'resolving' ? 'bg-cyan-400 animate-pulse' : 'bg-amber-400'}`}
              style={{ width: phase === 'resolving' ? '100%' : `${parseProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* ── Summary stats ── */}
      {parseStats && phase !== 'idle' && phase !== 'loading-skus' && phase !== 'parsing' && phase !== 'resolving' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="SKUs no site" value={siteSkuCount} sub="catalogo normalizado" />
            <StatCard label="Linhas no arquivo" value={parseStats.validLines}
              sub={`${parseStats.totalLines.toLocaleString('pt-BR')} linhas totais`} />
            <StatCard label="SKUs com preco" value={parseStats.matchedCount} color="text-emerald-600"
              sub={parseStats.substitutedCount > 0
                ? `${parseStats.substitutedCount.toLocaleString('pt-BR')} via substituicao`
                : 'prontos para verificacao'} />
            <StatCard label="SKUs sem preco" value={parseStats.missingCount}
              color={parseStats.missingCount > 0 ? 'text-amber-500' : 'text-[#1d1d1f] dark:text-white'}
              sub="apenas ativos com estoque" />
          </div>

          {/* Missing panel */}
          {parseStats.missingCount > 0 && (
            <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-amber-500/5 transition-colors"
                onClick={() => setShowMissing(s => !s)}
              >
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                  <span className="text-sm font-semibold text-[#1d1d1f] dark:text-white">
                    {parseStats.missingCount.toLocaleString('pt-BR')} SKUs ativos sem preco na tabela
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    role="button"
                    tabIndex={0}
                    className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md border text-[11px] font-bold border-amber-500/30 text-amber-600 hover:bg-amber-500/10 cursor-pointer select-none"
                    onClick={e => { e.stopPropagation(); exportMissing(); }}
                    onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); exportMissing(); } }}
                  >
                    <Download className="w-3 h-3" /> CSV
                  </span>
                  {showMissing ? <ChevronUp className="w-4 h-4 text-[#86868b]" /> : <ChevronDown className="w-4 h-4 text-[#86868b]" />}
                </div>
              </button>
              {showMissing && (
                <div className="px-4 pb-4 max-h-52 overflow-y-auto">
                  <div className="flex flex-wrap gap-1.5">
                    {missingActiveRef.current.slice(0, 200).map(sku => (
                      <code key={sku} className="text-[10px] bg-amber-500/10 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded font-mono">
                        {sku}
                      </code>
                    ))}
                    {missingActiveRef.current.length > 200 && (
                      <span className="text-[11px] text-[#86868b] px-2 py-0.5">
                        +{(missingActiveRef.current.length - 200).toLocaleString('pt-BR')} mais...
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Deactivation result */}
              {deactResult && (
                <div className={`mx-4 mb-3 rounded-lg p-3 text-xs ${
                  deactResult.failed === 0
                    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                    : 'bg-rose-500/10 text-rose-700 dark:text-rose-300'
                }`}>
                  <p className="font-bold">
                    {deactResult.failed === 0
                      ? `${deactResult.deactivated} produtos desativados com sucesso!`
                      : `${deactResult.deactivated} desativados, ${deactResult.failed} falharam`
                    }
                  </p>
                  {deactResult.failedItems.length > 0 && (
                    <div className="mt-1.5 space-y-0.5">
                      {deactResult.failedItems.slice(0, 5).map((f, i) => (
                        <p key={i} className="font-mono text-[10px] opacity-80">{f.sku}: {f.error}</p>
                      ))}
                      {deactResult.failedItems.length > 5 && (
                        <p className="opacity-60">...e mais {deactResult.failedItems.length - 5}</p>
                      )}
                    </div>
                  )}
                  {/* Retry button for deadlock failures */}
                  {!deactRunning && deactResult.failedItems.length > 0 && (
                    <div className="mt-3 flex items-center gap-3 pt-2 border-t border-rose-500/10">
                      <Button
                        size="sm"
                        className="gap-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          const failedSkus = deactResult.failedItems.map(f => f.sku);
                          deactivateMissing(failedSkus);
                        }}
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Retry {deactResult.failedItems.length} falhas (modo conservador)
                      </Button>
                      <span className="text-[10px] opacity-60">
                        Lotes de 3, delay 15s entre lotes, 5s entre SKUs, 5 retries com backoff ate 90s
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Running indicator */}
              {deactRunning && (
                <div className="flex items-center gap-2 text-xs text-amber-600 px-4 pb-3">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span className="font-semibold">Desativando produtos no Magento + Meilisearch...</span>
                </div>
              )}

              {/* Confirmation flow */}
              {!deactRunning && !deactResult && !deactConfirm && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 border-rose-500/30 text-rose-600 hover:bg-rose-500/5 text-xs"
                  onClick={(e) => { e.stopPropagation(); setDeactConfirm(true); }}
                >
                  <Power className="w-3.5 h-3.5" />
                  Desativar todos ({parseStats.missingCount.toLocaleString('pt-BR')}) no Magento
                </Button>
              )}

              {deactConfirm && !deactRunning && !deactResult && (
                <div className="bg-rose-500/5 border border-rose-500/20 rounded-lg p-3 space-y-2">
                  <p className="text-xs text-rose-600 dark:text-rose-400 font-semibold">
                    Tem certeza? Isso vai desativar {parseStats.missingCount.toLocaleString('pt-BR')} produtos
                    no Magento (status=2) e marcar como inativos no Meilisearch.
                  </p>
                  <p className="text-[10px] text-[#86868b]">
                    Os produtos não aparecerão mais na loja. Esta ação pode ser revertida manualmente no Magento.
                  </p>
                  <div className="flex gap-2 pt-1">
                    <Button
                      size="sm"
                      className="gap-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs"
                      onClick={(e) => { e.stopPropagation(); deactivateMissing(); }}
                    >
                      <Power className="w-3.5 h-3.5" />
                      Sim, desativar {parseStats.missingCount.toLocaleString('pt-BR')} produtos
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      onClick={(e) => { e.stopPropagation(); setDeactConfirm(false); }}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Ready — Verify button ── */}
      {phase === 'ready' && (
        <div className="flex items-center gap-3">
          <Button
            className="gap-2 bg-cyan-600 hover:bg-cyan-700 text-white font-bold"
            onClick={runVerify}
            disabled={!parseStats?.matchedCount}
          >
            <ShieldCheck className="w-4 h-4" />
            Verificar {parseStats?.matchedCount.toLocaleString('pt-BR')} precos no Meilisearch
          </Button>
          <p className="text-xs text-[#86868b]">
            Compara preco esperado (tabela) vs preco atual (Meilisearch) &mdash; somente leitura
          </p>
        </div>
      )}

      {/* ── Verifying progress ── */}
      {phase === 'verifying' && (
        <div className="bg-white dark:bg-[#111] border border-black/[0.06] dark:border-white/10 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-cyan-500 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-[#1d1d1f] dark:text-white">
                Verificando precos no Meilisearch...
              </p>
              <p className="text-[#86868b] text-xs mt-0.5">
                Paginando todos os documentos e comparando com a tabela de precos
              </p>
            </div>
            <span className="text-[10px] font-bold text-cyan-500 bg-cyan-500/10 px-2.5 py-1 rounded-full animate-pulse">
              Verificando
            </span>
          </div>
          <div className="h-2 bg-black/[0.05] dark:bg-white/10 rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-cyan-400 animate-pulse w-full" />
          </div>
        </div>
      )}

      {/* ── Results ── */}
      {phase === 'done' && verifyResult && (
        <div className="space-y-4">
          {/* Summary card */}
          <div className={`rounded-2xl p-5 border ${
            verifyResult.mismatches.length === 0
              ? 'bg-emerald-500/5 border-emerald-500/20'
              : 'bg-orange-500/5 border-orange-500/20'
          }`}>
            <div className="flex items-center gap-3 mb-4">
              {verifyResult.mismatches.length === 0
                ? <CheckCircle2 className="w-7 h-7 text-emerald-500 shrink-0" />
                : <AlertTriangle className="w-7 h-7 text-orange-500 shrink-0" />
              }
              <div className="flex-1">
                <p className="text-lg font-bold text-[#1d1d1f] dark:text-white">
                  {verifyResult.mismatches.length === 0
                    ? 'Todos os precos conferem!'
                    : `${verifyResult.mismatches.length.toLocaleString('pt-BR')} precos divergentes`
                  }
                </p>
                <p className="text-xs text-[#86868b] mt-0.5">
                  Verificacao concluida em {(verifyResult.elapsed / 1000).toFixed(1)}s
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={exportFullReport}>
                  <Download className="w-3 h-3" /> Relatorio completo
                </Button>
                {verifyResult.mismatches.length > 0 && (
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs border-orange-500/30 text-orange-600 hover:bg-orange-500/5" onClick={exportMismatches}>
                    <Download className="w-3 h-3" /> Divergencias CSV
                  </Button>
                )}
              </div>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="Verificados" value={verifyResult.checked} color="text-cyan-600" />
              <StatCard label="Corretos" value={verifyResult.ok} color="text-emerald-600"
                sub={verifyResult.checked > 0 ? `${Math.round((verifyResult.ok / verifyResult.checked) * 100)}% do total` : undefined} />
              <StatCard label="Divergentes" value={verifyResult.mismatches.length}
                color={verifyResult.mismatches.length > 0 ? 'text-orange-500' : 'text-emerald-600'}
                sub={verifyResult.mismatches.length > 0 ? 'precos errados no Meili' : 'nenhuma divergencia'} />
              <StatCard label="Ausentes no Meili" value={verifyResult.notInMeili}
                color={verifyResult.notInMeili > 0 ? 'text-amber-500' : 'text-[#1d1d1f] dark:text-white'}
                sub={verifyResult.notInMeili > 0 ? 'SKUs nao indexados' : 'todos indexados'} />
            </div>
          </div>

          {/* Accuracy bar */}
          {verifyResult.checked > 0 && (
            <div className="bg-white dark:bg-[#111] border border-black/[0.06] dark:border-white/10 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-[#1d1d1f] dark:text-white">Acuracia dos precos</span>
                <span className="font-bold tabular-nums text-emerald-600">
                  {Math.round((verifyResult.ok / verifyResult.checked) * 10000) / 100}%
                </span>
              </div>
              <div className="h-3 bg-black/[0.05] dark:bg-white/10 rounded-full overflow-hidden flex">
                {verifyResult.ok > 0 && (
                  <div
                    className="h-full bg-emerald-500 transition-all duration-700"
                    style={{ width: `${(verifyResult.ok / verifyResult.checked) * 100}%` }}
                    title={`${verifyResult.ok} corretos`}
                  />
                )}
                {verifyResult.mismatches.length > 0 && (
                  <div
                    className="h-full bg-orange-500 transition-all duration-700"
                    style={{ width: `${(verifyResult.mismatches.length / verifyResult.checked) * 100}%` }}
                    title={`${verifyResult.mismatches.length} divergentes`}
                  />
                )}
                {verifyResult.notInMeili > 0 && (
                  <div
                    className="h-full bg-gray-400 transition-all duration-700"
                    style={{ width: `${(verifyResult.notInMeili / verifyResult.checked) * 100}%` }}
                    title={`${verifyResult.notInMeili} ausentes`}
                  />
                )}
              </div>
              <div className="flex gap-4 text-[10px] text-[#86868b]">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Corretos</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500" /> Divergentes</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-400" /> Ausentes</span>
              </div>
            </div>
          )}

          {/* Mismatches detail */}
          {verifyResult.mismatches.length > 0 && (
            <div className="bg-orange-500/5 border border-orange-500/20 rounded-xl overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-orange-500/5 transition-colors"
                onClick={() => setShowMismatches(s => !s)}
              >
                <div className="flex items-center gap-2">
                  <Search className="w-4 h-4 text-orange-500 shrink-0" />
                  <span className="text-sm font-semibold text-[#1d1d1f] dark:text-white">
                    {verifyResult.mismatches.length.toLocaleString('pt-BR')} precos divergentes
                  </span>
                  <span className="text-[10px] text-[#86868b] bg-black/[0.04] px-2 py-0.5 rounded-full">
                    Meilisearch desatualizado
                  </span>
                </div>
                {showMismatches ? <ChevronUp className="w-4 h-4 text-[#86868b]" /> : <ChevronDown className="w-4 h-4 text-[#86868b]" />}
              </button>
              {showMismatches && (
                <div className="px-4 pb-4 max-h-96 overflow-auto">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="text-left text-[#86868b] border-b border-orange-500/10 sticky top-0 bg-orange-50 dark:bg-[#1a1000]">
                        <th className="pb-1.5 font-bold pr-2">SKU</th>
                        <th className="pb-1.5 font-bold pr-2 text-right">Preco Esperado</th>
                        <th className="pb-1.5 font-bold pr-2 text-right">Special Esperado</th>
                        <th className="pb-1.5 font-bold pr-2 text-right">Preco Meili</th>
                        <th className="pb-1.5 font-bold pr-2 text-right">Special Meili</th>
                        <th className="pb-1.5 font-bold text-right">Diff</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-orange-500/5">
                      {verifyResult.mismatches.slice(0, 200).map((m, i) => (
                        <tr key={`${m.sku}-${i}`}>
                          <td className="py-1 pr-2 font-mono text-orange-600 dark:text-orange-400 whitespace-nowrap">{m.sku}</td>
                          <td className="py-1 pr-2 text-right tabular-nums">{fmtPrice(m.expectedPrice)}</td>
                          <td className="py-1 pr-2 text-right tabular-nums">{fmtPrice(m.expectedSpecial)}</td>
                          <td className={`py-1 pr-2 text-right tabular-nums font-bold ${
                            m.meiliPrice != null && Math.abs(m.meiliPrice - m.expectedPrice) > 0.02
                              ? 'text-rose-500' : 'text-emerald-500'
                          }`}>
                            {m.meiliPrice != null ? fmtPrice(m.meiliPrice) : '\u2014'}
                          </td>
                          <td className={`py-1 pr-2 text-right tabular-nums font-bold ${
                            m.meiliSpecial != null && Math.abs(m.meiliSpecial - m.expectedSpecial) > 0.02
                              ? 'text-rose-500' : m.meiliSpecial != null ? 'text-emerald-500' : 'text-[#86868b]'
                          }`}>
                            {m.meiliSpecial != null ? fmtPrice(m.meiliSpecial) : '\u2014'}
                          </td>
                          <td className="py-1 text-right tabular-nums text-[#86868b]">
                            {m.priceDiff != null ? fmtPrice(m.priceDiff) : '\u2014'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {verifyResult.mismatches.length > 200 && (
                    <p className="text-[11px] text-[#86868b] mt-2 text-center">
                      +{(verifyResult.mismatches.length - 200).toLocaleString('pt-BR')} mais &mdash; exporte o CSV para ver todos
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Error ── */}
      {phase === 'error' && (
        <div className="bg-rose-500/5 border border-rose-500/20 rounded-2xl p-5 flex items-center gap-3">
          <XCircle className="w-6 h-6 text-rose-500 shrink-0" />
          <div>
            <p className="text-sm font-bold text-[#1d1d1f] dark:text-white">Erro na verificacao</p>
            <p className="text-xs text-[#86868b] mt-0.5">Verifique o log abaixo para detalhes</p>
          </div>
          <Button variant="outline" size="sm" className="ml-auto gap-2" onClick={reset}>
            <RefreshCw className="w-3.5 h-3.5" /> Tentar novamente
          </Button>
        </div>
      )}

      {/* ── Log terminal ── */}
      {logs.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <Terminal className="w-4 h-4 text-[#86868b]" />
            <h3 className="text-[11px] font-bold text-[#86868b] uppercase tracking-widest">Log</h3>
            <Badge variant="secondary" className="text-[9px] h-4 bg-black/[0.04] border-none text-[#86868b]">
              {logs.length}
            </Badge>
          </div>
          <div className="bg-[#0d0d0d] border border-black/20 rounded-xl p-4 h-48 overflow-y-auto font-mono">
            <div className="space-y-0.5">
              {logs.map(l => <LogRow key={l.id} entry={l} />)}
            </div>
            <div ref={logEndRef} />
          </div>
        </div>
      )}

      {/* ── Docs ── */}
      {phase === 'idle' && (
        <div className="bg-black/[0.02] dark:bg-white/[0.02] border border-black/[0.06] dark:border-white/10 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#86868b]" />
            <h3 className="text-xs font-bold text-[#86868b] uppercase tracking-widest">Como funciona</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-[#86868b]">
            <div className="space-y-1.5">
              <p><strong className="text-[#1d1d1f] dark:text-white">1. Upload:</strong> Carregue a tabela de precos (mesmo formato da atualizacao)</p>
              <p><strong className="text-[#1d1d1f] dark:text-white">2. Parse:</strong> Cruza SKUs do arquivo com o catalogo do Meilisearch</p>
              <p><strong className="text-[#1d1d1f] dark:text-white">3. Verificacao:</strong> Compara preco esperado vs preco atual no Meili</p>
            </div>
            <div className="space-y-1.5">
              <p><strong className="text-[#1d1d1f] dark:text-white">Preco regular:</strong> $Publ / 100</p>
              <p><strong className="text-[#1d1d1f] dark:text-white">Preco especial:</strong> $Publ x 0,901 (desconto 9,9%)</p>
              <p><strong className="text-[#1d1d1f] dark:text-white">Tolerancia:</strong> R$ 0,02 para arredondamento</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}