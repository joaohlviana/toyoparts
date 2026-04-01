import { Hono } from 'npm:hono';
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import * as kv from './kv_store.tsx';
import {
  CUSTOMER_ACCOUNT_ORDERS_URL,
  CUSTOMER_AUTH_CALLBACK_URL,
  CUSTOMER_EMAIL_LOGO_URL,
  CUSTOMER_SUPPORT_EMAIL,
  CUSTOMER_WHATSAPP_URL,
  PRIMARY_CUSTOMER_URL,
} from './customer-links.tsx';

export const resend = new Hono();

const CONFIG_KEY = 'resend:config';
const TEMPLATE_PREFIX = 'resend:template:';
const RESEND_FALLBACK_FROM = 'Toyoparts <onboarding@resend.dev>';
const DEFAULT_FROM_EMAIL = 'noreply@toyoparts.com.br';

type Placeholder = { key: string; desc: string };
type TemplateDefinition = {
  id: string;
  name: string;
  description: string;
  category: string;
  subject: string;
  placeholders: Placeholder[];
};

const COMMON_PLACEHOLDERS: Placeholder[] = [
  { key: '{{name}}', desc: 'Nome do cliente ou usuario' },
  { key: '{{email}}', desc: 'E-mail completo do destinatario' },
  { key: '{{logo_url}}', desc: 'URL da logo oficial da Toyoparts para e-mails' },
  { key: '{{site_url}}', desc: 'URL principal da loja' },
  { key: '{{support_email}}', desc: 'E-mail oficial de suporte' },
  { key: '{{whatsapp_url}}', desc: 'Link oficial do WhatsApp' },
  { key: '{{account_orders_url}}', desc: 'URL da area de pedidos do cliente' },
];

function brandHeaderRow() {
  return `
          <tr>
            <td style="background:linear-gradient(180deg,#fff6f6 0%,#ffffff 100%);padding:24px 40px;border-bottom:1px solid #fee2e2;">
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td>
                    <div style="display:inline-block;background:#ffffff;border:1px solid #fecaca;border-radius:16px;padding:12px 16px;">
                      <img src="{{logo_url}}" alt="Toyoparts" width="186" style="display:block;width:186px;max-width:100%;height:auto;border:0;">
                    </div>
                  </td>
                  <td align="right" style="vertical-align:middle;">
                    <span style="font-size:12px;color:#991b1b;font-weight:700;letter-spacing:0.6px;">Pecas Toyota</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
  `;
}

function upgradeStoredTemplateBranding(html: string) {
  if (!html || html.includes('{{logo_url}}')) {
    return html;
  }

  return html.replace(
    /<tr>\s*<td style="background:#EB0A1E;padding:26px 40px;">[\s\S]*?<\/td>\s*<\/tr>/,
    brandHeaderRow(),
  );
}

function mergePlaceholders(...groups: Placeholder[][]): Placeholder[] {
  const map = new Map<string, string>();
  groups.flat().forEach((item) => map.set(item.key, item.desc));
  return Array.from(map.entries()).map(([key, desc]) => ({ key, desc }));
}

