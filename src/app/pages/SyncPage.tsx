import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '../components/base/button';
import {
  Download, Loader2, RefreshCw, Play,
  Terminal, Circle, CheckCircle2, XCircle,
  Stethoscope, Zap, Search, ClipboardList,
  Database, Server, Mail,
} from 'lucide-react';
import { toast } from 'sonner';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';
import { copyToClipboard } from '../utils/clipboard';

const API = `https://${projectId}.supabase.co/functions/v1/make-server-1d6e33e0`;
const HEADERS: HeadersInit = {
  Authorization: `Bearer ${publicAnonKey}`,
  apikey: publicAnonKey,
  'Content-Type': 'application/json',
  'Cache-Control': 'no-cache',
};
const MAX_LOGS = 300;
const POLL_MS = 5000;

async function hit(path: string, method = 'GET', timeout = 15000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeout);
  const t0 = performance.now();
  try {
    const res = await fetch(`${API}${path}`, { method, signal: ac.signal, cache: 'no-store', headers: HEADERS });
    const raw = await res.text();
    clearTimeout(t);
    const ms = Math.round(performance.now() - t0);
    let json: any = null;
    try { json = JSON.parse(raw); } catch {}
    return { ok: res.ok, status: res.status, ms, raw, json };
  } catch (e: any) {
    clearTimeout(t);
    const ms = Math.round(performance.now() - t0);
    return { ok: false, status: 0, ms, raw: e?.name === 'AbortError' ? `TIMEOUT ${timeout}ms` : (e?.message ?? String(e)), json: null };
  }
}

