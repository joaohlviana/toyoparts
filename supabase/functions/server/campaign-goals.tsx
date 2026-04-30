import { Hono } from 'npm:hono';
import * as kv from './kv_store.tsx';
import {
  getCampaignGoalsConfig,
  getPublicCampaignGoalsConfig,
  saveCampaignGoalsConfig,
} from './marketing.tsx';

export const campaignGoalsPublic = new Hono();
export const campaignGoalsAdmin = new Hono();

const GOAL_EVENTS = new Set(['purchase_paid', 'whatsapp_banner_lead']);
const MS_PER_DAY = 86_400_000;

function parseTimestamp(value: unknown): number {
  const time = new Date(String(value || '')).getTime();
  return Number.isFinite(time) ? time : 0;
}

function readEnv(name: string): string {
  return String(Deno.env.get(name) || '').trim();
}

function normalizeStatus(ok: boolean, warning = false) {
  if (ok) return 'ok';
  return warning ? 'warning' : 'error';
}

async function getRecentGoalCounts(days = 7) {
  const events = await kv.getByPrefix('event_log:').catch(() => []);
  const startAt = Date.now() - (days * MS_PER_DAY);
  const counts = {
    purchase_paid: 0,
    whatsapp_banner_lead: 0,
  };

  for (const event of Array.isArray(events) ? events : []) {
    const eventName = String(event?.event_name || '').trim();
    if (!GOAL_EVENTS.has(eventName)) continue;
    const timestamp = parseTimestamp(event?.event_time || event?._meta?.logged_at);
    if (!timestamp || timestamp < startAt) continue;
    if (eventName === 'purchase_paid') counts.purchase_paid += 1;
    if (eventName === 'whatsapp_banner_lead') counts.whatsapp_banner_lead += 1;
  }

  return counts;
}

function buildHealthChecks(config: Awaited<ReturnType<typeof getCampaignGoalsConfig>>, counts: Awaited<ReturnType<typeof getRecentGoalCounts>>) {
  const googleServerReady = Boolean(
    readEnv('GOOGLE_ADS_DEVELOPER_TOKEN')
    && readEnv('GOOGLE_ADS_CUSTOMER_ID')
    && readEnv('GOOGLE_ADS_CONVERSION_ACTION_PURCHASE_ID')
    && readEnv('GOOGLE_ADS_CLIENT_ID')
    && readEnv('GOOGLE_ADS_CLIENT_SECRET')
    && readEnv('GOOGLE_ADS_REFRESH_TOKEN'),
  );

  const checks = [
    {
      key: 'posthog',
      label: 'PostHog',
      status: normalizeStatus(Boolean(config.posthogHost && config.posthogProjectId)),
      detail: config.posthogHost && config.posthogProjectId
        ? 'Replay e analise de navegacao configurados.'
        : 'Defina POSTHOG_HOST e POSTHOG_PROJECT_ID para habilitar replays.',
    },
    {
      key: 'google_client',
      label: 'Google Tag',
      status: normalizeStatus(Boolean(config.googleAdsTagId && config.googleAdsWhatsappLeadLabel), !config.googleAdsWhatsappLeadLabel),
      detail: config.googleAdsTagId
        ? 'Tag publica carregavel no frontend.'
        : 'VITE_PUBLIC_GOOGLE_ADS_TAG_ID ainda nao configurado.',
    },
    {
      key: 'google_purchase',
      label: 'Google Purchase Server-Side',
      status: normalizeStatus(googleServerReady, !googleServerReady),
      detail: googleServerReady
        ? 'Credenciais suficientes para relay server-side estao presentes.'
        : 'Faltam credenciais da Google Ads API para upload offline de compra.',
    },
    {
      key: 'meta_pixel',
      label: 'Meta Pixel',
      status: normalizeStatus(Boolean(config.metaPixelId), !config.metaPixelId),
      detail: config.metaPixelId
        ? 'Pixel publico disponivel no frontend.'
        : 'VITE_PUBLIC_META_PIXEL_ID ainda nao configurado.',
    },
    {
      key: 'meta_capi',
      label: 'Meta CAPI',
      status: normalizeStatus(Boolean(config.metaConversionsApiEnabled), !config.metaConversionsApiEnabled),
      detail: config.metaConversionsApiEnabled
        ? 'Webhook de compra ja pode relayar Purchase/Lead para Meta.'
        : 'META_ACCESS_TOKEN e META_PIXEL_ID sao necessarios para a CAPI.',
    },
    {
      key: 'lead_value_fallback',
      label: 'Fallback do Lead WhatsApp',
      status: normalizeStatus(Boolean((config.fallbackWhatsappLeadValue || 0) > 0), true),
      detail: (config.fallbackWhatsappLeadValue || 0) > 0
        ? `Fallback configurado em R$ ${Number(config.fallbackWhatsappLeadValue || 0).toFixed(2)}.`
        : 'Banners genericos sem produto/checkout nao vao converter sem fallback.',
    },
    {
      key: 'recent_goals',
      label: 'Metas Recentes',
      status: normalizeStatus(Boolean(counts.purchase_paid || counts.whatsapp_banner_lead), true),
      detail: `${counts.purchase_paid} compras pagas e ${counts.whatsapp_banner_lead} leads WhatsApp nos ultimos 7 dias.`,
    },
  ];

  const pending = checks
    .filter((check) => check.status !== 'ok')
    .map((check) => check.detail);

  return {
    checks,
    pending,
    google: {
      tag_ready: Boolean(config.googleAdsTagId),
      whatsapp_lead_ready: Boolean(config.googleAdsTagId && config.googleAdsWhatsappLeadLabel),
      purchase_client_label_ready: Boolean(config.googleAdsTagId && config.googleAdsPurchaseLabel),
      purchase_server_ready: googleServerReady,
    },
    meta: {
      pixel_ready: Boolean(config.metaPixelId),
      capi_ready: Boolean(config.metaConversionsApiEnabled),
    },
    posthog: {
      host_ready: Boolean(config.posthogHost),
      project_ready: Boolean(config.posthogProjectId),
      replay_ready: Boolean(config.posthogHost && config.posthogProjectId),
    },
  };
}