const TEMPLATE_META: Record<string, TemplateDefinition> = {
  magic_link: {
    id: 'magic_link',
    name: 'Magic Link de Acesso',
    description: 'Enviado quando o cliente solicita login por e-mail',
    category: 'Autenticacao',
    subject: 'Seu link de acesso - Toyoparts',
    placeholders: mergePlaceholders(COMMON_PLACEHOLDERS, [
      { key: '{{magic_link}}', desc: 'URL do link de acesso gerado pelo Supabase' },
      { key: '{{expires_in}}', desc: 'Validade do link' },
    ]),
  },
  order_confirmation: {
    id: 'order_confirmation',
    name: 'Confirmacao de Pedido',
    description: 'Enviado apos a finalizacao do pedido',
    category: 'Pedidos',
    subject: 'Pedido #{{order_id}} confirmado - Toyoparts',
    placeholders: mergePlaceholders(COMMON_PLACEHOLDERS, [
      { key: '{{order_id}}', desc: 'Numero do pedido' },
      { key: '{{order_total}}', desc: 'Valor total formatado' },
      { key: '{{order_date}}', desc: 'Data do pedido' },
      { key: '{{items_html}}', desc: 'HTML da lista de itens do pedido' },
    ]),
  },
  order_shipped: {
    id: 'order_shipped',
    name: 'Pedido Enviado',
    description: 'Notificacao de despacho do pedido',
    category: 'Pedidos',
    subject: 'Seu pedido #{{order_id}} foi enviado - Toyoparts',
    placeholders: mergePlaceholders(COMMON_PLACEHOLDERS, [
      { key: '{{order_id}}', desc: 'Numero do pedido' },
      { key: '{{tracking_code}}', desc: 'Codigo de rastreamento' },
      { key: '{{carrier}}', desc: 'Nome da transportadora' },
      { key: '{{estimated_delivery}}', desc: 'Prazo estimado' },
    ]),
  },
  order_delivered: {
    id: 'order_delivered',
    name: 'Pedido Entregue',
    description: 'Confirmacao de entrega do pedido',
    category: 'Pedidos',
    subject: 'Seu pedido chegou - Toyoparts',
    placeholders: mergePlaceholders(COMMON_PLACEHOLDERS, [
      { key: '{{order_id}}', desc: 'Numero do pedido' },
    ]),
  },
  welcome_newsletter: {
    id: 'welcome_newsletter',
    name: 'Boas-vindas Newsletter',
    description: 'Boas-vindas para novos inscritos',
    category: 'Marketing',
    subject: 'Bem-vindo a Toyoparts!',
    placeholders: mergePlaceholders(COMMON_PLACEHOLDERS, []),
  },
  password_recovery: {
    id: 'password_recovery',
    name: 'Recuperacao de Senha',
    description: 'Link de redefinicao de senha',
    category: 'Autenticacao',
    subject: 'Redefina sua senha - Toyoparts',
    placeholders: mergePlaceholders(COMMON_PLACEHOLDERS, [
      { key: '{{recovery_link}}', desc: 'URL de redefinicao de senha' },
      { key: '{{expires_in}}', desc: 'Validade do link' },
    ]),
  },
};