function now() {
  return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
function ago(iso?: string) {
  if (!iso) return '–';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 0) return 'agora';
  if (s < 60) return `${s}s atras`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s atras`;
  return `${Math.floor(m / 60)}h ${m % 60}m atras`;
}

interface Log { t: string; lvl: 'INF' | 'OK ' | 'WRN' | 'ERR'; msg: string; }

export function SyncPage() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [syncData, setSyncData] = useState<any>(null);
  const [imgData, setImgData] = useState<any>(null);
  const [meiliData, setMeiliData] = useState<any>(null);
  const [auditData, setAuditData] = useState<any>(null);
  const [newMeiliData, setNewMeiliData] = useState<any>(null);
  
  const [nlImportData, setNlImportData] = useState<any>(null);
  const [nlStepping, setNlStepping] = useState(false);

  const [pollCount, setPollCount] = useState(0);
  const [lastPoll, setLastPoll] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [meiliStepping, setMeiliStepping] = useState(false);
  const [auditStepping, setAuditStepping] = useState(false);
  const [imgStepping, setImgStepping] = useState(false);
  const [newMeiliStepping, setNewMeiliStepping] = useState(false);

  // "Connected" = user explicitly clicked to load status
  const [connected, setConnected] = useState(false);
  const [autoPoll, setAutoPoll] = useState(false);

  const endRef = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  const inited = useRef(false);
  const autoResuming = useRef(false);
  const meiliAbort = useRef(false);
  const auditAbort = useRef(false);
  const imgAbort = useRef(false);
  const newMeiliAbort = useRef(false);
  const nlAbort = useRef(false);

  const log = useCallback((lvl: Log['lvl'], msg: string) => {
    setLogs(p => { const n = [...p, { t: now(), lvl, msg }]; return n.length > MAX_LOGS ? n.slice(-MAX_LOGS) : n; });
  }, []);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);

  // ── Poll ──
  const poll = useCallback(async (verbose: boolean) => {
    if (busy.current) return;
    busy.current = true;
    const t0 = performance.now();

    const s = await hit('/sync/status');
    if (s.ok && s.json) {
      setSyncData(s.json);
      if (verbose) log('INF', `sync/status ${s.status} ${s.ms}ms → ${s.raw.slice(0, 120)}`);
      // Auto-resume desabilitado — operações só iniciam por clique explícito
      if (s.json.status === 'batch_done' && s.json.resume_page) {
        if (verbose) log('INF', `Batch concluido (pagina ${s.json.resume_page} pendente). Clique "Executar" para continuar.`);
      }
    } else if (verbose) log('ERR', `sync/status FALHOU ${s.status} ${s.ms}ms`);

    const i = await hit('/images/status');
    if (i.ok && i.json) { setImgData(i.json); if (verbose) log('INF', `images/status ${i.ms}ms`); }

    const m = await hit('/meili/status');
    if (m.ok && m.json) { setMeiliData(m.json); if (verbose) log('INF', `meili/status ${m.ms}ms → ${m.raw.slice(0, 120)}`); }

    const a = await hit('/audit/status');
    if (a.ok && a.json) { setAuditData(a.json); if (verbose) log('INF', `audit/status ${a.ms}ms → ${a.json.status}`); }

    const nm = await hit('/meili-sync/status');
    if (nm.ok && nm.json) { setNewMeiliData(nm.json); if (verbose) log('INF', `meili-sync/status ${nm.ms}ms`); }

    const nl = await hit('/newsletter/import-magento/status');
    if (nl.ok && nl.json) { setNlImportData(nl.json); if (verbose) log('INF', `newsletter/import ${nl.ms}ms → ${nl.json.status}`); }

    setPollCount(c => c + 1);
    setLastPoll(now());
    if (verbose) log('INF', `Poll completo em ${Math.round(performance.now() - t0)}ms`);
    busy.current = false;
  }, [log]);

  // ── Init (no auto-load — user must click) ──
  useEffect(() => {
    if (inited.current) return;
    inited.current = true;
    log('INF', '━━━ SyncPage montada ━━━');
    log('INF', `API: ${API}`);
    log('INF', 'Clique "Carregar Status" para consultar os serviços.');
  }, [log]);

  // ── Auto-poll (only when connected AND autoPoll is on) ──
  useEffect(() => {
    if (!connected || !autoPoll) return;
    const iv = setInterval(() => poll(false), POLL_MS);
    return () => clearInterval(iv);
  }, [connected, autoPoll, poll]);

  // ── Manual connect ──
  const connectAndLoad = useCallback(async () => {
    log('INF', '═══ Conectando... ═══');
    const h = await hit('/health');
    log(h.ok ? 'OK ' : 'ERR', `Health ${h.status} ${h.ms}ms`);
    setConnected(true);
    await poll(true);
    log('OK ', 'Status carregado. Clique "Executar" em qualquer operação para iniciar.');
  }, [log, poll]);

  // ── Actions ──
  const startSync = async () => {
    log('INF', 'POST /sync/start ...');
    const r = await hit('/sync/start', 'POST');
    log(r.ok ? 'OK ' : 'ERR', `sync/start ${r.status} ${r.ms}ms`);
    if (r.ok) toast.success('Sync iniciado'); else toast.error('Falha');
    poll(true);
  };

  const checkMagentoConnection = async () => {
    log('INF', 'Testando conexão com Magento (via /magento/orders?limit=1)...');
    try {
      const res = await hit('/magento/orders?limit=1', 'GET', 10000);
      if (res.ok && res.json && !res.json.error) {
        log('OK ', 'Conexão Magento OK! Retornou dados.');
        toast.success('Conexão com Magento está OK');
      } else {
        log('ERR', `Falha na conexão Magento: ${res.json?.error || res.raw || res.status}`);
        toast.error('Erro na conexão com Magento');
      }
    } catch (e: any) {
      log('ERR', `Erro ao testar Magento: ${e.message}`);
      toast.error('Erro ao testar Magento');
    }
  };

  const startNewMeiliSync = async () => {
    if (newMeiliStepping) {
      newMeiliAbort.current = true;
      log('WRN', 'Abortando sync...');
      toast.info('Sincronização pausada');
      return;
    }

    newMeiliAbort.current = false;
    setNewMeiliStepping(true);

    try {
      // Start
      log('INF', 'POST /meili-sync/start ...');
      const startRes = await hit('/meili-sync/start', 'POST', 60000);
      
      if (!startRes.ok) {
        // 409 = already running
        if (startRes.status === 409) {
          log('INF', 'Sync já em andamento — continuando steps...');
          setNewMeiliData(startRes.json?.status);
        } else {
          log('ERR', `Start falhou: ${startRes.raw.slice(0, 200)}`);
          toast.error(startRes.json?.error || 'Falha ao iniciar sync');
          setNewMeiliStepping(false);
          return;
        }
      } else {
        const status = startRes.json?.status;
        const config = startRes.json?.config;
        const metaStats = startRes.json?.meta_stats;
        log('OK ', `Sync v2 iniciado: ${status?.total ?? '?'} produtos, ~${config?.estimated_steps ?? '?'} steps (${config?.magento_page_size ?? '?'}×${config?.pages_per_step ?? '?'}/step)`);
        log('INF', `Meta: ${metaStats?.categories ?? 0} cats, ${metaStats?.modelos ?? 0} modelos, ${metaStats?.anos ?? 0} anos, ${metaStats?.colors ?? 0} cores`);
        log('INF', `Setup: ${startRes.json?.setup_ms ?? '?'}ms | Index: ${startRes.json?.index_setup?.reason ?? '?'}`);
        toast.success(`Sync v2 iniciado: ${status?.total ?? '?'} produtos`);
        setNewMeiliData(status);
      }

      // Step Loop — TURBO: no artificial delay
      let stepCount = 0;
      let consecutiveErrors = 0;
      const MAX_CONSECUTIVE_ERRORS = 5;

      while (!newMeiliAbort.current) {
        stepCount++;
        const stepRes = await hit('/meili-sync/step', 'POST', 120000); // 2min timeout for large batches

        if (!stepRes.ok) {
          consecutiveErrors++;
          const willRetry = stepRes.json?.will_retry !== false;
          log('ERR', `Step ${stepCount} falhou (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}): ${(stepRes.json?.error || stepRes.raw).slice(0, 150)}`);
          if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS || !willRetry) {
            log('ERR', 'Erros consecutivos demais — abortando');
            toast.error('Abortado por erros');
            break;
          }
          // Exponential backoff: 1s, 2s, 3s...
          await new Promise(r => setTimeout(r, 1000 * consecutiveErrors));
          continue;
        }

        consecutiveErrors = 0;
        const data = stepRes.json;
        const msg = data?.message;
        const s = data?.status;
        const perf = data?.performance;
        const step = data?.step;
        setNewMeiliData(s);

        if (msg === 'step_done') {
          const processed = s?.processed ?? 0;
          const total = s?.total ?? 1;
          const pct = Math.round((processed / total) * 100);
          // Log every step (they're much bigger now — ~300 products each)
          log('INF', [
            `Step ${stepCount}: ${processed}/${total} (${pct}%)`,
            `· ${step?.items_indexed ?? '?'} indexed, ${step?.items_skipped ?? 0} skip`,
            `· Magento ${step?.magento_ms ?? '?'}ms, Meili ${step?.meili_ms ?? '?'}ms`,
            `· ${perf?.docs_per_second ?? '?'} docs/s · ETA ${perf?.eta_human ?? '?'}`,
            `· step ${step?.total_ms ?? '?'}ms`,
          ].join(' '));
          // NO delay — the server is the bottleneck, not the client
          continue;
        } else if (msg === 'completed') {
          const elapsed = perf?.elapsed_human ?? `${s?.elapsed_seconds ?? '?'}s`;
          log('OK ', `✅ Sincronização concluída! ${s?.indexed ?? s?.processed} produtos indexados em ${elapsed} (${perf?.docs_per_second ?? '?'} docs/s)`);
          toast.success(`Sync concluído: ${s?.indexed ?? s?.processed} produtos em ${elapsed}`);
          break;
        } else {
          log('WRN', `Resposta inesperada: ${msg}`);
          break;
        }
      }

    } catch (e: any) {
      log('ERR', `Erro no loop: ${e.message}`);
      toast.error('Erro no processo de sync');
    } finally {
      setNewMeiliStepping(false);
      newMeiliAbort.current = false;
      poll(true);
    }
  };

  const startImgSync = async () => {
    if (imgStepping) {
      imgAbort.current = true;
      log('WRN', 'Abortando image sync...');
      toast.info('Download de imagens pausado');
      return;
    }

    imgAbort.current = false;
    setImgStepping(true);

    try {
      // Phase 1: Start
      const forceParam = imgStale ? '?force=1' : '';
      log('INF', `POST /images/sync/start${forceParam} ...`);
      const startRes = await hit(`/images/sync/start${forceParam}`, 'POST', 60000);
      if (!startRes.ok) {
        if (startRes.status === 409 || startRes.json?.status?.status === 'running') {
          log('INF', 'Download de imagens já em andamento — continuando steps...');
        } else {
          log('ERR', `start falhou: ${startRes.raw.slice(0, 200)}`);
          toast.error(startRes.json?.error || 'Falha no start');
          setImgStepping(false);
          return;
        }
      } else {
        const cfg = startRes.json?.config;
        log('OK ', `Start OK: ${startRes.json?.total ?? '?'} produtos, batch=${cfg?.batch_size ?? '?'} ×${cfg?.concurrency ?? '?'} paralelo, setup ${startRes.json?.setup_ms ?? '?'}ms`);
        toast.success(`Image sync v3 iniciado: ${startRes.json?.total ?? '?'} produtos`);
      }

      await poll(false);

      // Phase 2: Step loop — 100 prods/step, 6 paralelo, NO delay
      let stepCount = 0;
      let consecutiveErrors = 0;
      const MAX_CONSECUTIVE_ERRORS = 5;

      while (!imgAbort.current) {
        stepCount++;
        const stepRes = await hit('/images/sync/step', 'POST', 120000); // 2min — parallel downloads

        if (!stepRes.ok) {
          consecutiveErrors++;
          log('ERR', `Step ${stepCount} falhou (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}): ${(stepRes.json?.error || stepRes.raw).slice(0, 150)}`);
          if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
            log('ERR', 'Erros consecutivos demais — abortando');
            toast.error('Download de imagens abortado por erros');
            break;
          }
          await new Promise(r => setTimeout(r, 1000 * consecutiveErrors));
          continue;
        }

        consecutiveErrors = 0;
        const msg = stepRes.json?.message;
        const perf = stepRes.json?.performance;

        if (msg === 'batch_done') {
          const p = stepRes.json?.progress;
          const b = stepRes.json?.batch;
          // Log every step (each step now processes 100 products)
          log('INF', [
            `Img step ${stepCount}: ${p?.processed}/${p?.total} (${p?.pct}%)`,
            `· ${b?.downloaded ?? 0} new / ${b?.skipped ?? 0} skip / ${b?.copied ?? 0} dedup / ${b?.errors ?? 0} err`,
            `· ${b?.urls_updated ?? 0} URLs→Storage`,
            `· ${perf?.imgs_per_second ?? '?'} imgs/s · ETA ${perf?.eta_human ?? '?'}`,
            `· ${stepRes.json?.step_ms ?? '?'}ms`,
          ].join(' '));
          setImgData((prev: any) => ({
            ...prev,
            status: 'running',
            phase: 'downloading',
            processed: p?.processed,
            total: p?.total,
            progress: p?.pct,
            batches_completed: stepCount,
            imgs_per_second: perf?.imgs_per_second,
            eta_human: perf?.eta_human,
            elapsed_human: perf?.elapsed_human,
            urls_updated: (prev?.urls_updated || 0) + (b?.urls_updated || 0),
          }));
          // NO delay — server is the bottleneck
          continue;
        }

        if (msg === 'completed') {
          const s = stepRes.json?.status;
          const elapsed = s?.elapsed_human ?? `${s?.elapsed_seconds ?? '?'}s`;
          log('OK ', `✅ Download concluído: ${s?.downloaded ?? '?'} baixadas, ${s?.skipped_existing ?? '?'} skip, ${s?.copied_dedup ?? '?'} dedup, ${s?.urls_updated ?? '?'} URLs→Storage, ${s?.errors ?? 0} erros, ${elapsed}`);
          toast.success(`Imagens concluído: ${s?.downloaded ?? '?'} novas, ${s?.urls_updated ?? '?'} URLs atualizadas em ${elapsed}`);
          break;
        }

        log('WRN', `Step resposta inesperada: ${msg}`);
        break;
      }

      if (imgAbort.current) {
        log('WRN', 'Image sync loop abortado — cursor salvo, pode continuar');
      }
    } catch (error: any) {
      log('ERR', `Erro no image sync step loop: ${error.message}`);
      toast.error('Erro no download de imagens');
    } finally {
      setImgStepping(false);
      imgAbort.current = false;
      poll(true);
    }
  };
  const startMeiliIndex = async () => {
    if (meiliStepping) {
      // Abort running step loop
      meiliAbort.current = true;
      log('WRN', 'Abortando step loop...');
      toast.info('Indexação pausada — pode continuar');
      return;
    }

    meiliAbort.current = false;
    setMeiliStepping(true);

    try {
      // Phase 1: Start (setup + init cursor)
      const forceParam = meiliStale ? '?force=1' : '';
      log('INF', `POST /meili/index/start${forceParam} ...`);
      const startRes = await hit(`/meili/index/start${forceParam}`, 'POST', 60000);
      if (!startRes.ok) {
        // Maybe already running — try stepping directly
        if (startRes.json?.status?.status === 'running') {
          log('INF', 'Indexação já em andamento — continuando steps...');
        } else {
          log('ERR', `start falhou: ${startRes.raw.slice(0, 200)}`);
          toast.error(startRes.json?.error || 'Falha no start');
          setMeiliStepping(false);
          return;
        }
      } else {
        log('OK ', `Start OK: ${startRes.json?.total ?? '?'} produtos, setup ${startRes.json?.setup_ms ?? '?'}ms`);
        toast.success(`Indexação iniciada: ${startRes.json?.total ?? '?'} produtos`);
      }

      await poll(false);

      // Phase 2: Step loop
      let stepCount = 0;
      let consecutiveErrors = 0;
      const MAX_CONSECUTIVE_ERRORS = 5;

      while (!meiliAbort.current) {
        stepCount++;
        const stepRes = await hit('/meili/index/step', 'POST', 30000);

        if (!stepRes.ok) {
          consecutiveErrors++;
          log('ERR', `Step ${stepCount} falhou (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}): ${(stepRes.json?.error || stepRes.raw).slice(0, 120)}`);
          if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
            log('ERR', `${MAX_CONSECUTIVE_ERRORS} erros consecutivos — abortando`);
            toast.error('Indexação abortada por erros consecutivos');
            break;
          }
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }

        consecutiveErrors = 0;
        const msg = stepRes.json?.message;

        if (msg === 'backpressure') {
          const pending = stepRes.json?.meili_pending ?? '?';
          if (stepCount % 5 === 0) log('WRN', `Backpressure: ${pending} tasks pendentes — aguardando`);
          await new Promise(r => setTimeout(r, 2500));
          continue;
        }

        if (msg === 'batch_done') {
          const p = stepRes.json?.progress;
          if (stepCount % 3 === 1) {
            log('INF', `Step ${stepCount}: ${p?.indexed}/${p?.total} (${p?.pct}%) · ${p?.docs_per_second} docs/s · ETA ${p?.eta}`);
          }
          // Update meiliData locally for instant UI feedback
          setMeiliData((prev: any) => ({
            ...prev,
            status: 'running',
            phase: 'indexing',
            indexed: p?.indexed,
            total: p?.total,
            progress: p?.pct,
            docs_per_second: p?.docs_per_second,
            eta_human: p?.eta,
            batches_completed: stepCount,
          }));
          await new Promise(r => setTimeout(r, 300));
          continue;
        }

        if (msg === 'all_batches_done') {
          log('OK ', `Todos os batches concluidos! ${stepCount} steps`);

          // Phase 3: Finalize
          log('INF', 'POST /meili/index/finalize ...');
          const finRes = await hit('/meili/index/finalize', 'POST', 120000);
          if (finRes.ok) {
            const s = finRes.json?.status;
            log('OK ', `Finalizado: ${s?.indexed ?? '?'} docs, ${s?.elapsed_seconds ?? '?'}s`);
            if (s?.smokeTest) {
              log('OK ', `Smoke: ${s.smokeTest.totalHits} hits, facets=[${(s.smokeTest.facetsReturned || []).join(',')}]`);
            }
            toast.success('Indexação MeiliSearch concluída!');
          } else {
            log('ERR', `Finalize falhou: ${(finRes.json?.error || finRes.raw).slice(0, 200)}`);
          }
          break;
        }

        // Unknown message
        log('WRN', `Step resposta inesperada: ${msg}`);
        break;
      }

      if (meiliAbort.current) {
        log('WRN', 'Step loop abortado pelo usuario — cursor salvo, pode continuar');
      }
    } catch (error: any) {
      log('ERR', `Erro no step loop: ${error.message}`);
      toast.error('Erro na indexação');
    } finally {
      setMeiliStepping(false);
      meiliAbort.current = false;
      poll(true);
    }
  };

  const runDiagnostic = async () => {
    setTesting(true);
    log('INF', '');
    log('INF', '══════════ DIAGNOSTICO COMPLETO ══════════');

    const h = await hit('/health');
    log(h.ok ? 'OK ' : 'ERR', `Health: HTTP ${h.status} | ${h.ms}ms`);

    const ss = await hit('/sync/status');
    if (ss.json) log('INF', `Sync: ${ss.json.status} | ${ss.json.downloaded ?? 0} produtos | page ${ss.json.current_page ?? '?'}/${ss.json.total_pages ?? '?'}`);

    const is = await hit('/images/status');
    if (is.json) log('INF', `Images: ${is.json.status} | ${is.json.downloaded ?? 0} baixadas`);

    log('INF', '→ GET /magento/orders?limit=1 ...');
    const mg = await hit('/magento/orders?limit=1', 'GET', 10000);
    if (mg.ok && mg.json && !mg.json.error) {
       log('OK ', `Magento OK | Connection Successful`);
    } else {
       log('ERR', `Magento FALHOU: ${mg.json?.error || mg.raw}`);
    }

    const db = await hit('/test/database');
    if (db.ok && db.json) log('OK ', `DB OK | ${db.json.total_products} produtos`);
    else log('ERR', `DB FALHOU: ${db.raw.slice(0, 200)}`);

    log('INF', '→ GET /meili/config ...');
    const mc = await hit('/meili/config');
    if (mc.ok && mc.json) {
      log(mc.json.configured ? 'OK ' : 'WRN', `MeiliSearch: ${mc.json.configured ? 'Configurado' : 'NAO CONFIGURADO'}`);
      if (mc.json.health) log(mc.json.health.ok ? 'OK ' : 'ERR', `MeiliSearch Health: ${mc.json.health.ok ? 'OK' : mc.json.health.error}`);
      if (mc.json.indexStats) log('INF', `MeiliSearch Index: ${mc.json.indexStats.numberOfDocuments} docs`);
      log(mc.json.openai_configured ? 'OK ' : 'WRN', `OpenAI: ${mc.json.openai_configured ? 'Configurado' : 'NAO CONFIGURADO'}`);
    }

    // Check failed tasks
    log('INF', '→ GET /meili/debug/failed-tasks?limit=5 ...');
    const ft = await hit('/meili/debug/failed-tasks?limit=5');
    if (ft.ok && ft.json) {
      const tasks = ft.json.tasks || [];
      if (tasks.length === 0) {
        log('OK ', 'MeiliSearch: Nenhuma task falhada recente');
      } else {
        log('WRN', `MeiliSearch: ${ft.json.total} tasks falhadas`);
        for (const t of tasks.slice(0, 3)) {
          const errMsg = t.error?.message || t.error?.code || 'erro desconhecido';
          log('ERR', `  Task ${t.uid} (${t.type}): ${errMsg}`);
        }
      }
    }

    // Check audit status
    log('INF', '→ GET /audit/status ...');
    const as = await hit('/audit/status');
    if (as.ok && as.json) {
      if (as.json.status === 'completed') {
        const sum = as.json.summary;
        log(sum?.raw_complete ? 'OK ' : 'WRN', `Audit RAW: ${sum?.raw_complete ? 'COMPLETO' : 'INCOMPLETO'} (KV: ${sum?.kv_count}, Magento: ${sum?.magento_total})`);
        log(sum?.orphans_count === 0 ? 'OK ' : 'WRN', `Audit Categorias: ${sum?.effective_coverage_pct}% cobertura, ${sum?.orphans_count} orfaos`);
      } else if (as.json.status === 'idle') {
        log('WRN', 'Category Audit: nunca executado — execute POST /audit/sync');
      } else {
        log('INF', `Category Audit: ${as.json.status}`);
      }
    }

    // Category data sample — diagnose extraction
    log('INF', '→ GET /audit/debug/sample?limit=5 ...');
    const cs = await hit('/audit/debug/sample?limit=5');
    if (cs.ok && cs.json) {
      const sum = cs.json.summary;
      if (sum) {
        log('INF', `Category sample: ${sum.with_categories ?? 0}/${cs.json.total_sampled ?? 0} com categorias`);
        log('INF', `  Fonte custom_attr: ${sum.has_custom_attr_category_ids ?? 0} | Fonte category_links: ${sum.has_extension_category_links ?? 0}`);
      } else {
        log('WRN', 'Category sample: Resumo não disponível na resposta');
      }
      for (const s of (cs.json.samples || []).slice(0, 3)) {
        log(s.extracted_count > 0 ? 'OK ' : 'WRN',
          `  ${s.sku} (${s.type_id}) → ${s.extracted_count} cats [${s.extracted_category_ids?.join(',')}]` +
          ` | attrs: [${(s.raw_custom_attrs_codes || []).join(',')}]` +
          ` | ext_keys: [${(s.extension_attributes_keys || []).join(',')}]`
        );
      }
    }

    log('INF', '══════════ FIM ═════════');
    setTesting(false);
    poll(true);
  };

  // ── Resets ──
  const resetSync = async () => { const r = await hit('/sync/reset', 'POST'); log(r.ok ? 'OK ' : 'ERR', `sync/reset ${r.status}`); if (r.ok) toast.success('Reset'); poll(true); };
  const resetImgSync = async () => { const r = await hit('/images/reset', 'POST'); log(r.ok ? 'OK ' : 'ERR', `images/reset ${r.status}`); if (r.ok) toast.success('Reset'); poll(true); };
  const resetMeili = async () => { const r = await hit('/meili/reset', 'POST'); log(r.ok ? 'OK ' : 'ERR', `meili/reset ${r.status}`); if (r.ok) toast.success('Reset'); poll(true); };

  // ── Audit actions (step-based, same architecture as MeiliSearch) ──
  const startAudit = async () => {
    if (auditStepping) {
      auditAbort.current = true;
      log('WRN', 'Abortando audit step loop...');
      toast.info('Audit pausado — pode continuar depois');
      return;
    }

    auditAbort.current = false;
    setAuditStepping(true);

    try {
      // Phase 1: Start (Phase A — Magento probe + KV count + init cursor)
      const forceParam = auditStale ? '?force=1' : '';
      log('INF', `POST /audit/start${forceParam} ...`);
      const startRes = await hit(`/audit/start${forceParam}`, 'POST', 30000);
      if (!startRes.ok) {
        if (startRes.json?.status?.status === 'running') {
          log('INF', 'Audit já em andamento — continuando steps...');
        } else {
          log('ERR', `start falhou: ${startRes.raw.slice(0, 200)}`);
          toast.error(startRes.json?.error || 'Falha no start');
          setAuditStepping(false);
          return;
        }
      } else {
        log('OK ', `Start OK: KV=${startRes.json?.kv_count ?? '?'} Magento=${startRes.json?.magento_total ?? '?'} (${startRes.json?.raw_complete ? 'COMPLETO' : 'INCOMPLETO'}) ${startRes.json?.setup_ms ?? '?'}ms`);
        toast.success('Category Audit iniciado');
      }

      await poll(false);

      // Phase 2: Step loop (Phase B — scan 800 produtos por step)
      let stepCount = 0;
      let consecutiveErrors = 0;
      const MAX_CONSECUTIVE_ERRORS = 5;

      while (!auditAbort.current) {
        stepCount++;
        const stepRes = await hit('/audit/step', 'POST', 30000);

        if (!stepRes.ok) {
          consecutiveErrors++;
          log('ERR', `Step ${stepCount} falhou (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}): ${(stepRes.json?.error || stepRes.raw).slice(0, 120)}`);
          if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
            log('ERR', `${MAX_CONSECUTIVE_ERRORS} erros consecutivos — abortando`);
            toast.error('Audit abortado por erros consecutivos');
            break;
          }
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }

        consecutiveErrors = 0;
        const msg = stepRes.json?.message;

        if (msg === 'batch_done') {
          const { scanned, total, pct, step_ms } = stepRes.json || {};
          if (stepCount % 3 === 1) {
            log('INF', `Audit step ${stepCount}: ${scanned}/${total} (${pct}%) · ${step_ms}ms`);
          }
          setAuditData((prev: any) => ({
            ...prev,
            status: 'running',
            phase: 'scanning',
            scanned,
            progress: pct,
          }));
          await new Promise(r => setTimeout(r, 200));
          continue;
        }

        if (msg === 'all_batches_done') {
          log('OK ', `Scan completo! ${stepRes.json?.scanned ?? '?'} produtos em ${stepCount} steps`);

          // Phase 3: Finalize (Phase C — compute effective categories + report)
          log('INF', 'POST /audit/finalize ...');
          const finRes = await hit('/audit/finalize', 'POST', 60000);
          if (finRes.ok) {
            const s = finRes.json?.summary;
            log('OK ', `Audit concluído: ${s?.total ?? '?'} produtos, ${s?.coverage_pct ?? '?'}% cobertura, ${s?.orphans ?? 0} orfaos, ${s?.elapsed_seconds ?? '?'}s`);
            toast.success(`Category Audit concluído: ${s?.coverage_pct ?? '?'}% cobertura`);
          } else {
            log('ERR', `Finalize falhou: ${(finRes.json?.error || finRes.raw).slice(0, 200)}`);
          }
          break;
        }

        log('WRN', `Step resposta inesperada: ${msg}`);
        break;
      }

      if (auditAbort.current) {
        log('WRN', 'Audit loop abortado — cursor salvo, pode continuar');
      }
    } catch (error: any) {
      log('ERR', `Erro no audit step loop: ${error.message}`);
      toast.error('Erro no audit');
    } finally {
      setAuditStepping(false);
      auditAbort.current = false;
      poll(true);
    }
  };
  const resetAudit = async () => { const r = await hit('/audit/reset', 'POST'); log(r.ok ? 'OK ' : 'ERR', `audit/reset ${r.status}`); if (r.ok) toast.success('Reset'); poll(true); };
  
  // ── Newsletter Magento Import (step-based) ──
  const startNlImport = async () => {
    if (nlStepping) {
      nlAbort.current = true;
      log('WRN', 'Abortando newsletter import...');
      toast.info('Import pausado');
      return;
    }

    nlAbort.current = false;
    setNlStepping(true);

    try {
      log('INF', 'POST /newsletter/import-magento/start ...');
      const startRes = await hit('/newsletter/import-magento/start', 'POST', 30000);
      if (!startRes.ok) {
        if (startRes.status === 409) {
          log('INF', 'Import já em andamento — continuando steps...');
        } else {
          log('ERR', `Start falhou: ${(startRes.json?.error || startRes.raw).slice(0, 200)}`);
          toast.error(startRes.json?.error || 'Falha ao iniciar import');
          setNlStepping(false);
          return;
        }
      } else {
        log('OK ', `Newsletter import iniciado: ${startRes.json?.total_customers ?? '?'} clientes, ${startRes.json?.total_pages ?? '?'} paginas (${startRes.json?.page_size ?? '?'}/pg)`);
        toast.success(`Newsletter import: ${startRes.json?.total_customers ?? '?'} clientes`);
      }

      let stepCount = 0;
      let consecutiveErrors = 0;
      const MAX_CONSECUTIVE_ERRORS = 5;

      while (!nlAbort.current) {
        stepCount++;
        const stepRes = await hit('/newsletter/import-magento/step', 'POST', 60000);

        if (!stepRes.ok) {
          consecutiveErrors++;
          log('ERR', `Step ${stepCount} falhou (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}): ${(stepRes.json?.error || stepRes.raw).slice(0, 150)}`);
          if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
            log('ERR', 'Erros consecutivos demais — abortando');
            toast.error('Import abortado por erros');
            break;
          }
          await new Promise(r => setTimeout(r, 1000 * consecutiveErrors));
          continue;
        }

        consecutiveErrors = 0;
        const data = stepRes.json;
        const msg = data?.message;
        setNlImportData(data?.status);

        if (msg === 'step_done') {
          const s = data?.step;
          const t = data?.totals;
          log('INF', [
            `Step ${stepCount}: pg ${data?.page}/${data?.total_pages} (${data?.pct}%)`,
            `· ${s?.imported ?? 0} new / ${s?.skipped_existing ?? 0} exist / ${s?.skipped_no_subscription ?? 0} no-sub / ${s?.updated ?? 0} upd / ${s?.errors ?? 0} err`,
            `· ETA ${data?.performance?.eta_human ?? '?'} · ${s?.step_ms ?? '?'}ms`,
          ].join(' '));
          continue;
        }

        if (msg === 'completed') {
          const st = data?.status;
          log('OK ', `Newsletter import concluido! ${st?.imported ?? 0} novos, ${st?.updated ?? 0} atualizados, ${st?.skipped_existing ?? 0} existentes, ${st?.skipped_no_subscription ?? 0} sem inscricao, ${st?.errors ?? 0} erros · ${st?.elapsed_seconds ?? '?'}s`);
          toast.success(`Newsletter: ${st?.imported ?? 0} importados de ${st?.total_customers ?? '?'} clientes`);
          break;
        }

        log('WRN', `Resposta inesperada: ${msg}`);
        break;
      }

      if (nlAbort.current) {
        log('WRN', 'Newsletter import abortado — cursor salvo, pode continuar');
      }
    } catch (e: any) {
      log('ERR', `Erro no newsletter import: ${e.message}`);
      toast.error('Erro no import de newsletter');
    } finally {
      setNlStepping(false);
      nlAbort.current = false;
      poll(true);
    }
  };
  const resetNlImport = async () => { const r = await hit('/newsletter/import-magento/reset', 'POST'); log(r.ok ? 'OK ' : 'ERR', `newsletter/import-magento/reset ${r.status}`); if (r.ok) { toast.success('Reset'); setNlImportData(null); } poll(true); };

  const viewAuditReport = async () => {
    log('INF', '→ GET /audit/report ...');
    const r = await hit('/audit/report');
    if (r.ok && r.json) {
      const rpt = r.json;
      log('INF', '');
      log('INF', '══════════ AUDIT REPORT ══════════');
      log('INF', `Gerado: ${rpt.generated_at} (${rpt.elapsed_seconds}s)`);
      log('INF', '');
      log('INF', '─── Phase A: Completude RAW ───');
      const pa = rpt.phase_a_completeness;
      log(pa.complete ? 'OK ' : 'WRN', `Magento: ${pa.magento_total} | KV: ${pa.kv_count} | Missing: ${pa.missing}`);
      log(pa.complete ? 'OK ' : 'ERR', `Veredicto: ${pa.verdict}`);
      if (pa.error) log('ERR', `Erro: ${pa.error}`);
      log('INF', '');
      log('INF', '─── Phase B: Categorias Efetivas ───');
      const pb = rpt.phase_b_effective_categories;
      log('INF', `Tipos: simple=${pb.by_type.simple} configurable=${pb.by_type.configurable} other=${pb.by_type.other}`);
      log('INF', `Child→Parent map: ${pb.child_parent_map.total_children_mapped} resolved, ${pb.child_parent_map.unresolved_links} unresolved`);
      log('INF', `Self categories: ${pb.categories.has_self}`);
      log('INF', `Inherited from parent: ${pb.categories.inherited_from_parent}`);
      log(pb.categories.coverage_pct >= 95 ? 'OK ' : 'WRN', `Effective total: ${pb.categories.effective_total} (${pb.categories.coverage_pct}%)`);
      log(pb.categories.no_effective === 0 ? 'OK ' : 'ERR', `Orphans (sem categoria): ${pb.categories.no_effective}`);
      log(pb.categories.no_effective === 0 ? 'OK ' : 'ERR', `Veredicto: ${pb.verdict}`);
      if (rpt.samples?.orphan_sample?.length > 0) {
        log('WRN', `Amostra de orfaos:`);
        for (const o of rpt.samples.orphan_sample.slice(0, 10)) {
          log('WRN', `  ${o.sku} (${o.type_id}) — ${o.reason}${o.parent_sku ? ` [pai: ${o.parent_sku}]` : ''}`);
        }
      }
      log('INF', '══════════ FIM AUDIT ══════════');
    } else {
      log('WRN', `Sem report ainda: ${r.raw.slice(0, 200)}`);
    }
  };

  // ── Derived ──
  const syncStatus = syncData?.status ?? 'idle';
  const syncPct = syncData?.progress ?? 0;
  const syncRunning = syncStatus === 'running' || syncStatus === 'batch_done';

  const imgStatus = imgData?.status ?? 'idle';
  const imgPct = imgData?.progress ?? 0;
  const imgRunning = imgStatus === 'running';
  const imgStale = imgRunning && (imgData?._elapsed_minutes ?? 0) > 10;

  const meiliStatus = meiliData?.status ?? 'idle';
  const meiliRunning = meiliStatus === 'running';
  const meiliPct = meiliData?.progress ?? 0;
  const meiliStale = meiliRunning && (meiliData?._elapsed_minutes ?? 0) > 10;

  const auditStatus = auditData?.status ?? 'idle';
  const auditRunning = auditStatus === 'running';
  const auditSummary = auditData?.summary;
  const auditStale = auditRunning && (auditData?._stale === true);

  const newMeiliStatus = newMeiliData?.status ?? 'idle';
  const newMeiliRunning = newMeiliStatus === 'running';
  // If status is running, calculate % from processed/total if available
  const newMeiliPct = (newMeiliStatus === 'running' && newMeiliData?.total > 0) 
     ? Math.round((newMeiliData.processed / newMeiliData.total) * 100) 
     : newMeiliStatus === 'completed' ? 100 : 0;

  const nlImportStatus = nlImportData?.status ?? 'idle';
  const nlImportRunning = nlImportStatus === 'running';
  const nlImportPct = (nlImportRunning && nlImportData?.total_pages > 0)
    ? Math.round((nlImportData.current_page / nlImportData.total_pages) * 100)
    : nlImportStatus === 'completed' ? 100 : 0;
  const nlImportStale = nlImportRunning && (nlImportData?.elapsed_seconds ?? 0) > 600;

  const C: Record<string, string> = { 'INF': 'text-slate-400', 'OK ': 'text-emerald-400', 'WRN': 'text-amber-400', 'ERR': 'text-red-400' };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-4 h-full">

      {/* Top bar */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold text-foreground">Operacoes</h2>
          <span className="text-xs text-muted-foreground font-mono bg-muted px-2.5 py-1 rounded-md">
            poll #{pollCount} {lastPoll && `· ${lastPoll}`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button color="secondary" size="sm" onClick={checkMagentoConnection} className="text-sm">
            <Server className="w-4 h-4 mr-1.5" /> Testar Conexão Magento
          </Button>
          <Button color="secondary" size="sm" onClick={async () => {
            log('INF', 'POST /magento-sync/categories/tree/refresh ...');
            const r = await hit('/magento-sync/categories/tree/refresh', 'POST', 20000);
            if (r.ok) {
              log('OK ', `Arvore atualizada: Root ID=${r.json.root_id}, ${r.json.children_count} filhos`);
              toast.success('Árvore de categorias atualizada');
            } else {
              log('ERR', `Falha ao atualizar arvore: ${r.raw}`);
              toast.error('Erro ao atualizar árvore');
            }
          }} className="text-sm">
            <RefreshCw className="w-4 h-4 mr-1.5" /> Atualizar Árvore
          </Button>
          <Button color="secondary" size="sm" onClick={async () => {
             log('INF', 'POST /search-ops/repair-index ...');
             const r = await hit('/search-ops/repair-index', 'POST', 60000);
             if (r.ok) {
                 log('OK ', `Reparo iniciado: ${JSON.stringify(r.json?.result)}`);
                 toast.success('Reparo de índice iniciado');
             } else {
                 log('ERR', `Reparo falhou: ${r.raw}`);
                 toast.error('Falha ao reparar índice');
             }
          }} className="text-sm">
             <Search className="w-4 h-4 mr-1.5" /> Reparar Busca
          </Button>
          <Button color="secondary" size="sm" onClick={runDiagnostic} disabled={testing} className="text-sm">
            {testing ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Stethoscope className="w-4 h-4 mr-1.5" />}
            Diagnostico
          </Button>
          {!connected ? (
            <Button color="primary" size="sm" onClick={connectAndLoad} className="text-sm font-semibold">
              <Zap className="w-4 h-4 mr-1.5" /> Carregar Status
            </Button>
          ) : (
            <>
              <Button color="secondary" size="sm" onClick={() => poll(true)} className="text-sm">
                <RefreshCw className="w-4 h-4 mr-1.5" /> Atualizar
              </Button>
              <Button
                color={autoPoll ? "primary" : "secondary"}
                size="sm"
                onClick={() => setAutoPoll(p => !p)}
                className="text-sm"
              >
                {autoPoll ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Zap className="w-4 h-4 mr-1.5" />}
                {autoPoll ? 'Auto-poll ON' : 'Auto-poll OFF'}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Operation cards — 2x2 grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 flex-shrink-0">
        <OpCard
          title="Sincronização MeiliSearch (v2)" 
          icon={<Database className="w-4 h-4" />}
          status={newMeiliStatus} 
          pct={newMeiliPct} 
          running={newMeiliRunning || newMeiliStepping}
          onStart={startNewMeiliSync} 
          onReset={async () => {
            const r = await hit('/meili-sync/reset', 'POST');
            log(r.ok ? 'OK ' : 'ERR', `meili-sync/reset ${r.status}`);
            if (r.ok) { toast.success('Reset'); setNewMeiliData(null); }
            poll(true);
          }}
          startLabel={newMeiliStepping ? 'Pausar' : undefined}
          line1={newMeiliRunning 
             ? `Step ${newMeiliData?.step_count ?? '?'} · ${newMeiliData?.processed ?? 0}/${newMeiliData?.total ?? '?'} (${newMeiliPct}%) · ${newMeiliData?.docs_per_second ?? '?'} docs/s`
             : newMeiliStatus === 'completed'
             ? `✅ ${newMeiliData?.indexed ?? newMeiliData?.processed ?? '?'} indexados em ${newMeiliData?.elapsed_human ?? `${newMeiliData?.elapsed_seconds ?? '?'}s`}`
             : newMeiliStatus === 'error'
             ? `❌ Erro: ${(newMeiliData?.last_error ?? '?').slice(0, 80)}`
             : 'Magento → MeiliSearch (100 prods/pg × 3 pgs/step)'}
          line2={newMeiliRunning 
             ? `ETA ${newMeiliData?.eta_human ?? '?'} · ${newMeiliData?.elapsed_human ?? '?'} decorridos · ${newMeiliData?.indexed ?? 0} indexados, ${newMeiliData?.skipped ?? 0} skip, ${newMeiliData?.errors ?? 0} erros`
             : newMeiliStatus === 'completed'
             ? `${newMeiliData?.docs_per_second ?? '?'} docs/s · ${newMeiliData?.step_count ?? '?'} steps · ${newMeiliData?.skipped ?? 0} skip · ${ago(newMeiliData?.completed_at)}`
             : newMeiliStatus === 'error' && newMeiliData?.errors
             ? `${newMeiliData.errors} erros · ${newMeiliData?.processed ?? 0} processados antes do erro`
             : 'Sincroniza direto do Magento → MeiliSearch com ancestor expansion'}
        />

        <OpCard
          title="Sync Produtos (KV Legacy)" icon={<RefreshCw className="w-4 h-4" />}
          status={syncStatus} pct={syncPct} running={syncRunning}
          onStart={startSync} onReset={resetSync}
          line1={syncRunning
            ? `Pagina ${syncData?.current_page ?? '?'}/${syncData?.total_pages ?? '?'} · ${syncData?.downloaded ?? 0} baixados`
            : syncStatus === 'completed' ? `${syncData?.downloaded ?? 0} produtos · ${ago(syncData?.completed_at)}`
            : syncStatus === 'error' ? `Erro: ${syncData?.error ?? '?'}` : 'Parado'}
          line2={syncData ? `${JSON.stringify(syncData).slice(0, 80)}...` : 'sem dados'}
        />
        <OpCard
          title="Sync Imagens (v3 Turbo)" icon={<Download className="w-4 h-4" />}
          status={imgStale ? 'error' : imgStatus} pct={imgPct} running={(imgRunning && !imgStale) || imgStepping}
          onStart={startImgSync} onReset={resetImgSync}
          startLabel={imgStepping ? 'Pausar' : undefined}
          startDisabled={false}
          line1={imgStale
            ? `TRAVADO ha ${imgData?._elapsed_minutes ?? '?'}min — clique Executar (force=1)`
            : imgRunning
            ? `Step ${imgData?.batches_completed ?? '?'} · ${imgData?.processed ?? 0}/${imgData?.total ?? '?'} (${imgData?.progress ?? 0}%) · ${imgData?.imgs_per_second ?? '?'} imgs/s`
            : imgStatus === 'completed'
            ? `✅ ${imgData?.downloaded ?? 0} baixadas · ${imgData?.urls_updated ?? 0} URLs→Storage · ${imgData?.elapsed_human ?? `${imgData?.elapsed_seconds ?? '?'}s`}`
            : imgStatus === 'error' ? `❌ Erro: ${(imgData?.error ?? '?').slice(0, 80)}` : 'Magento → Storage (100 prods/step × 6 paralelo)'}
          line2={imgRunning
            ? `ETA ${imgData?.eta_human ?? '?'} · ${imgData?.elapsed_human ?? '?'} decorridos · ${imgData?.downloaded ?? 0} new / ${imgData?.skipped_existing ?? 0} skip / ${imgData?.copied_dedup ?? 0} dedup`
            : imgStatus === 'completed'
            ? `${imgData?.skipped_existing ?? 0} skip · ${imgData?.copied_dedup ?? 0} dedup · ${imgData?.no_images ?? 0} sem img · ${imgData?.errors ?? 0} erros · ${ago(imgData?.completed_at)}`
            : imgStatus === 'error' && imgData?.processed
            ? `${imgData.processed} processados antes do erro · ${imgData?.downloaded ?? 0} baixadas`
            : 'Download + atualiza URLs no KV e MeiliSearch → Storage'}
        />
        {/* <OpCard
          title="MeiliSearch Index (Legacy)" icon={<Search className="w-4 h-4" />}
          status={meiliStale ? 'error' : meiliStatus}
          pct={meiliStatus === 'completed' ? 100 : meiliPct}
          running={(meiliRunning && !meiliStale) || meiliStepping}
          onStart={startMeiliIndex} onReset={resetMeili}
          startLabel={meiliStepping ? 'Pausar' : undefined}
          startDisabled={false}
          line1={meiliStale
            ? `TRAVADO ha ${meiliData?._elapsed_minutes ?? '?'}min — clique Executar (force=1)`
            : meiliRunning
            ? `${({
                setup: '⚙ Configurando index',
                loading_metadata: '📦 Carregando metadados',
                indexing: `📤 Indexando`,
                waiting_tasks: '⏳ Aguardando MeiliSearch',
              } as Record<string, string>)[meiliData?.phase] ?? `Fase: ${meiliData?.phase ?? '?'}`} · ${meiliData?.indexed ?? 0}/${meiliData?.total ?? '?'} · ${meiliData?.progress ?? 0}%`
            : meiliStatus === 'completed'
            ? `${meiliData?.total ?? 0} docs · ${meiliData?.skipped ? `${meiliData.skipped} pulados · ` : ''}${meiliData?.elapsed_seconds ?? '?'}s · ${ago(meiliData?.completed_at)}`
            : meiliStatus === 'error' ? `Erro: ${(meiliData?.error ?? '?').slice(0, 80)}` : 'Parado — indexe apos sync'}
          line2={meiliStatus === 'completed' && meiliData?.smokeTest
            ? `Smoke: ${meiliData.smokeTest.totalHits} hits · facets: ${(meiliData.smokeTest.facetsReturned || []).join(', ')} · cats=${meiliData.smokeTest.categoryIdsFacetCount}/${meiliData.smokeTest.categoryNamesFacetCount}`
            : meiliRunning && meiliData?.batches_completed
            ? `Batch ${meiliData.batches_completed} · ${meiliData.docs_per_second ?? '?'} docs/s · ETA ${meiliData.eta_human ?? `${meiliData.eta_seconds ?? '?'}s`} · ${meiliData.tasks_queued ?? 0} tasks${meiliData?.pending_tasks != null ? ` · ${meiliData.pending_tasks} pendentes` : ''}`
            : meiliData?._meili_pending_tasks != null && meiliData._meili_pending_tasks > 0
            ? `⏳ ${meiliData._meili_pending_tasks} tasks pendentes no MeiliSearch`
            : meiliStatus === 'idle' ? 'Nenhuma indexacao realizada' : meiliData ? `${JSON.stringify(meiliData).slice(0, 90)}` : 'sem dados'}
        /> */}
        <OpCard
          title="Category Audit" icon={<ClipboardList className="w-4 h-4" />}
          status={auditStale ? 'error' : auditStatus}
          pct={auditStatus === 'completed' ? 100 : (auditData?.progress ?? 0)}
          running={(auditRunning && !auditStale) || auditStepping}
          onStart={startAudit} onReset={resetAudit}
          startLabel={auditStepping ? 'Pausar' : undefined}
          startDisabled={false}
          line1={auditStale
            ? `TRAVADO ha ${auditData?._elapsed_minutes ?? '?'}min — clique Executar para forcar`
            : auditRunning
            ? `${({
                scanning: '📡 Escaneando',
                computing: '🧮 Computando categorias',
              } as Record<string, string>)[auditData?.phase] ?? `Fase: ${auditData?.phase ?? '?'}`} · ${auditData?.scanned ?? 0}/${auditData?.kv_count ?? '?'} · ${auditData?.progress ?? 0}%`
            : auditStatus === 'completed'
            ? `${auditSummary?.effective_coverage_pct ?? '?'}% cobertura · ${auditSummary?.orphans_count ?? 0} orfaos · ${ago(auditData?.completed_at)}`
            : auditStatus === 'error' ? `Erro: ${auditData?.error ?? '?'}` : 'Parado — execute apos sync'}
          line2={auditStatus === 'completed'
            ? `KV: ${auditSummary?.kv_count ?? '?'} | Magento: ${auditSummary?.magento_total ?? '?'} | ${auditSummary?.raw_complete ? 'COMPLETO' : 'INCOMPLETO'}`
            : auditRunning && auditData?.batches_completed
            ? `Batch ${auditData.batches_completed} · ${auditData.scanned ?? 0} scanned`
            : 'sem dados'}
          extraButton={auditStatus === 'completed' ? (
            <Button color="secondary" size="sm" className="h-8 text-xs" onClick={viewAuditReport}>
              <ClipboardList className="w-3 h-3 mr-1" /> Ver Report
            </Button>
          ) : undefined}
        />
        <OpCard
          title="Newsletter Magento Import" icon={<Mail className="w-4 h-4" />}
          status={nlImportStale ? 'error' : nlImportStatus}
          pct={nlImportPct}
          running={(nlImportRunning && !nlImportStale) || nlStepping}
          onStart={startNlImport} onReset={resetNlImport}
          startLabel={nlStepping ? 'Pausar' : undefined}
          startDisabled={false}
          line1={nlImportStale
            ? `TRAVADO ha ${nlImportData?.elapsed_seconds ?? '?'}s — clique Executar para forcar`
            : nlImportRunning
            ? `Pg ${nlImportData?.current_page ?? '?'}/${nlImportData?.total_pages ?? '?'} (${nlImportPct}%) · ${nlImportData?.imported ?? 0} novos · ${nlImportData?.processed ?? 0} processados`
            : nlImportStatus === 'completed'
            ? `✅ ${nlImportData?.imported ?? 0} novos · ${nlImportData?.updated ?? 0} upd · ${nlImportData?.skipped_no_subscription ?? 0} sem sub · ${nlImportData?.elapsed_seconds ?? '?'}s`
            : nlImportStatus === 'error' ? `❌ ${(nlImportData?.last_error ?? '?').slice(0, 80)}` : 'Magento Customers → Newsletter KV (100/pg)'}
          line2={nlImportRunning
            ? `${nlImportData?.skipped_existing ?? 0} existentes · ${nlImportData?.updated ?? 0} atualizados · ${nlImportData?.skipped_no_subscription ?? 0} sem sub · ${nlImportData?.errors ?? 0} erros`
            : nlImportStatus === 'completed'
            ? `Total: ${nlImportData?.total_customers ?? '?'} clientes · ${nlImportData?.skipped_existing ?? 0} existentes · ${nlImportData?.errors ?? 0} erros · ${ago(nlImportData?.completed_at)}`
            : 'Importa mailing de clientes inscritos na newsletter do Magento'}
        />
      </div>

      {/* Console */}
      <div className="rounded-xl border border-border bg-slate-950 overflow-hidden flex flex-col min-h-0 flex-1">
        <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900/80 border-b border-slate-800 flex-shrink-0">
          <div className="flex items-center gap-2 text-[11px] text-slate-500">
            <Terminal className="w-3 h-3" /> Console <span className="text-slate-700">({logs.length})</span>
          </div>
          <div className="flex gap-1">
            <button className="text-[10px] text-slate-500 hover:text-slate-300 px-2 py-0.5 rounded hover:bg-slate-800"
              onClick={() => { copyToClipboard(logs.map(l => `[${l.t}] ${l.lvl} ${l.msg}`).join('\n')); toast.success('Copiado'); }}>
              Copiar
            </button>
            <button className="text-[10px] text-slate-500 hover:text-slate-300 px-2 py-0.5 rounded hover:bg-slate-800"
              onClick={() => { setLogs([]); log('INF', 'Console limpo'); }}>
              Limpar
            </button>
          </div>
        </div>
        <div className="overflow-y-auto flex-1 p-3 font-mono text-[11px] leading-[1.7] select-text">
          {logs.length === 0 ? (
            <span className="text-slate-700">Sem logs ainda. Clique "Carregar Status" para conectar aos serviços.</span>
          ) : (
            logs.map((l, i) => (
              <div key={i} className={`${C[l.lvl] ?? 'text-slate-400'} whitespace-pre-wrap break-all`}>
                <span className="text-slate-600">{l.t}</span>{' '}
                <span className={C[l.lvl] ?? 'text-slate-400'}>{l.lvl}</span>{' '}
                {l.msg}
              </div>
            ))
          )}
          <div ref={endRef} />
        </div>
      </div>
    </div>
  );
}

// ─── Operation Card ──────────────────────────────────────────────────────────

function OpCard({
  title, icon, status, pct, running, onStart, onReset, line1, line2, extraButton,
  startLabel, startDisabled,
}: {
  title: string; icon: React.ReactNode; status: string; pct: number;
  running: boolean; onStart: () => void; onReset: () => void; line1: string; line2: string;
  extraButton?: React.ReactNode;
  startLabel?: string;
  startDisabled?: boolean;
}) {
  const p = Math.min(Math.max(pct, 0), 100);
  const barColor = status === 'error' ? 'bg-destructive' : status === 'completed' ? 'bg-success' : 'bg-primary';
  const badge =
    status === 'running' || status === 'batch_done' ? <Loader2 className="w-4 h-4 animate-spin text-primary" />
    : status === 'completed' ? <CheckCircle2 className="w-4 h-4 text-success" />
    : status === 'error' ? <XCircle className="w-4 h-4 text-destructive" />
    : <Circle className="w-4 h-4 text-muted-foreground/50" />;

  return (
    <div className="rounded-lg border border-border bg-card shadow-sm p-5 space-y-4 hover:shadow-md transition-shadow duration-300">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-primary/10 text-primary">
            {icon}
          </div>
          <h3 className="font-semibold text-sm text-foreground">{title}</h3>
        </div>
        <div className="flex items-center gap-2">
          {badge}
          {(running || status === 'completed') && (
            <span className="font-mono text-xs font-semibold text-foreground">{status === 'completed' ? '100' : p}%</span>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex justify-between text-xs font-medium text-muted-foreground uppercase tracking-wider">
          <span>Progresso</span>
          <span>{status === 'idle' ? 'Aguardando' : status}</span>
        </div>
        <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
          <div 
            className={`h-full rounded-full transition-all duration-1000 ease-out ${barColor}`} 
            style={{ width: `${status === 'completed' ? 100 : p}%` }} 
          />
        </div>
      </div>

      <div className="bg-muted rounded-lg p-3 space-y-1 border border-border">
        <div className="text-sm text-foreground/80 font-medium truncate">{line1}</div>
        <div className="text-xs font-mono text-muted-foreground truncate" title={line2}>{line2}</div>
      </div>

      <div className="flex gap-2 pt-1">
        <Button 
          color="primary"
          size="sm" 
          className={`flex-1 h-9 text-sm font-medium shadow-none ${running && !startLabel ? 'bg-muted text-muted-foreground hover:bg-muted/80' : ''}`}
          onClick={onStart} 
          disabled={startDisabled ?? (running && !startLabel)}
        >
          {running && !startLabel
            ? <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />Processando</>
            : startLabel
            ? <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />{startLabel}</>
            : <><Play className="w-3.5 h-3.5 mr-2 fill-current" />Executar</>}
        </Button>
        {extraButton}
        {status !== 'idle' && (
          <Button color="tertiary" size="sm" className="h-9 w-9 p-0 text-muted-foreground hover:text-foreground" onClick={onReset} title="Resetar estado">
            <RefreshCw className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  );
}