campaignGoalsPublic.get('/public-config', async (c) => {
  const config = await getCampaignGoalsConfig();
  return c.json({
    ...getPublicCampaignGoalsConfig(config),
    generated_at: new Date().toISOString(),
  });
});

campaignGoalsAdmin.get('/config', async (c) => {
  const config = await getCampaignGoalsConfig();
  return c.json(config);
});

campaignGoalsAdmin.put('/config', async (c) => {
  try {
    const body = await c.req.json();
    const updatedBy = String(c.req.header('X-Admin-Token') || 'admin').slice(0, 16);
    const config = await saveCampaignGoalsConfig(body || {}, updatedBy);
    return c.json(config);
  } catch (error: any) {
    return c.json({ error: error?.message || 'Failed to update campaign goals config.' }, 500);
  }
});

campaignGoalsAdmin.get('/health', async (c) => {
  const config = await getCampaignGoalsConfig();
  const recent_goal_counts = await getRecentGoalCounts(7);
  const health = buildHealthChecks(config, recent_goal_counts);

  return c.json({
    generated_at: new Date().toISOString(),
    config: {
      fallbackWhatsappLeadValue: config.fallbackWhatsappLeadValue,
      enablePurchaseGoal: config.enablePurchaseGoal,
      enableWhatsappLeadGoal: config.enableWhatsappLeadGoal,
      googleAdsTagId: config.googleAdsTagId,
      googleAdsPurchaseLabel: config.googleAdsPurchaseLabel,
      googleAdsWhatsappLeadLabel: config.googleAdsWhatsappLeadLabel,
      metaPixelId: config.metaPixelId,
      metaConversionsApiEnabled: config.metaConversionsApiEnabled,
      posthogHost: config.posthogHost,
      posthogProjectId: config.posthogProjectId,
      updatedAt: config.updatedAt,
      updatedBy: config.updatedBy,
    },
    recent_goal_counts,
    ...health,
  });
});