function baseLayout(content: string, preheader = '') {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Toyoparts</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica Neue,Arial,sans-serif;">
  ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;font-size:1px;">${preheader}</div>` : ''}
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f5f5f7;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px;width:100%;background:#ffffff;border-radius:22px;overflow:hidden;box-shadow:0 8px 40px rgba(15,23,42,0.08);">
          ${brandHeaderRow()}
          <tr>
            <td style="padding:40px 40px 34px;">
              ${content}
            </td>
          </tr>
          <tr>
            <td style="background:#f8fafc;border-top:1px solid #eef2f7;padding:24px 40px;">
              <p style="margin:0 0 8px;font-size:13px;color:#475569;line-height:1.6;text-align:center;">Toyoparts · Pecas genuinas e acessorios Toyota.</p>
              <p style="margin:0 0 10px;font-size:12px;color:#64748b;line-height:1.7;text-align:center;">
                <a href="mailto:{{support_email}}" style="color:#475569;text-decoration:none;">{{support_email}}</a>
                <span style="margin:0 8px;color:#cbd5e1;">|</span>
                <a href="{{whatsapp_url}}" style="color:#475569;text-decoration:none;">WhatsApp</a>
                <span style="margin:0 8px;color:#cbd5e1;">|</span>
                <a href="{{site_url}}" style="color:#475569;text-decoration:none;">{{site_url}}</a>
              </p>
              <p style="margin:0;font-size:11px;color:#94a3b8;text-align:center;">© ${new Date().getFullYear()} Toyoparts. Todos os direitos reservados.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function infoCard(label: string, value: string, tone: 'neutral' | 'warning' | 'success' = 'neutral') {
  const styles = tone === 'warning'
    ? 'background:#fff8f1;border:1px solid #fed7aa;color:#9a3412;'
    : tone === 'success'
      ? 'background:#f0fdf4;border:1px solid #bbf7d0;color:#166534;'
      : 'background:#f8fafc;border:1px solid #e5e7eb;color:#334155;';

  return `
    <div style="${styles}border-radius:16px;padding:16px 18px;margin:18px 0;">
      <p style="margin:0 0 6px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;opacity:0.82;">${label}</p>
      <p style="margin:0;font-size:15px;font-weight:600;line-height:1.6;">${value}</p>
    </div>
  `;
}

function identityCard() {
  return `
    <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:18px;padding:18px 20px;margin:24px 0;">
      <p style="margin:0 0 10px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;">Identificacao do destinatario</p>
      <p style="margin:0 0 4px;font-size:18px;font-weight:700;color:#111827;">{{name}}</p>
      <p style="margin:0;font-size:14px;color:#475569;">{{email}}</p>
    </div>
  `;
}

function ctaButton(urlPlaceholder: string, label: string) {
  return `
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:30px 0;">
      <tr>
        <td align="center">
          <a href="${urlPlaceholder}" style="display:inline-block;background:#EB0A1E;color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;padding:16px 36px;border-radius:14px;">
            ${label}
          </a>
        </td>
      </tr>
    </table>
  `;
}

function helperLinksBlock() {
  return `
    <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:18px;padding:18px 20px;margin:24px 0 0;">
      <p style="margin:0 0 10px;font-size:13px;font-weight:700;color:#0f172a;">Precisa de ajuda?</p>
      <p style="margin:0;font-size:14px;line-height:1.7;color:#475569;">
        Fale com o nosso time pelo
        <a href="{{whatsapp_url}}" style="color:#EB0A1E;text-decoration:none;font-weight:600;">WhatsApp</a>
        ou envie um e-mail para
        <a href="mailto:{{support_email}}" style="color:#EB0A1E;text-decoration:none;font-weight:600;">{{support_email}}</a>.
      </p>
    </div>
  `;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceTemplatePlaceholders(input: string, values: Record<string, string>) {
  return Object.entries(values).reduce((output, [key, value]) => {
    return output.replace(new RegExp(`\\{\\{${escapeRegExp(key)}\\}\\}`, 'g'), value);
  }, input);
}

function buildCommonTemplateData(email: string, name?: string) {
  const safeEmail = (email || '').trim().toLowerCase();
  const fallbackName = safeEmail.split('@')[0] || 'Cliente';
  const resolvedName = (name || fallbackName).trim();

  return {
    name: resolvedName,
    email: safeEmail,
    logo_url: CUSTOMER_EMAIL_LOGO_URL,
    site_url: PRIMARY_CUSTOMER_URL,
    support_email: CUSTOMER_SUPPORT_EMAIL,
    whatsapp_url: CUSTOMER_WHATSAPP_URL,
    account_orders_url: CUSTOMER_ACCOUNT_ORDERS_URL,
  };
}

function isAlreadyRegisteredError(message: string) {
  return /already.*registered|already.*exists|already been registered|email.*exists|user.*already/i.test(message || '');
}

async function ensureAuthUser(supabase: any, email: string, name?: string) {
  const safeEmail = (email || '').trim().toLowerCase();
  if (!safeEmail) {
    throw new Error('E-mail invalido para gerar magic link.');
  }

  const common = buildCommonTemplateData(safeEmail, name);
  const { error } = await supabase.auth.admin.createUser({
    email: safeEmail,
    password: `${crypto.randomUUID()}Aa1!`,
    email_confirm: true,
    user_metadata: {
      name: common.name,
      customer_email: safeEmail,
      source: 'toyoparts_magic_link',
    },
  });

  if (error && !isAlreadyRegisteredError(error.message)) {
    throw error;
  }
}

function renderTemplateHtml(templateHtml: string, values: Record<string, string>) {
  return replaceTemplatePlaceholders(templateHtml, values);
}

function defaultTemplateHtml() {
  return {
    magic_link: baseLayout(`
      <p style="margin:0 0 10px;font-size:12px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#EB0A1E;">Acesso seguro a sua conta</p>
      <h2 style="margin:0 0 12px;font-size:30px;font-weight:800;color:#111827;line-height:1.2;">Seu magic link Toyoparts esta pronto.</h2>
      <p style="margin:0;font-size:16px;color:#475569;line-height:1.8;">Use o botao abaixo para entrar na sua conta e acompanhar pedidos, rastreios e historico de compras sem precisar de senha.</p>
      ${identityCard()}
      ${infoCard('Link emitido para', '{{email}}')}
      ${ctaButton('{{magic_link}}', 'Acessar minha conta')}
      ${infoCard('Validade do link', 'Este acesso expira em {{expires_in}}. Use somente neste e-mail.', 'warning')}
      <p style="margin:18px 0 0;font-size:13px;color:#64748b;line-height:1.7;">Se voce nao solicitou este acesso, ignore esta mensagem com seguranca. Nenhuma alteracao sera feita sem o clique no link.</p>
      ${helperLinksBlock()}
    `, 'Seu link seguro de acesso a Toyoparts chegou'),

    order_confirmation: baseLayout(`
      <p style="margin:0 0 10px;font-size:12px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#EB0A1E;">Pedido recebido</p>
      <h2 style="margin:0 0 12px;font-size:30px;font-weight:800;color:#111827;line-height:1.2;">Seu pedido foi confirmado.</h2>
      <p style="margin:0;font-size:16px;color:#475569;line-height:1.8;">Recebemos sua compra com sucesso e ja iniciamos a preparacao dos itens.</p>
      ${identityCard()}
      ${infoCard('Pedido', '#{{order_id}}')}
      <div style="margin:22px 0;">{{items_html}}</div>
      ${infoCard('Total do pedido', '{{order_total}}', 'success')}
      <p style="margin:18px 0 0;font-size:14px;color:#64748b;">Data do pedido: {{order_date}}</p>
      ${ctaButton('{{account_orders_url}}', 'Acompanhar meus pedidos')}
      ${helperLinksBlock()}
    `, 'Seu pedido Toyoparts foi confirmado'),

    order_shipped: baseLayout(`
      <p style="margin:0 0 10px;font-size:12px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#16a34a;">Pedido em transito</p>
      <h2 style="margin:0 0 12px;font-size:30px;font-weight:800;color:#111827;line-height:1.2;">Seu pedido saiu para entrega.</h2>
      <p style="margin:0;font-size:16px;color:#475569;line-height:1.8;">Boa noticia: o pedido <strong>#{{order_id}}</strong> foi despachado e ja esta em movimento.</p>
      ${identityCard()}
      ${infoCard('Codigo de rastreio', '{{tracking_code}}', 'success')}
      ${infoCard('Transportadora', '{{carrier}}')}
      ${infoCard('Prazo estimado', '{{estimated_delivery}}')}
      ${ctaButton('{{account_orders_url}}', 'Ver pedido no painel')}
      ${helperLinksBlock()}
    `, 'Seu pedido foi enviado e ja pode ser acompanhado'),

    order_delivered: baseLayout(`
      <p style="margin:0 0 10px;font-size:12px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#16a34a;">Entrega concluida</p>
      <h2 style="margin:0 0 12px;font-size:30px;font-weight:800;color:#111827;line-height:1.2;">Seu pedido chegou.</h2>
      <p style="margin:0;font-size:16px;color:#475569;line-height:1.8;">O pedido <strong>#{{order_id}}</strong> foi marcado como entregue. Esperamos que a experiencia tenha sido excelente.</p>
      ${identityCard()}
      ${infoCard('Pedido entregue', '#{{order_id}}', 'success')}
      ${ctaButton('{{account_orders_url}}', 'Abrir minha conta')}
      <p style="margin:18px 0 0;font-size:14px;color:#64748b;line-height:1.7;">Se precisar de suporte pos-entrega, fale com nosso time. Estamos prontos para ajudar.</p>
      ${helperLinksBlock()}
    `, 'Seu pedido foi entregue'),

    welcome_newsletter: baseLayout(`
      <p style="margin:0 0 10px;font-size:12px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#EB0A1E;">Bem-vindo a Toyoparts</p>
      <h2 style="margin:0 0 12px;font-size:30px;font-weight:800;color:#111827;line-height:1.2;">Sua inscricao esta confirmada.</h2>
      <p style="margin:0;font-size:16px;color:#475569;line-height:1.8;">A partir de agora voce recebe novidades, oportunidades e conteudos da linha Toyota.</p>
      ${identityCard()}
      ${infoCard('Inscricao vinculada ao e-mail', '{{email}}')}
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:18px 0 0;">
        <tr><td style="padding:10px 0;border-bottom:1px solid #eef2f7;font-size:14px;color:#334155;">Lancamentos e reposicao de pecas</td></tr>
        <tr><td style="padding:10px 0;border-bottom:1px solid #eef2f7;font-size:14px;color:#334155;">Ofertas e campanhas exclusivas</td></tr>
        <tr><td style="padding:10px 0;font-size:14px;color:#334155;">Dicas de manutencao e compra</td></tr>
      </table>
      ${ctaButton('{{site_url}}', 'Explorar catalogo')}
      ${helperLinksBlock()}
    `, 'Bem-vindo a newsletter Toyoparts'),

    password_recovery: baseLayout(`
      <p style="margin:0 0 10px;font-size:12px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#EB0A1E;">Recuperacao de senha</p>
      <h2 style="margin:0 0 12px;font-size:30px;font-weight:800;color:#111827;line-height:1.2;">Crie uma nova senha com seguranca.</h2>
      <p style="margin:0;font-size:16px;color:#475569;line-height:1.8;">Recebemos um pedido para redefinir a senha da sua conta Toyoparts. Use o botao abaixo para continuar.</p>
      ${identityCard()}
      ${ctaButton('{{recovery_link}}', 'Redefinir senha')}
      ${infoCard('Validade do link', 'Este acesso expira em {{expires_in}}.', 'warning')}
      <p style="margin:18px 0 0;font-size:13px;color:#64748b;line-height:1.7;">Se voce nao pediu a redefinicao, ignore este e-mail. Sua senha atual continuara protegida.</p>
      ${helperLinksBlock()}
    `, 'Solicitacao para redefinir a senha da sua conta'),
  };
}

const DEFAULT_HTML = defaultTemplateHtml();

async function sendWithFallback(
  apiKey: string,
  payload: { from: string; to: string[]; subject: string; html: string },
): Promise<{ data: any; usedFallback: boolean }> {
  const res1 = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data1 = await res1.json();

  if (res1.ok) return { data: data1, usedFallback: false };

  const isDomainError = res1.status === 403 && /domain.*not verified/i.test(data1.message || '');
  if (!isDomainError) {
    throw Object.assign(new Error(data1.message || 'Resend API error'), { detail: data1, status: res1.status });
  }

  const res2 = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, from: RESEND_FALLBACK_FROM }),
  });
  const data2 = await res2.json();
  if (!res2.ok) {
    throw Object.assign(new Error(data2.message || 'Resend fallback also failed'), { detail: data2, status: res2.status });
  }

  return { data: data2, usedFallback: true };
}

