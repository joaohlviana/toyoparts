import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Upload, Play, Ban, Download, AlertTriangle,
  CheckCircle2, XCircle, Loader2, FileText, RefreshCw,
  ChevronDown, ChevronUp, Terminal, ArrowRightLeft, RotateCcw,
  Search, Eye, ShieldCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { projectId } from '../../../../utils/supabase/info';
import { adminFetch } from '../../lib/admin-auth';
import { Button }  from '../../components/base/button';
import { Badge }   from '../../components/base/badge';
import type { PriceItem, ParseStats } from '../../workers/priceUpdateParser';
import { PriceVerifyTab } from './PriceVerifyTab';

// ─── Config ──────────────────────────────────────────────────────────────────

const API = `https://${projectId}.supabase.co/functions/v1/make-server-1d6e33e0`;
// Headers are injected automatically by adminFetch()

const CHUNK_SIZE   = 200;
const MAX_RETRIES  = 3;
const BACKOFF_MS   = [1_000, 3_000, 7_000];
const MAX_CONC     = 3;
const MIN_CONC     = 1;
const FAST_THRESH  = 1_800; // ms — se batch < isso, tenta aumentar concorrência
const STAGE_SIZE   = 1000;  // items per stage — checkpoint a cada 1000

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase =
  | 'idle'
  | 'loading-skus'
  | 'parsing'
  | 'resolving'
  | 'ready'
  | 'running'
  | 'stage-waiting'
  | 'stage-verifying'
  | 'stage-paused'
  | 'cancelled'
  | 'done'
  | 'error';

interface LogEntry {
  id   : number;
  level: 'info' | 'ok' | 'warn' | 'error';
  msg  : string;
  ts   : string;
}

interface QueueResult {
  updated  : string[];
  notFound : string[];
  failed   : Array<{ sku: string; error: string }>;
  meiliTaskUid?: number | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number) { return new Promise<void>(r => setTimeout(r, ms)); }
// Yield ao browser para manter UI responsiva (substitui Web Worker)
function yieldToBrowser() { return new Promise<void>(r => setTimeout(r, 0)); }

function jitter(ms: number) { return ms + Math.floor(Math.random() * 400); }