function createSupabaseAdmin() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

function normalizeResendConfig(raw: any) {
  const config = { ...(raw || {}) };
  if (config.from_email === 'noreply@toyopar.com.br') {
    config.from_email = DEFAULT_FROM_EMAIL;
  }
  return config;
}

async function getStoredTemplate(id: string) {
  const stored = await kv.get(`${TEMPLATE_PREFIX}${id}`);
  if (stored) {
    const upgradedHtml = upgradeStoredTemplateBranding(stored.html || '');
    if (upgradedHtml !== (stored.html || '')) {
      const upgraded = {
        ...stored,
        html: upgradedHtml,
        updated_at: new Date().toISOString(),
      };
      await kv.set(`${TEMPLATE_PREFIX}${id}`, upgraded);
      return upgraded;
    }
    return stored;
  }
  return {
    ...TEMPLATE_META[id],
    html: DEFAULT_HTML[id] || '<p>Template padrao nao disponivel</p>',
    customized: false,
  };
}

function buildSubject(template: any, values: Record<string, string>) {
  return renderTemplateHtml(template.subject || '', values);
}

resend.get('/config', async (c) => {
  try {
    const rawConfig = await kv.get(CONFIG_KEY);
    const config = normalizeResendConfig(rawConfig);
    const apiKey = (Deno.env.get('RESEND_API') || '').trim();

    if ((rawConfig?.from_email || '') !== (config.from_email || '') && config.from_email) {
      await kv.set(CONFIG_KEY, { ...config, updated_at: new Date().toISOString() });
    }

    return c.json({
      from_email: config.from_email || DEFAULT_FROM_EMAIL,
      from_name: config.from_name || 'Toyoparts',
      magic_link_enabled: config.magic_link_enabled ?? false,
      api_key_configured: !!apiKey,
    });
  } catch (e: any) {
    console.error('[Resend] GET /config error:', e.message);
    return c.json({ error: e.message }, 500);
  }
});

resend.post('/config', async (c) => {
  try {
    const body = await c.req.json();
    const existing = normalizeResendConfig(await kv.get(CONFIG_KEY));
    const updated = { ...existing, ...body, updated_at: new Date().toISOString() };
    await kv.set(CONFIG_KEY, updated);
    return c.json({ ok: true });
  } catch (e: any) {
    console.error('[Resend] POST /config error:', e.message);
    return c.json({ error: e.message }, 500);
  }
});

resend.post('/test', async (c) => {
  try {
    const { to } = await c.req.json();
    if (!to) return c.json({ error: 'Campo "to" e obrigatorio' }, 400);

    const apiKey = (Deno.env.get('RESEND_API') || '').trim();
    if (!apiKey) return c.json({ error: 'RESEND_API nao configurado no ambiente' }, 400);

    const config = normalizeResendConfig(await kv.get(CONFIG_KEY));
    const fromName = config.from_name || 'Toyoparts';
    const fromEmail = config.from_email || DEFAULT_FROM_EMAIL;

    const html = renderTemplateHtml(baseLayout(`
      <h2 style="margin:0 0 12px;font-size:28px;font-weight:700;color:#111827;">Tudo funcionando.</h2>
      <p style="margin:0;font-size:16px;color:#475569;line-height:1.8;">Este e-mail de teste confirma que a integracao do Resend esta operacional.</p>
      ${infoCard('Destinatario', '{{email}}')}
      ${infoCard('Remetente configurado', `${fromName} <${fromEmail}>`, 'success')}
      ${helperLinksBlock()}
    `, 'Teste da configuracao de e-mail Toyoparts'), buildCommonTemplateData(to));

    const { data } = await sendWithFallback(apiKey, {
      from: `${fromName} <${fromEmail}>`,
      to: [to],
      subject: 'Teste de e-mail - Toyoparts',
      html,
    });

    return c.json({ ok: true, id: data.id });
  } catch (e: any) {
    console.error('[Resend] POST /test error:', e.message);
    return c.json({ error: e.message }, 500);
  }
});