function fmtPrice(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtSecs(s: number) {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
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
    info: '·', ok: '✔', warn: '⚠', error: '✘',
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

export function PriceUpdatePage() {
  // ── Tab state ─────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'update' | 'verify'>('update');

  // ── State ──────────────────────────────────────────────────────────────────
  const [phase, setPhase]               = useState<Phase>('idle');
  const [fileName, setFileName]         = useState('');
  const [siteSkuCount, setSiteSkuCount] = useState(0);
  const [parseStats, setParseStats]     = useState<ParseStats | null>(null);
  const [parseProgress, setParseProgress] = useState(0); // 0-100

  // Queue progress
  const [completedBatches, setCompletedBatches] = useState(0);
  const [totalBatches, setTotalBatches]         = useState(0);
  const [updatedCount, setUpdatedCount]         = useState(0);
  const [notFoundCount, setNotFoundCount]       = useState(0);
  const [failedCount, setFailedCount]           = useState(0);
  const [currentConc, setCurrentConc]           = useState(2);
  const [etaSecs, setEtaSecs]                   = useState<number | null>(null);

  // Logs
  const [logs, setLogs]     = useState<LogEntry[]>([]);
  const logIdRef            = useRef(0);

  // Data refs (mutable, no re-render)
  const siteSkusRef         = useRef<string[]>([]);
  const skuInfoRef          = useRef<Record<string, { active: boolean; inStock: boolean }>>({});
  const matchedItemsRef     = useRef<PriceItem[]>([]);
  const missingSkusRef      = useRef<string[]>([]);    // todos faltantes
  const missingActiveRef    = useRef<string[]>([]);     // apenas ativos com estoque
  const missingIgnoredRef   = useRef<number>(0);        // inativos/sem estoque ignorados
  const failedItemsRef      = useRef<Array<{ sku: string; error: string }>>([]);
  const notFoundItemsRef    = useRef<string[]>([]);       // SKUs that Magento returned as notFound
  const runIdRef            = useRef('');
  const abortRef            = useRef(false);
  const workerRef           = useRef<Worker | null>(null);
  const logEndRef           = useRef<HTMLDivElement>(null);
  const batchTimesRef       = useRef<number[]>([]);
  const concRef             = useRef(2); // live concurrency ref
  const fileInputRef        = useRef<HTMLInputElement>(null);

  // UI toggles
  const [showMissing, setShowMissing] = useState(false);
  const [showFailed, setShowFailed]   = useState(false);
  const [showNotFound, setShowNotFound] = useState(false);
  const [isDragging, setIsDragging]   = useState(false);
  const [isRetrying, setIsRetrying]   = useState(false);

  // Verification state
  const [isVerifying, setIsVerifying]       = useState(false);
  const [verifyResult, setVerifyResult]     = useState<any>(null);
  const [showMismatches, setShowMismatches] = useState(false);
  const [isRetryingAll, setIsRetryingAll]   = useState(false);

  // Stage checkpoint state
  const [currentStage, setCurrentStage]     = useState(0);
  const [totalStages, setTotalStages]       = useState(0);
  const [stageVerifyResult, setStageVerifyResult] = useState<any>(null);
  const stageResolveRef = useRef<((action: 'continue' | 'stop') => void) | null>(null);

  // ── Logging ────────────────────────────────────────────────────────────────
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

  // ── Step 1: Load site SKUs ─────────────────────────────────────────────────
  const loadSiteSkus = useCallback(async () => {
    setPhase('loading-skus');
    addLog('info', 'Carregando SKUs do catálogo (Meilisearch)...');
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

  // ── Step 2: Parse file (inline, com yields periódicos) ────────────────────
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
      addLog('info', `${totalLines.toLocaleString('pt-BR')} linhas encontradas — iniciando parse...`);

      // ── Diagnóstico: primeiras linhas ──────────────────────────────────────
      const sampleLines = lines.slice(0, 3).map((l, i) => {
        const clean = l.replace(/\r/g, '').slice(0, 80);
        const hex = clean.slice(0, 10).split('').map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join(' ');
        return `L${i}: "${clean}" [${hex}]`;
      });
      addLog('info', `[DIAG] Primeiras linhas:\n${sampleLines.join('\n')}`);

      // ── Passo 1: Construir mapa completo do arquivo ─────────────────────────
      const allEntries = new Map<string, { publCents: number; codSub: string | null }>();
      let validLines  = 0;
      let parseErrors = 0;
      let duplicates  = 0;
      const CHUNK = 5_000; // linhas por fatia antes de ceder ao browser

      for (let i = 0; i < lines.length; i++) {
        // Cede ao browser a cada CHUNK linhas para manter UI responsiva
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
        allEntries.set(sku, { publCents, codSub }); // último vence
      }

      // Diagnóstico adicional se 0 linhas válidas
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

      // ── Passo 2: Resolver cadeias de substituição para SKUs do site ─────────
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
      const missingActive: string[] = [];   // ativos com estoque — relatório final
      let missingIgnored  = 0;               // inativos/sem estoque — ignorados
      let substitutedCount = 0;

      const info = skuInfoRef.current;

      for (const sku of siteSkuSet) {
        const resolved = resolveChain(sku);
        if (!resolved) {
          missingSkus.push(sku);
          // Só reporta como "faltante" se o produto é ativo E tem estoque
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

      // ── Finalizar ────────────────────────────────────────────────────────────
      matchedItemsRef.current  = matchedItems;
      missingSkusRef.current   = missingSkus;
      missingActiveRef.current = missingActive;
      missingIgnoredRef.current = missingIgnored;

      const stats = {
        totalLines,
        validLines,
        parseErrors,
        duplicates,
        substitutedCount,
        matchedCount  : matchedItems.length,
        missingCount  : missingActive.length,    // apenas ativos com estoque
        missingIgnored,                          // inativos/sem estoque
        missingTotal  : missingSkus.length,      // total bruto
      };

      setParseStats(stats);
      setTotalBatches(Math.ceil(matchedItems.length / CHUNK_SIZE));

      addLog('ok',  `Parse concluído: ${validLines.toLocaleString('pt-BR')} linhas válidas no arquivo`);
      addLog('ok',  `Matched: ${matchedItems.length.toLocaleString('pt-BR')} SKUs com preço | Faltando: ${missingActive.length.toLocaleString('pt-BR')} ativos sem preço`);
      if (missingIgnored > 0) addLog('info', `↳ ${missingIgnored.toLocaleString('pt-BR')} SKUs sem preço ignorados (inativos ou sem estoque)`);
      if (substitutedCount > 0) addLog('info', `↳ ${substitutedCount.toLocaleString('pt-BR')} SKUs tiveram preço resolvido via cadeia de substituição (CodSubstitutivo)`);
      if (duplicates   > 0) addLog('warn', `${duplicates.toLocaleString('pt-BR')} SKUs duplicados no arquivo (mantido último valor)`);
      if (parseErrors  > 0) addLog('warn', `${parseErrors.toLocaleString('pt-BR')} linhas com erro de formato ignoradas`);

      setPhase('ready');
    } catch (err: any) {
      addLog('error', `Falha no parse: ${err.message}`);
      setPhase('error');
      toast.error('Erro ao processar o arquivo');
    }
  }, [addLog, loadSiteSkus]);

  // ── Drop zone handlers ────────────────────────────────────────────────────
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

  // ── Step 3: Queue runner (stage-based with checkpoints) ─────────────────────
  const runQueue = useCallback(async () => {
    const items = matchedItemsRef.current;

    // Split into stages of STAGE_SIZE (1000)
    const stages: PriceItem[][] = [];
    for (let i = 0; i < items.length; i += STAGE_SIZE) {
      stages.push(items.slice(i, i + STAGE_SIZE));
    }

    // Total batches across all stages
    const allChunks: PriceItem[][] = [];
    for (let i = 0; i < items.length; i += CHUNK_SIZE) {
      allChunks.push(items.slice(i, i + CHUNK_SIZE));
    }
    setTotalBatches(allChunks.length);
    setTotalStages(stages.length);

    // Create run
    const runRes = await adminFetch(`${API}/admin/price-update/run/start`, {
      method: 'POST',
      body: JSON.stringify({
        matchedCount: items.length,
        missingCount: missingSkusRef.current.length,
        totalBatches: allChunks.length,
      }),
    });
    const runData = await runRes.json();
    runIdRef.current = runData.runId;
    addLog('info', `Run criado: ${runData.runId} · ${stages.length} etapas × ${STAGE_SIZE} SKUs · ${allChunks.length} batches total`);

    let globalBatchIdx = 0;
    let localUpdated   = 0;
    let localNotFound  = 0;
    const localFailed: Array<{ sku: string; error: string }> = [];
    const localNotFoundSkus: string[] = [];
    batchTimesRef.current = [];
    abortRef.current = false;
    concRef.current  = 2;
    setCurrentConc(2);

    async function processBatch(idx: number, batch: PriceItem[]): Promise<QueueResult> {
      let lastErr: any;
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        if (abortRef.current) throw new Error('Cancelado pelo usuário');
        try {
          const t0 = performance.now();
          const res = await adminFetch(`${API}/admin/price-update/batch`, {
            method: 'POST',
            body: JSON.stringify({ runId: runIdRef.current, batchIndex: idx, items: batch }),
          });
          const dt = performance.now() - t0;
          if (res.status === 429 || (res.status >= 500 && res.status !== 422)) {
            throw Object.assign(new Error(`HTTP ${res.status}`), { isRetryable: true, status: res.status });
          }
          const data = await res.json();
          if (data.error) throw new Error(data.error);
          batchTimesRef.current = [...batchTimesRef.current.slice(-5), dt];
          return data;
        } catch (err: any) {
          lastErr = err;
          if (attempt < MAX_RETRIES) {
            const delay = jitter(BACKOFF_MS[attempt] ?? BACKOFF_MS[BACKOFF_MS.length - 1]);
            addLog('warn', `Batch ${idx + 1} tentativa ${attempt + 1} falhou (${err.message}). Retry em ${(delay / 1000).toFixed(1)}s...`);
            await sleep(delay);
          }
        }
      }
      throw lastErr;
    }

    setPhase('running');

    for (let stageIdx = 0; stageIdx < stages.length && !abortRef.current; stageIdx++) {
      setCurrentStage(stageIdx + 1);
      const stageItems = stages[stageIdx];

      // Split stage into chunks
      const stageChunks: PriceItem[][] = [];
      for (let i = 0; i < stageItems.length; i += CHUNK_SIZE) {
        stageChunks.push(stageItems.slice(i, i + CHUNK_SIZE));
      }

      addLog('info', `──── Etapa ${stageIdx + 1}/${stages.length} · ${stageItems.length} SKUs · ${stageChunks.length} batches ────`);

      const stageTaskUids: number[] = [];
      let stageUpdated = 0;

      // Process batches in this stage
      let ci = 0;
      while (ci < stageChunks.length && !abortRef.current) {
        const conc = concRef.current;
        const window = Math.min(conc, stageChunks.length - ci);
        const localIndices = Array.from({ length: window }, (_, k) => ci + k);
        ci += window;

        const results = await Promise.allSettled(
          localIndices.map(li => processBatch(globalBatchIdx + li, stageChunks[li]))
        );

        for (let k = 0; k < results.length; k++) {
          const result = results[k];
          const absIdx = globalBatchIdx + localIndices[k];

          if (result.status === 'fulfilled') {
            const data = result.value;
            localUpdated  += data.updated.length;
            stageUpdated  += data.updated.length;
            localNotFound += data.notFound.length;
            localNotFoundSkus.push(...data.notFound);
            localFailed.push(...data.failed);
            if (data.meiliTaskUid) stageTaskUids.push(data.meiliTaskUid);
            setUpdatedCount(localUpdated);
            setNotFoundCount(localNotFound);
            setFailedCount(localFailed.length);
            setCompletedBatches(prev => prev + 1);
            addLog(
              data.failed.length > 0 ? 'warn' : 'ok',
              `Batch ${absIdx + 1}/${allChunks.length} · ✔ ${data.updated.length}` +
              (data.notFound.length > 0 ? ` · ⚠ nf=${data.notFound.length}` : '') +
              (data.failed.length  > 0 ? ` · ✘ fail=${data.failed.length}` : '') +
              ` · ${((batchTimesRef.current[batchTimesRef.current.length - 1] ?? 0) / 1000).toFixed(1)}s`
            );

            // Adaptive concurrency
            const avgMs = batchTimesRef.current.reduce((a, b) => a + b, 0) / batchTimesRef.current.length;
            if (avgMs < FAST_THRESH && concRef.current < MAX_CONC) {
              concRef.current = Math.min(MAX_CONC, concRef.current + 1);
              setCurrentConc(concRef.current);
            }
          } else {
            const errMsg = result.reason?.message ?? 'Erro desconhecido';
            if (abortRef.current) break;
            addLog('error', `Batch ${absIdx + 1} falhou definitivamente: ${errMsg}`);
            if (/429|503/.test(errMsg) || result.reason?.status === 429) {
              concRef.current = MIN_CONC;
              setCurrentConc(MIN_CONC);
              addLog('warn', 'Rate limit detectado — concorrência 1 + aguardando 5s');
              await sleep(5_000);
            }
            localFailed.push(...stageChunks[localIndices[k]].map(i => ({ sku: i.sku, error: errMsg })));
            setFailedCount(localFailed.length);
            setCompletedBatches(prev => prev + 1);
          }
        }

        // ETA
        if (batchTimesRef.current.length > 0) {
          const avgMs = batchTimesRef.current.reduce((a, b) => a + b, 0) / batchTimesRef.current.length;
          const remaining = allChunks.length - (globalBatchIdx + ci);
          const eta = Math.round((avgMs * remaining) / 1_000 / concRef.current);
          setEtaSecs(eta);
        }
      }

      globalBatchIdx += stageChunks.length;

      if (abortRef.current) break;

      // ── CHECKPOINT: Aguardar Meili + Verificar ──────────────────────────────
      if (stageUpdated > 0 && stageTaskUids.length > 0) {
        // 1) Aguardar Meili indexar
        setPhase('stage-waiting');
        addLog('info', `Aguardando Meilisearch indexar ${stageTaskUids.length} tasks...`);
        try {
          const waitRes = await adminFetch(`${API}/admin/price-update/wait-meili-tasks`, {
            method: 'POST',
            body: JSON.stringify({ taskUids: stageTaskUids }),
          });
          const waitData = await waitRes.json();
          if (waitData.error) {
            addLog('warn', `Erro ao aguardar Meili tasks: ${waitData.error}`);
          } else {
            addLog('ok', `Meili tasks concluídas em ${((waitData.elapsed ?? 0) / 1000).toFixed(1)}s`);
          }
        } catch (err: any) {
          addLog('warn', `Falha ao aguardar Meili (prosseguindo): ${err.message}`);
        }

        // 2) Verificar preços deste stage
        setPhase('stage-verifying');
        addLog('info', `Verificando ${stageItems.length} preços da etapa ${stageIdx + 1}...`);
        try {
          const verifyRes = await adminFetch(`${API}/admin/price-update/verify-prices`, {
            method: 'POST',
            body: JSON.stringify({
              items: stageItems.map(it => ({
                sku: it.sku,
                expectedPrice: it.price,
                expectedSpecialPrice: it.special_price,
              })),
              sampleMagento: 0,
            }),
          });
          const vData = await verifyRes.json();

          if (vData.error) {
            addLog('warn', `Erro na verificação da etapa: ${vData.error}`);
          } else {
            const realMismatches = (vData.mismatches ?? []).filter((m: any) => m.source !== 'not_in_meili');
            const notInMeili = vData.notInMeili ?? 0;

            if (realMismatches.length === 0) {
              addLog('ok', `Etapa ${stageIdx + 1} ✔ Verificação OK — ${vData.ok ?? 0} corretos` +
                (notInMeili > 0 ? ` · ${notInMeili} ausentes no Meili (ignorados)` : ''));
            } else {
              // Verificação falhou — PAUSAR
              addLog('warn',
                `Etapa ${stageIdx + 1} ⚠ ${realMismatches.length} divergências de preço` +
                (notInMeili > 0 ? ` · ${notInMeili} ausentes no Meili` : '')
              );
              setStageVerifyResult({
                stageIndex: stageIdx + 1,
                totalStages: stages.length,
                checked: vData.checked ?? 0,
                ok: vData.ok ?? 0,
                mismatches: realMismatches,
                notInMeili,
              });
              setPhase('stage-paused');

              // Aguardar decisão do usuário
              const decision = await new Promise<'continue' | 'stop'>((resolve) => {
                stageResolveRef.current = resolve;
              });
              stageResolveRef.current = null;
              setStageVerifyResult(null);

              if (decision === 'stop') {
                addLog('warn', 'Processamento interrompido pelo usuário na verificação.');
                abortRef.current = true;
                break;
              } else {
                addLog('info', 'Usuário optou por continuar apesar das divergências.');
              }
            }
          }
        } catch (err: any) {
          addLog('warn', `Falha na verificação da etapa (prosseguindo): ${err.message}`);
        }
      } else if (stageUpdated === 0) {
        addLog('warn', `Etapa ${stageIdx + 1}: nenhum SKU atualizado — pulando verificação`);
      }

      // Voltar para running se não pausou
      if (!abortRef.current) setPhase('running');
    }

    // Save failed items ref for export
    failedItemsRef.current   = localFailed;
    notFoundItemsRef.current = localNotFoundSkus;

    // Finish run
    await adminFetch(`${API}/admin/price-update/run/finish`, {
      method: 'POST',
      body: JSON.stringify({
        runId: runIdRef.current,
        updatedCount: localUpdated,
        notFoundCount: localNotFound,
        failedCount: localFailed.length,
      }),
    });

    if (abortRef.current) {
      addLog('warn', 'Processamento cancelado/interrompido pelo usuário.');
      setPhase('cancelled');
    } else {
      addLog('ok', `Concluído! ✔ ${localUpdated} atualizados · ⚠ ${localNotFound} não encontrados · ✘ ${localFailed.length} erros`);
      setPhase('done');
      toast.success(`${localUpdated.toLocaleString('pt-BR')} preços atualizados com sucesso!`);
    }
  }, [addLog]);

  // ── Export helpers ─────────────────────────────────────────────────────────
  const exportMissing = useCallback(() => {
    const rows = ['sku', ...missingActiveRef.current];
    exportCSV(rows, `skus-ativos-sem-preco-${Date.now()}.csv`);
  }, []);

  const exportErrors = useCallback(() => {
    const rows = ['sku,erro', ...failedItemsRef.current.map(f => `${f.sku},\"${f.error.replace(/\"/g, "'")}\"`  )];
    exportCSV(rows, `erros-atualizacao-${Date.now()}.csv`);
  }, []);

  const exportNotFound = useCallback(() => {
    const rows = ['sku', ...notFoundItemsRef.current];
    exportCSV(rows, `nao-encontrados-magento-${Date.now()}.csv`);
  }, []);

  const exportFullReport = useCallback(() => {
    const rows = ['sku,tipo,detalhe'];
    for (const sku of notFoundItemsRef.current) {
      rows.push(`${sku},nao_encontrado,"SKU não existe no Magento"`);
    }
    for (const f of failedItemsRef.current) {
      rows.push(`${f.sku},erro,"${f.error.replace(/"/g, "'")}"`);
    }
    exportCSV(rows, `relatorio-nao-atualizados-${Date.now()}.csv`);
  }, []);

  // ── Retry failed items ────────────────────────────────────────────────────
  const retryFailed = useCallback(async () => {
    const failedSkuSet = new Set(failedItemsRef.current.map(f => f.sku));
    if (failedSkuSet.size === 0) return;

    // Find matching items from original list that failed
    const retryItems = matchedItemsRef.current.filter(i => failedSkuSet.has(i.sku));
    if (retryItems.length === 0) {
      addLog('warn', 'Nenhum item encontrado para retry (SKUs já foram removidos da lista).');
      return;
    }

    setIsRetrying(true);
    addLog('info', `═══ RETRY: Reenviando ${retryItems.length} SKUs que falharam ═══`);

    const chunks: PriceItem[][] = [];
    for (let i = 0; i < retryItems.length; i += CHUNK_SIZE) {
      chunks.push(retryItems.slice(i, i + CHUNK_SIZE));
    }

    // Reset counters for retry
    const prevUpdated  = updatedCount;
    const prevNotFound = notFoundCount;
    let retryUpdated   = 0;
    let retryNotFound  = 0;
    const retryFailed_ : Array<{ sku: string; error: string }> = [];
    const retryNotFoundSkus: string[] = [];
    abortRef.current   = false;
    batchTimesRef.current = [];
    concRef.current    = 1; // start conservatively
    setCurrentConc(1);

    for (let batchIdx = 0; batchIdx < chunks.length && !abortRef.current; batchIdx++) {
      const batch = chunks[batchIdx];
      let success = false;

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        if (abortRef.current) break;
        try {
          const t0  = performance.now();
          const res = await adminFetch(`${API}/admin/price-update/batch`, {
            method : 'POST',
            body   : JSON.stringify({ runId: runIdRef.current, batchIndex: 9000 + batchIdx, items: batch }),
          });
          const dt = performance.now() - t0;

          if (res.status === 429 || (res.status >= 500 && res.status !== 422)) {
            throw Object.assign(new Error(`HTTP ${res.status}`), { isRetryable: true, status: res.status });
          }

          const data: QueueResult = await res.json();
          if ((data as any).error) throw new Error((data as any).error);

          retryUpdated  += data.updated.length;
          retryNotFound += data.notFound.length;
          retryNotFoundSkus.push(...data.notFound);
          retryFailed_.push(...data.failed);

          addLog(
            data.failed.length > 0 ? 'warn' : 'ok',
            `Retry batch ${batchIdx + 1}/${chunks.length} · ✔ ${data.updated.length}` +
            (data.notFound.length > 0 ? ` · ⚠ notFound=${data.notFound.length}` : '') +
            (data.failed.length  > 0 ? ` · ✘ failed=${data.failed.length}` : '') +
            ` · ${(dt / 1000).toFixed(1)}s`
          );
          success = true;
          break;
        } catch (err: any) {
          if (attempt < MAX_RETRIES) {
            const delay = jitter(BACKOFF_MS[attempt] ?? BACKOFF_MS[BACKOFF_MS.length - 1]);
            addLog('warn', `Retry batch ${batchIdx + 1} tentativa ${attempt + 1} falhou (${err.message}). Aguardando ${(delay / 1000).toFixed(1)}s...`);
            await sleep(delay);
          } else {
            addLog('error', `Retry batch ${batchIdx + 1} falhou definitivamente: ${err.message}`);
            retryFailed_.push(...batch.map(i => ({ sku: i.sku, error: err.message })));
          }
        }
      }

      // Small pause between batches
      if (success && batchIdx < chunks.length - 1) {
        await sleep(500);
      }
    }

    // Update global counters
    setUpdatedCount(prevUpdated + retryUpdated);
    setNotFoundCount(prevNotFound + retryNotFound);
    setFailedCount(retryFailed_.length);

    // Replace failed/notFound refs with new (smaller) lists
    failedItemsRef.current    = retryFailed_;
    notFoundItemsRef.current  = [...notFoundItemsRef.current, ...retryNotFoundSkus];

    addLog('ok',
      `═══ RETRY concluído: ✔ ${retryUpdated} recuperados · ⚠ ${retryNotFound} não encontrados · ✘ ${retryFailed_.length} ainda com erro ═══`
    );

    if (retryUpdated > 0) {
      toast.success(`Retry: ${retryUpdated} preços atualizados com sucesso!`);
    }
    if (retryFailed_.length === 0) {
      toast.success('Todos os erros foram resolvidos no retry!');
    }

    setIsRetrying(false);
  }, [addLog, updatedCount, notFoundCount]);

  // ── Retry ALL non-updated items (failed + notFound) ───────────────────────
  const retryAll = useCallback(async () => {
    const failedSkuSet   = new Set(failedItemsRef.current.map(f => f.sku));
    const notFoundSkuSet = new Set(notFoundItemsRef.current);
    const allBadSkus     = new Set([...failedSkuSet, ...notFoundSkuSet]);

    const retryItems = matchedItemsRef.current.filter(i => allBadSkus.has(i.sku));
    if (retryItems.length === 0) { addLog('warn', 'Nenhum item encontrado para retry.'); return; }

    setIsRetryingAll(true);
    addLog('info', `═══ RETRY TODOS: Reenviando ${retryItems.length} SKUs (${failedSkuSet.size} erros + ${notFoundSkuSet.size} não encontrados) ═══`);

    const chunks: PriceItem[][] = [];
    for (let i = 0; i < retryItems.length; i += CHUNK_SIZE) chunks.push(retryItems.slice(i, i + CHUNK_SIZE));

    const prevUpdated = updatedCount;
    let rUpdated = 0, rNotFound = 0;
    const rFailed: Array<{ sku: string; error: string }> = [];
    const rNotFoundSkus: string[] = [];
    abortRef.current = false; concRef.current = 1; setCurrentConc(1);
    const retryOffset = 20000 + Math.floor(Math.random() * 10000);

    for (let batchIdx = 0; batchIdx < chunks.length && !abortRef.current; batchIdx++) {
      const batch = chunks[batchIdx];
      let success = false;
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        if (abortRef.current) break;
        try {
          const t0 = performance.now();
          const res = await adminFetch(`${API}/admin/price-update/batch`, {
            method: 'POST',
            body: JSON.stringify({ runId: runIdRef.current, batchIndex: retryOffset + batchIdx, items: batch }),
          });
          const dt = performance.now() - t0;
          if (res.status === 429 || (res.status >= 500 && res.status !== 422))
            throw Object.assign(new Error(`HTTP ${res.status}`), { isRetryable: true, status: res.status });
          const data: QueueResult = await res.json();
          if ((data as any).error) throw new Error((data as any).error);
          rUpdated += data.updated.length; rNotFound += data.notFound.length;
          rNotFoundSkus.push(...data.notFound); rFailed.push(...data.failed);
          addLog(data.failed.length > 0 ? 'warn' : 'ok',
            `Retry-all batch ${batchIdx + 1}/${chunks.length} · ✔ ${data.updated.length}` +
            (data.notFound.length > 0 ? ` · ⚠ nf=${data.notFound.length}` : '') +
            (data.failed.length > 0 ? ` · ✘ fail=${data.failed.length}` : '') + ` · ${(dt / 1000).toFixed(1)}s`);
          success = true; break;
        } catch (err: any) {
          if (attempt < MAX_RETRIES) {
            const delay = jitter(BACKOFF_MS[attempt] ?? BACKOFF_MS[BACKOFF_MS.length - 1]);
            addLog('warn', `Retry-all batch ${batchIdx + 1} attempt ${attempt + 1} falhou. Aguardando ${(delay / 1000).toFixed(1)}s...`);
            await sleep(delay);
          } else {
            addLog('error', `Retry-all batch ${batchIdx + 1} falhou definitivamente: ${err.message}`);
            rFailed.push(...batch.map(i => ({ sku: i.sku, error: err.message })));
          }
        }
      }
      if (success && batchIdx < chunks.length - 1) await sleep(500);
    }

    setUpdatedCount(prevUpdated + rUpdated); setNotFoundCount(rNotFoundSkus.length); setFailedCount(rFailed.length);
    failedItemsRef.current = rFailed; notFoundItemsRef.current = rNotFoundSkus;
    addLog('ok', `═══ RETRY TODOS concluído: ✔ ${rUpdated} recuperados · ⚠ ${rNotFoundSkus.length} nf · ✘ ${rFailed.length} erros ═══`);
    if (rUpdated > 0) toast.success(`Retry: ${rUpdated} preços atualizados!`);
    if (rFailed.length === 0 && rNotFoundSkus.length === 0) toast.success('Todos os itens foram atualizados!');
    setIsRetryingAll(false);
  }, [addLog, updatedCount]);

  // ── Verify prices in Meilisearch ──────────────────────────────────────────
  const verifyPrices = useCallback(async () => {
    const items = matchedItemsRef.current;
    if (items.length === 0) return;
    setIsVerifying(true); setVerifyResult(null);
    addLog('info', `═══ VERIFICAÇÃO: Checando ${items.length.toLocaleString('pt-BR')} preços no Meilisearch + amostra Magento ═══`);
    try {
      // Enviar TODOS os itens em uma única request.
      // O backend pagina o Meili internamente UMA VEZ e compara tudo.
      const res = await adminFetch(`${API}/admin/price-update/verify-prices`, {
        method: 'POST',
        body: JSON.stringify({
          items: items.map(it => ({ sku: it.sku, expectedPrice: it.price, expectedSpecialPrice: it.special_price })),
          sampleMagento: 10,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const result = {
        checked: data.checked ?? 0,
        ok: data.ok ?? 0,
        mismatches: data.mismatches ?? [],
        notInMeili: data.notInMeili ?? 0,
      };
      setVerifyResult(result);
      addLog('info', `Verificação: ok=${result.ok} mismatches=${result.mismatches.length} notInMeili=${result.notInMeili}`);
      if (result.mismatches.length === 0) {
        addLog('ok', `═══ VERIFICAÇÃO OK: Todos os ${result.ok.toLocaleString('pt-BR')} preços conferem! ═══`);
        toast.success('Todos os preços conferem no Meilisearch!');
      } else {
        addLog('warn', `═══ VERIFICAÇÃO: ${result.mismatches.length} discrepâncias de ${result.checked} verificados ═══`);
        toast.warning(`${result.mismatches.length} preços divergentes encontrados`);
      }
    } catch (err: any) {
      addLog('error', `Falha na verificação: ${err.message}`);
      toast.error('Erro ao verificar preços');
    }
    setIsVerifying(false);
  }, [addLog]);

  const exportMismatches = useCallback(() => {
    if (!verifyResult?.mismatches?.length) return;
    const rows = ['sku,tipo,preco_esperado,special_esperado,preco_meili,special_meili,diff_preco,diff_special'];
    for (const m of verifyResult.mismatches) {
      rows.push(`${m.sku},${m.source},${m.expectedPrice},${m.expectedSpecial},${m.meiliPrice ?? ''},${m.meiliSpecial ?? ''},${m.priceDiff != null ? m.priceDiff.toFixed(2) : ''},${m.specialDiff != null ? m.specialDiff.toFixed(2) : ''}`);
    }
    exportCSV(rows, `verificacao-precos-${Date.now()}.csv`);
  }, [verifyResult]);

  const reset = useCallback(() => {
    abortRef.current          = true;
    workerRef.current?.terminate();
    workerRef.current         = null;
    siteSkusRef.current       = [];
    skuInfoRef.current        = {};
    matchedItemsRef.current   = [];
    missingSkusRef.current    = [];
    missingActiveRef.current  = [];
    missingIgnoredRef.current = 0;
    failedItemsRef.current    = [];
    notFoundItemsRef.current  = [];
    runIdRef.current          = '';
    batchTimesRef.current     = [];
    setPhase('idle');
    setFileName('');
    setSiteSkuCount(0);
    setParseStats(null);
    setParseProgress(0);
    setCompletedBatches(0);
    setTotalBatches(0);
    setUpdatedCount(0);
    setNotFoundCount(0);
    setFailedCount(0);
    setEtaSecs(null);
    setLogs([]);
    setShowMissing(false);
    setShowFailed(false);
    setShowNotFound(false);
    setVerifyResult(null);
    setShowMismatches(false);
    setCurrentStage(0);
    setTotalStages(0);
    setStageVerifyResult(null);
    stageResolveRef.current = null;
  }, []);

  // ── Progress % ─────────────────────────────────────────────────────────────
  const queuePct = totalBatches > 0 ? Math.round((completedBatches / totalBatches) * 100) : 0;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 lg:p-10 space-y-8 max-w-5xl">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-[#1d1d1f] dark:text-white">
            Lista de Precos
          </h2>
          <p className="text-[#86868b] text-sm mt-1">
            {activeTab === 'update'
              ? 'Importa a tabela de precos da distribuidora, cruza com o catalogo e atualiza preco regular e preco especial (-9,9%) no Magento via fila inteligente.'
              : 'Verifica se os precos atuais no Meilisearch conferem com a tabela da distribuidora, sem alterar nada.'
            }
          </p>
        </div>
        {activeTab === 'update' && phase !== 'idle' && (
          <Button variant="outline" size="sm" className="shrink-0 gap-2" onClick={reset}>
            <RefreshCw className="w-3.5 h-3.5" /> Reiniciar
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-black/[0.04] dark:bg-white/[0.04] rounded-xl p-1">
        <button
          onClick={() => setActiveTab('update')}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
            activeTab === 'update'
              ? 'bg-white dark:bg-[#1a1a1a] text-[#1d1d1f] dark:text-white shadow-sm'
              : 'text-[#86868b] hover:text-[#1d1d1f] dark:hover:text-white'
          }`}
        >
          <Upload className="w-4 h-4" />
          Atualizar Precos
        </button>
        <button
          onClick={() => setActiveTab('verify')}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
            activeTab === 'verify'
              ? 'bg-white dark:bg-[#1a1a1a] text-[#1d1d1f] dark:text-white shadow-sm'
              : 'text-[#86868b] hover:text-[#1d1d1f] dark:hover:text-white'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          Verificar Precos
        </button>
      </div>

      {/* Tab content */}
      {activeTab === 'verify' ? (
        <PriceVerifyTab />
      ) : (
      <div className="space-y-8">

      {/* ── Upload zone ─────────────────────────────────────────────────── */}
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
              ? 'border-blue-500 bg-blue-500/5 scale-[1.01]'
              : 'border-black/[0.1] dark:border-white/10 hover:border-blue-400 hover:bg-blue-500/3 bg-white dark:bg-[#111]'}
          `}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.csv,.prn"
            className="hidden"
            onChange={onFileChange}
          />
          <div className="w-14 h-14 rounded-2xl bg-blue-500/10 flex items-center justify-center">
            <Upload className="w-7 h-7 text-blue-500" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-[#1d1d1f] dark:text-white">
              Arraste o arquivo de preços aqui
            </p>
            <p className="text-[#86868b] text-xs mt-1">
              ou clique para selecionar · .txt · .csv · qualquer delimitado por ponto-e-vírgula
            </p>
          </div>
          <div className="text-[10px] text-[#86868b] font-mono bg-black/[0.04] dark:bg-white/5 rounded-lg px-3 py-1.5">
            F;Peca;Descricao;UN;IPI;CFisc;$Consum;$Publ;...
          </div>
        </div>
      )}

      {/* ── Loading SKUs ────────────────────────────────────────────────── */}
      {phase === 'loading-skus' && (
        <div className="bg-white dark:bg-[#111] border border-black/[0.06] dark:border-white/10 rounded-2xl p-8 flex items-center gap-4">
          <Loader2 className="w-6 h-6 text-blue-500 animate-spin shrink-0" />
          <div>
            <p className="text-sm font-semibold text-[#1d1d1f] dark:text-white">Carregando catálogo do site...</p>
            <p className="text-[#86868b] text-xs mt-0.5">Buscando SKUs do Meilisearch para cruzamento</p>
          </div>
        </div>
      )}

      {/* ── Parsing / Resolving ─────────────────────────────────────────── */}
      {(phase === 'parsing' || phase === 'resolving') && (
        <div className="bg-white dark:bg-[#111] border border-black/[0.06] dark:border-white/10 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-3">
            <Loader2 className={`w-5 h-5 animate-spin shrink-0 ${phase === 'resolving' ? 'text-blue-500' : 'text-amber-500'}`} />
            <div className="flex-1">
              <p className="text-sm font-semibold text-[#1d1d1f] dark:text-white">
                {phase === 'resolving'
                  ? 'Resolvendo cadeias de substituição...'
                  : <>Analisando arquivo: <span className="font-normal text-[#86868b]">{fileName}</span></>
                }
              </p>
              <p className="text-[#86868b] text-xs mt-0.5">
                {phase === 'resolving'
                  ? `Seguindo CodSubstitutivo para ${siteSkuCount.toLocaleString('pt-BR')} SKUs do catálogo`
                  : `Web Worker processando e cruzando com ${siteSkuCount.toLocaleString('pt-BR')} SKUs do catálogo`
                }
              </p>
            </div>
            {phase === 'parsing' && (
              <span className="text-lg font-bold tabular-nums text-amber-500">{parseProgress}%</span>
            )}
            {phase === 'resolving' && (
              <span className="text-[11px] font-bold text-blue-500 bg-blue-500/10 px-2 py-0.5 rounded-full">Resolvendo</span>
            )}
          </div>
          <div className="h-2 bg-black/[0.05] dark:bg-white/10 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${phase === 'resolving' ? 'bg-blue-400 animate-pulse' : 'bg-amber-400'}`}
              style={{ width: phase === 'resolving' ? '100%' : `${parseProgress}%` }}
            />
          </div>
          {phase === 'resolving' && (
            <div className="flex items-center gap-2 text-[11px] text-[#86868b]">
              <ArrowRightLeft className="w-3.5 h-3.5 text-blue-400" />
              Seguindo cadeias: SKU → CodSubstitutivo → preço final (proteção anti-loop ativa)
            </div>
          )}
        </div>
      )}

      {/* ── Summary (ready + running + done + cancelled) ────────────── */}
      {parseStats && phase !== 'idle' && phase !== 'loading-skus' && phase !== 'parsing' && phase !== 'resolving' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              label="SKUs no site"
              value={siteSkuCount}
              sub="catálogo normalizado"
            />
            <StatCard
              label="Linhas no arquivo"
              value={parseStats.validLines}
              sub={`${parseStats.totalLines.toLocaleString('pt-BR')} linhas totais`}
            />
            <StatCard
              label="SKUs com preço"
              value={parseStats.matchedCount}
              color="text-emerald-600"
              sub={
                parseStats.substitutedCount > 0
                  ? `↳ ${parseStats.substitutedCount.toLocaleString('pt-BR')} via substituição`
                  : `${Math.ceil(parseStats.matchedCount / CHUNK_SIZE)} batches · chunk ${CHUNK_SIZE}`
              }
            />
            <StatCard
              label="SKUs sem preço"
              value={parseStats.missingCount}
              color={parseStats.missingCount > 0 ? 'text-amber-500' : 'text-[#1d1d1f] dark:text-white'}
              sub={
                (parseStats as any).missingIgnored > 0
                  ? `apenas ativos c/ estoque · ${((parseStats as any).missingIgnored as number).toLocaleString('pt-BR')} inativos ignorados`
                  : 'apenas ativos com estoque'
              }
            />
          </div>

          {/* Substituição info banner */}
          {parseStats.substitutedCount > 0 && (
            <div className="flex items-start gap-3 bg-blue-500/5 border border-blue-500/20 rounded-xl px-4 py-3">
              <ArrowRightLeft className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
              <div className="text-xs text-[#86868b]">
                <span className="font-semibold text-[#1d1d1f] dark:text-white">
                  {parseStats.substitutedCount.toLocaleString('pt-BR')} SKUs com preço via CodSubstitutivo.&nbsp;
                </span>
                O campo <code className="font-mono bg-black/[0.06] px-1 rounded">CodSubstitutivo</code> indicava substituição —
                a cadeia foi seguida até o produto final (sem substituto) e o preço desse produto foi aplicado ao SKU original.
              </div>
            </div>
          )}

          {/* Missing SKUs panel */}
          {parseStats.missingCount > 0 && (
            <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-amber-500/5 transition-colors"
                onClick={() => setShowMissing(s => !s)}
              >
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                  <span className="text-sm font-semibold text-[#1d1d1f] dark:text-white">
                    {parseStats.missingCount.toLocaleString('pt-BR')} SKUs <strong>ativos com estoque</strong> não encontrados na tabela de preços
                  </span>
                  {(parseStats as any).missingIgnored > 0 && (
                    <span className="text-[10px] text-[#86868b] bg-black/[0.04] px-2 py-0.5 rounded-full">
                      +{((parseStats as any).missingIgnored as number).toLocaleString('pt-BR')} inativos/sem estoque ignorados
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span
                    role="button"
                    tabIndex={0}
                    className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md border text-[11px] font-bold border-amber-500/30 text-amber-600 hover:bg-amber-500/10 cursor-pointer select-none"
                    onClick={e => { e.stopPropagation(); exportMissing(); }}
                    onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); exportMissing(); } }}
                  >
                    <Download className="w-3 h-3" /> Exportar CSV
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
                        +{(missingActiveRef.current.length - 200).toLocaleString('pt-BR')} mais…
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Queue controls (ready) ───────────────────────────────────────── */}
      {phase === 'ready' && (
        <div className="flex items-center gap-3">
          <Button
            className="gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold"
            onClick={runQueue}
            disabled={!parseStats?.matchedCount}
          >
            <Play className="w-4 h-4" />
            Iniciar Atualização de {parseStats?.matchedCount.toLocaleString('pt-BR')} SKUs
          </Button>
          <p className="text-xs text-[#86868b]">
            {Math.ceil((parseStats?.matchedCount ?? 0) / STAGE_SIZE)} etapas × {STAGE_SIZE} SKUs · checkpoint com verificação após cada etapa
          </p>
        </div>
      )}

      {/* ── Running progress ─────────────────────────────────────────────── */}
      {(phase === 'running' || phase === 'cancelled' || phase === 'stage-waiting' || phase === 'stage-verifying' || phase === 'stage-paused') && (
        <div className="bg-white dark:bg-[#111] border border-black/[0.06] dark:border-white/10 rounded-2xl p-6 space-y-5">
          {/* Stage indicator */}
          {totalStages > 0 && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-[#86868b] uppercase tracking-widest">Etapa</span>
                <span className="text-lg font-bold text-[#1d1d1f] dark:text-white tabular-nums">
                  {currentStage}/{totalStages}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {phase === 'running' && (
                  <span className="text-[10px] font-bold text-blue-500 bg-blue-500/10 px-2.5 py-1 rounded-full animate-pulse">
                    Processando batches
                  </span>
                )}
                {phase === 'stage-waiting' && (
                  <span className="text-[10px] font-bold text-amber-500 bg-amber-500/10 px-2.5 py-1 rounded-full animate-pulse">
                    Aguardando Meilisearch...
                  </span>
                )}
                {phase === 'stage-verifying' && (
                  <span className="text-[10px] font-bold text-cyan-500 bg-cyan-500/10 px-2.5 py-1 rounded-full animate-pulse">
                    Verificando preços...
                  </span>
                )}
                {phase === 'stage-paused' && (
                  <span className="text-[10px] font-bold text-orange-500 bg-orange-500/10 px-2.5 py-1 rounded-full">
                    Divergências detectadas — aguardando decisão
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Stage progress dots */}
          {totalStages > 1 && totalStages <= 30 && (
            <div className="flex gap-1 flex-wrap">
              {Array.from({ length: totalStages }, (_, i) => {
                const idx = i + 1;
                let cls = 'w-3 h-3 rounded-full border transition-all ';
                if (idx < currentStage) cls += 'bg-emerald-400 border-emerald-400';
                else if (idx === currentStage) {
                  if (phase === 'stage-paused') cls += 'bg-orange-400 border-orange-400 ring-2 ring-orange-400/30';
                  else cls += 'bg-blue-500 border-blue-500 ring-2 ring-blue-500/30 animate-pulse';
                } else cls += 'bg-transparent border-black/10 dark:border-white/10';
                return <div key={i} className={cls} title={`Etapa ${idx}`} />;
              })}
            </div>
          )}

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <p className="text-[10px] font-bold text-[#86868b] uppercase tracking-widest">Atualizados</p>
              <p className="text-2xl font-bold text-emerald-500 tabular-nums">{updatedCount.toLocaleString('pt-BR')}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] font-bold text-[#86868b] uppercase tracking-widest">Não encontrados</p>
              <p className="text-2xl font-bold text-amber-500 tabular-nums">{notFoundCount.toLocaleString('pt-BR')}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] font-bold text-[#86868b] uppercase tracking-widest">Erros</p>
              <p className="text-2xl font-bold text-rose-500 tabular-nums">{failedCount.toLocaleString('pt-BR')}</p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[#86868b]">
                Batch {completedBatches}/{totalBatches}
                <span className="ml-2 text-[#1d1d1f] dark:text-white font-bold">{queuePct}%</span>
              </span>
              <div className="flex items-center gap-3 text-[#86868b]">
                <span>conc: <strong className="text-[#1d1d1f] dark:text-white">{currentConc}</strong></span>
                {etaSecs !== null && (
                  <span>ETA: <strong className="text-[#1d1d1f] dark:text-white">{fmtSecs(etaSecs)}</strong></span>
                )}
              </div>
            </div>
            <div className="h-2.5 bg-black/[0.05] dark:bg-white/10 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  phase === 'stage-paused'
                    ? 'bg-gradient-to-r from-orange-500 to-orange-400'
                    : phase === 'stage-waiting' || phase === 'stage-verifying'
                      ? 'bg-gradient-to-r from-cyan-500 to-cyan-400'
                      : 'bg-gradient-to-r from-blue-500 to-blue-400'
                }`}
                style={{ width: `${queuePct}%` }}
              />
            </div>
          </div>

          {/* Stage paused — divergence panel */}
          {phase === 'stage-paused' && stageVerifyResult && (
            <div className="bg-orange-500/5 border border-orange-500/20 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-orange-500 shrink-0" />
                <div>
                  <p className="text-sm font-bold text-[#1d1d1f] dark:text-white">
                    Etapa {stageVerifyResult.stageIndex}: {stageVerifyResult.mismatches.length} preços divergentes
                  </p>
                  <p className="text-xs text-[#86868b] mt-0.5">
                    Verificados: {stageVerifyResult.checked} · OK: {stageVerifyResult.ok} · Divergentes: {stageVerifyResult.mismatches.length}
                    {stageVerifyResult.notInMeili > 0 && ` · Ausentes no Meili: ${stageVerifyResult.notInMeili}`}
                  </p>
                </div>
              </div>

              {/* Sample of mismatches */}
              {stageVerifyResult.mismatches.length > 0 && (
                <div className="max-h-40 overflow-auto">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="text-left text-[#86868b] border-b border-orange-500/10">
                        <th className="pb-1 font-bold pr-2">SKU</th>
                        <th className="pb-1 font-bold pr-2 text-right">Esperado</th>
                        <th className="pb-1 font-bold pr-2 text-right">Meili</th>
                        <th className="pb-1 font-bold text-right">Diff</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-orange-500/5">
                      {stageVerifyResult.mismatches.slice(0, 10).map((m: any, i: number) => (
                        <tr key={`${m.sku}-${i}`}>
                          <td className="py-1 pr-2 font-mono text-orange-600 whitespace-nowrap">{m.sku}</td>
                          <td className="py-1 pr-2 text-right tabular-nums">{fmtPrice(m.expectedPrice)}</td>
                          <td className="py-1 pr-2 text-right tabular-nums text-rose-500 font-bold">
                            {m.meiliPrice != null ? fmtPrice(m.meiliPrice) : '—'}
                          </td>
                          <td className="py-1 text-right tabular-nums text-[#86868b]">
                            {m.priceDiff != null ? fmtPrice(m.priceDiff) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {stageVerifyResult.mismatches.length > 10 && (
                    <p className="text-[10px] text-[#86868b] mt-1 text-center">
                      +{stageVerifyResult.mismatches.length - 10} mais...
                    </p>
                  )}
                </div>
              )}

              {/* Action buttons */}
              <div className="flex gap-2 pt-1">
                <Button
                  className="gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs"
                  onClick={() => stageResolveRef.current?.('continue')}
                >
                  <Play className="w-3.5 h-3.5" />
                  Continuar mesmo assim
                </Button>
                <Button
                  variant="outline"
                  className="gap-2 border-rose-500/30 text-rose-600 hover:bg-rose-500/5 text-xs"
                  onClick={() => stageResolveRef.current?.('stop')}
                >
                  <Ban className="w-3.5 h-3.5" />
                  Parar e revisar
                </Button>
              </div>
            </div>
          )}

          {/* Cancel (only during running) */}
          {phase === 'running' && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2 border-rose-500/30 text-rose-600 hover:bg-rose-500/5"
              onClick={() => { abortRef.current = true; }}
            >
              <Ban className="w-3.5 h-3.5" /> Cancelar
            </Button>
          )}
        </div>
      )}

      {/* ── Final report (done / cancelled) ─────────────────────────────── */}
      {(phase === 'done' || phase === 'cancelled') && (
        <div className={`rounded-2xl p-5 border flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
          phase === 'done'
            ? 'bg-emerald-500/5 border-emerald-500/20'
            : 'bg-amber-500/5 border-amber-500/20'
        }`}>
          <div className="flex items-center gap-3">
            {phase === 'done'
              ? <CheckCircle2 className="w-6 h-6 text-emerald-500 shrink-0" />
              : <AlertTriangle  className="w-6 h-6 text-amber-500 shrink-0" />
            }
            <div>
              <p className="text-sm font-bold text-[#1d1d1f] dark:text-white">
                {phase === 'done' ? 'Atualização concluída!' : 'Atualização cancelada'}
              </p>
              <p className="text-xs text-[#86868b] mt-0.5">
                ✔ {updatedCount.toLocaleString('pt-BR')} atualizados ·
                ⚠ {notFoundCount.toLocaleString('pt-BR')} não encontrados no Magento ·
                ✘ {failedCount.toLocaleString('pt-BR')} erros
              </p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {parseStats && parseStats.missingCount > 0 && (
              <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={exportMissing}>
                <Download className="w-3 h-3" /> SKUs sem preço
              </Button>
            )}
            {failedCount > 0 && (
              <Button variant="outline" size="sm" className="gap-1.5 text-xs border-rose-500/30 text-rose-600 hover:bg-rose-500/5" onClick={retryFailed} disabled={isRetrying || isRetryingAll}>
                {isRetrying ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                {isRetrying ? 'Retentando...' : 'Retry erros'}
              </Button>
            )}
            {(failedCount > 0 || notFoundCount > 0) && (
              <Button variant="outline" size="sm" className="gap-1.5 text-xs border-purple-500/30 text-purple-600 hover:bg-purple-500/5" onClick={retryAll} disabled={isRetryingAll || isRetrying}>
                {isRetryingAll ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                {isRetryingAll ? 'Retentando todos...' : `Retry TODOS (${(failedCount + notFoundCount).toLocaleString('pt-BR')})`}
              </Button>
            )}
            <Button variant="outline" size="sm" className="gap-1.5 text-xs border-cyan-500/30 text-cyan-600 hover:bg-cyan-500/5" onClick={verifyPrices} disabled={isVerifying || isRetrying || isRetryingAll}>
              {isVerifying ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldCheck className="w-3 h-3" />}
              {isVerifying ? 'Verificando...' : 'Verificar no Meilisearch'}
            </Button>
          </div>
        </div>
      )}

      {/* ── Detailed failure panels (after done/cancelled) ──────────────── */}
      {(phase === 'done' || phase === 'cancelled') && (failedCount > 0 || notFoundCount > 0) && (
        <div className="space-y-3">
          {/* Failed items panel */}
          {failedCount > 0 && (
            <div className="bg-rose-500/5 border border-rose-500/20 rounded-xl overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-rose-500/5 transition-colors"
                onClick={() => setShowFailed(s => !s)}
              >
                <div className="flex items-center gap-2">
                  <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
                  <span className="text-sm font-semibold text-[#1d1d1f] dark:text-white">
                    {failedCount.toLocaleString('pt-BR')} SKUs com erro de atualização
                  </span>
                  <span className="text-[10px] text-[#86868b] bg-black/[0.04] px-2 py-0.5 rounded-full">
                    retentável
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    role="button"
                    tabIndex={0}
                    className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md border text-[11px] font-bold border-rose-500/30 text-rose-600 hover:bg-rose-500/10 cursor-pointer select-none"
                    onClick={e => { e.stopPropagation(); exportErrors(); }}
                    onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); exportErrors(); } }}
                  >
                    <Download className="w-3 h-3" /> CSV
                  </span>
                  {showFailed ? <ChevronUp className="w-4 h-4 text-[#86868b]" /> : <ChevronDown className="w-4 h-4 text-[#86868b]" />}
                </div>
              </button>
              {showFailed && (
                <div className="px-4 pb-4 max-h-64 overflow-y-auto">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="text-left text-[#86868b] border-b border-rose-500/10">
                        <th className="pb-1.5 font-bold pr-3">SKU</th>
                        <th className="pb-1.5 font-bold">Erro</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-rose-500/5">
                      {failedItemsRef.current.slice(0, 100).map((f, i) => (
                        <tr key={`${f.sku}-${i}`}>
                          <td className="py-1 pr-3 font-mono text-rose-600 dark:text-rose-400 whitespace-nowrap">{f.sku}</td>
                          <td className="py-1 text-[#86868b] break-all">{f.error}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {failedItemsRef.current.length > 100 && (
                    <p className="text-[11px] text-[#86868b] mt-2 text-center">
                      +{(failedItemsRef.current.length - 100).toLocaleString('pt-BR')} mais — exporte o CSV para ver todos
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Not found items panel */}
          {notFoundCount > 0 && (
            <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-amber-500/5 transition-colors"
                onClick={() => setShowNotFound(s => !s)}
              >
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                  <span className="text-sm font-semibold text-[#1d1d1f] dark:text-white">
                    {notFoundCount.toLocaleString('pt-BR')} SKUs não encontrados no Magento
                  </span>
                  <span className="text-[10px] text-[#86868b] bg-black/[0.04] px-2 py-0.5 rounded-full">
                    produto inexistente na loja
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    role="button"
                    tabIndex={0}
                    className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md border text-[11px] font-bold border-amber-500/30 text-amber-600 hover:bg-amber-500/10 cursor-pointer select-none"
                    onClick={e => { e.stopPropagation(); exportNotFound(); }}
                    onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); exportNotFound(); } }}
                  >
                    <Download className="w-3 h-3" /> CSV
                  </span>
                  {showNotFound ? <ChevronUp className="w-4 h-4 text-[#86868b]" /> : <ChevronDown className="w-4 h-4 text-[#86868b]" />}
                </div>
              </button>
              {showNotFound && (
                <div className="px-4 pb-4 max-h-52 overflow-y-auto">
                  <div className="flex flex-wrap gap-1.5">
                    {notFoundItemsRef.current.slice(0, 200).map(sku => (
                      <code key={sku} className="text-[10px] bg-amber-500/10 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded font-mono">
                        {sku}
                      </code>
                    ))}
                    {notFoundItemsRef.current.length > 200 && (
                      <span className="text-[11px] text-[#86868b] px-2 py-0.5">
                        +{(notFoundItemsRef.current.length - 200).toLocaleString('pt-BR')} mais…
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Full report export button */}
          {(failedCount > 0 || notFoundCount > 0) && (
            <div className="flex justify-end">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={exportFullReport}>
                <Download className="w-3 h-3" /> Exportar relatório completo (não atualizados)
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ── Price Checker / Verification results ─────────────────────────── */}
      {verifyResult && (phase === 'done' || phase === 'cancelled') && (
        <div className="space-y-3">
          {/* Verification summary */}
          <div className={`rounded-2xl p-5 border ${
            verifyResult.mismatches.length === 0
              ? 'bg-cyan-500/5 border-cyan-500/20'
              : 'bg-orange-500/5 border-orange-500/20'
          }`}>
            <div className="flex items-center gap-3 mb-3">
              {verifyResult.mismatches.length === 0
                ? <ShieldCheck className="w-6 h-6 text-cyan-500 shrink-0" />
                : <Eye className="w-6 h-6 text-orange-500 shrink-0" />
              }
              <div>
                <p className="text-sm font-bold text-[#1d1d1f] dark:text-white">
                  {verifyResult.mismatches.length === 0
                    ? 'Verificação OK — Todos os preços conferem!'
                    : `Verificação: ${verifyResult.mismatches.length.toLocaleString('pt-BR')} preços divergentes`
                  }
                </p>
                <p className="text-xs text-[#86868b] mt-0.5">
                  Verificados: {verifyResult.checked.toLocaleString('pt-BR')} ·
                  OK: {verifyResult.ok.toLocaleString('pt-BR')} ·
                  Divergentes: {verifyResult.mismatches.length.toLocaleString('pt-BR')}
                  {verifyResult.notInMeili > 0 && ` · Ausentes no Meili: ${verifyResult.notInMeili.toLocaleString('pt-BR')}`}
                </p>
              </div>
            </div>

            {verifyResult.mismatches.length > 0 && (
              <div className="grid grid-cols-3 gap-3 mb-3">
                <StatCard label="Verificados" value={verifyResult.checked} color="text-cyan-600" />
                <StatCard label="Corretos" value={verifyResult.ok} color="text-emerald-600" />
                <StatCard
                  label="Divergentes"
                  value={verifyResult.mismatches.length}
                  color="text-orange-500"
                  sub={verifyResult.notInMeili > 0 ? `${verifyResult.notInMeili} ausentes no Meili` : undefined}
                />
              </div>
            )}
          </div>

          {/* Mismatches detail panel */}
          {verifyResult.mismatches.length > 0 && (
            <div className="bg-orange-500/5 border border-orange-500/20 rounded-xl overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-orange-500/5 transition-colors"
                onClick={() => setShowMismatches(s => !s)}
              >
                <div className="flex items-center gap-2">
                  <Search className="w-4 h-4 text-orange-500 shrink-0" />
                  <span className="text-sm font-semibold text-[#1d1d1f] dark:text-white">
                    {verifyResult.mismatches.length.toLocaleString('pt-BR')} produtos com preços errados
                  </span>
                  <span className="text-[10px] text-[#86868b] bg-black/[0.04] px-2 py-0.5 rounded-full">
                    Meilisearch desatualizado
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    role="button"
                    tabIndex={0}
                    className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md border text-[11px] font-bold border-orange-500/30 text-orange-600 hover:bg-orange-500/10 cursor-pointer select-none"
                    onClick={e => { e.stopPropagation(); exportMismatches(); }}
                    onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); exportMismatches(); } }}
                  >
                    <Download className="w-3 h-3" /> CSV
                  </span>
                  {showMismatches ? <ChevronUp className="w-4 h-4 text-[#86868b]" /> : <ChevronDown className="w-4 h-4 text-[#86868b]" />}
                </div>
              </button>
              {showMismatches && (
                <div className="px-4 pb-4 max-h-80 overflow-auto">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="text-left text-[#86868b] border-b border-orange-500/10 sticky top-0 bg-orange-50 dark:bg-[#1a1000]">
                        <th className="pb-1.5 font-bold pr-2">SKU</th>
                        <th className="pb-1.5 font-bold pr-2 text-right">Esperado</th>
                        <th className="pb-1.5 font-bold pr-2 text-right">Esp. Special</th>
                        <th className="pb-1.5 font-bold pr-2 text-right">Meili Atual</th>
                        <th className="pb-1.5 font-bold pr-2 text-right">Meili Special</th>
                        <th className="pb-1.5 font-bold text-center">Tipo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-orange-500/5">
                      {verifyResult.mismatches.slice(0, 150).map((m: any, i: number) => (
                        <tr key={`${m.sku}-${i}`} className={m.source === 'not_in_meili' ? 'opacity-60' : ''}>
                          <td className="py-1 pr-2 font-mono text-orange-600 dark:text-orange-400 whitespace-nowrap">{m.sku}</td>
                          <td className="py-1 pr-2 text-right tabular-nums">{fmtPrice(m.expectedPrice)}</td>
                          <td className="py-1 pr-2 text-right tabular-nums">{fmtPrice(m.expectedSpecial)}</td>
                          <td className={`py-1 pr-2 text-right tabular-nums font-bold ${
                            m.meiliPrice != null && Math.abs(m.meiliPrice - m.expectedPrice) > 0.02
                              ? 'text-rose-500' : 'text-emerald-500'
                          }`}>
                            {m.meiliPrice != null ? fmtPrice(m.meiliPrice) : '—'}
                          </td>
                          <td className={`py-1 pr-2 text-right tabular-nums font-bold ${
                            m.meiliSpecial != null && Math.abs(m.meiliSpecial - m.expectedSpecial) > 0.02
                              ? 'text-rose-500' : m.meiliSpecial != null ? 'text-emerald-500' : 'text-[#86868b]'
                          }`}>
                            {m.meiliSpecial != null ? fmtPrice(m.meiliSpecial) : '—'}
                          </td>
                          <td className="py-1 text-center">
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                              m.source === 'not_in_meili' ? 'bg-gray-500/10 text-gray-500'
                                : 'bg-orange-500/10 text-orange-600'
                            }`}>
                              {m.source === 'not_in_meili' ? 'AUSENTE' : 'DIVERGE'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {verifyResult.mismatches.length > 150 && (
                    <p className="text-[11px] text-[#86868b] mt-2 text-center">
                      +{(verifyResult.mismatches.length - 150).toLocaleString('pt-BR')} mais — exporte o CSV para ver todos
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Log terminal ─────────────────────────────────────────────────── */}
      {logs.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <Terminal className="w-4 h-4 text-[#86868b]" />
            <h3 className="text-[11px] font-bold text-[#86868b] uppercase tracking-widest">Log em tempo real</h3>
            <Badge variant="secondary" className="text-[9px] h-4 bg-black/[0.04] border-none text-[#86868b]">
              {logs.length} entradas
            </Badge>
          </div>
          <div className="bg-[#0d0d0d] border border-black/20 rounded-xl p-4 h-64 overflow-y-auto font-mono">
            <div className="space-y-0.5">
              {logs.map(l => <LogRow key={l.id} entry={l} />)}
            </div>
            <div ref={logEndRef} />
          </div>
        </div>
      )}

      {/* ── Docs ─────────────────────────────────────────────────────────── */}
      {phase === 'idle' && (
        <div className="bg-black/[0.02] dark:bg-white/[0.02] border border-black/[0.06] dark:border-white/10 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#86868b]" />
            <h3 className="text-xs font-bold text-[#86868b] uppercase tracking-widest">Formato esperado</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-[#86868b]">
            <div className="space-y-1.5">
              <p><strong className="text-[#1d1d1f] dark:text-white">Delimitador:</strong> ponto-e-vírgula (;)</p>
              <p><strong className="text-[#1d1d1f] dark:text-white">Linhas de produto:</strong> começam com <code className="font-mono bg-black/[0.06] px-1 rounded">A;</code></p>
              <p><strong className="text-[#1d1d1f] dark:text-white">Coluna SKU:</strong> 2ª coluna (Peca) — espaços removidos</p>
              <p><strong className="text-[#1d1d1f] dark:text-white">Coluna Preço:</strong> 8ª coluna ($Publ) — ex: <code className="font-mono">00369000</code> = R$ 3.690,00</p>
            </div>
            <div className="space-y-1.5">
              <p><strong className="text-[#1d1d1f] dark:text-white">Preço especial:</strong> −9,9% sobre $Publ (multiplica por 0,901)</p>
              <p><strong className="text-[#1d1d1f] dark:text-white">Fila:</strong> etapas de {STAGE_SIZE} · batches de {CHUNK_SIZE} · conc. 1-{MAX_CONC}</p>
              <p><strong className="text-[#1d1d1f] dark:text-white">Checkpoint:</strong> após cada {STAGE_SIZE} SKUs → Meili sync → verifica</p>
              <p><strong className="text-[#1d1d1f] dark:text-white">Idempotência:</strong> runId+batchIndex · retries {MAX_RETRIES}x</p>
            </div>
          </div>
        </div>
      )}
      </div>
      )}
    </div>
  );
}