resend.get('/templates', async (c) => {
  try {
    const templates = await Promise.all(
      Object.keys(TEMPLATE_META).map(async (id) => {
        const stored = await kv.get(`${TEMPLATE_PREFIX}${id}`);
        return {
          ...TEMPLATE_META[id],
          customized: !!stored,
          updated_at: stored?.updated_at || null,
        };
      }),
    );
    return c.json({ templates });
  } catch (e: any) {
    console.error('[Resend] GET /templates error:', e.message);
    return c.json({ error: e.message }, 500);
  }
});

resend.get('/templates/:id', async (c) => {
  try {
    const id = c.req.param('id');
    if (!TEMPLATE_META[id]) return c.json({ error: 'Template nao encontrado' }, 404);
    return c.json(await getStoredTemplate(id));
  } catch (e: any) {
    console.error('[Resend] GET /templates/:id error:', e.message);
    return c.json({ error: e.message }, 500);
  }
});

resend.post('/templates/:id', async (c) => {
  try {
    const id = c.req.param('id');
    if (!TEMPLATE_META[id]) return c.json({ error: 'Template nao encontrado' }, 404);

    const body = await c.req.json();
    const stored = {
      ...TEMPLATE_META[id],
      ...body,
      id,
      updated_at: new Date().toISOString(),
    };
    await kv.set(`${TEMPLATE_PREFIX}${id}`, stored);
    return c.json({ ok: true });
  } catch (e: any) {
    console.error('[Resend] POST /templates/:id error:', e.message);
    return c.json({ error: e.message }, 500);
  }
});

resend.delete('/templates/:id', async (c) => {
  try {
    await kv.del(`${TEMPLATE_PREFIX}${c.req.param('id')}`);
    return c.json({ ok: true });
  } catch (e: any) {
    console.error('[Resend] DELETE /templates/:id error:', e.message);
    return c.json({ error: e.message }, 500);
  }
});

resend.post('/magic-link', async (c) => {
  try {
    const { email, name } = await c.req.json();
    const safeEmail = (email || '').trim().toLowerCase();
    if (!safeEmail) return c.json({ error: 'E-mail e obrigatorio' }, 400);

    const apiKey = (Deno.env.get('RESEND_API') || '').trim();
    if (!apiKey) return c.json({ error: 'RESEND_API nao configurado no ambiente' }, 400);

    const config = normalizeResendConfig(await kv.get(CONFIG_KEY));
    if (!config.magic_link_enabled) {
      return c.json({ error: 'Envio de magic link via Resend nao esta habilitado.' }, 400);
    }

    const supabase = createSupabaseAdmin();
    await ensureAuthUser(supabase, safeEmail, name);

    const { data, error } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: safeEmail,
      options: {
        redirectTo: CUSTOMER_AUTH_CALLBACK_URL,
      },
    });

    if (error || !data?.properties?.action_link) {
      console.error('[Resend] magic-link generateLink error:', error);
      return c.json({ error: error?.message || 'Falha ao gerar magic link no Supabase' }, 500);
    }

    const common = buildCommonTemplateData(safeEmail, name);
    const template = await getStoredTemplate('magic_link');
    const magicLink = data.properties.action_link;
    const html = renderTemplateHtml(template.html, {
      ...common,
      magic_link: magicLink,
      expires_in: '24 horas',
    });
    const subject = buildSubject(template, {
      ...common,
      magic_link: magicLink,
      expires_in: '24 horas',
    }) || 'Seu link de acesso - Toyoparts';

    const fromName = config.from_name || 'Toyoparts';
    const fromEmail = config.from_email || DEFAULT_FROM_EMAIL;
    const { data: resData, usedFallback } = await sendWithFallback(apiKey, {
      from: `${fromName} <${fromEmail}>`,
      to: [safeEmail],
      subject,
      html,
    });

    console.log('[Resend] Magic link sent:', resData.id, '->', safeEmail, usedFallback ? '(fallback)' : '', 'redirect:', CUSTOMER_AUTH_CALLBACK_URL);
    return c.json({
      ok: true,
      id: resData.id,
      redirect_to: CUSTOMER_AUTH_CALLBACK_URL,
    });
  } catch (e: any) {
    console.error('[Resend] POST /magic-link error:', e.message);
    return c.json({ error: e.message }, 500);
  }
});
