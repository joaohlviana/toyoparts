// ─── Resend Email Service ─────────────────────────────────────────────────────
// Gerencia configuração do Resend, templates de e-mail e envio de Magic Links

import { Hono } from 'npm:hono';
import * as kv from './kv_store.tsx';
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";

export const resend = new Hono();

// ─── Keys ──────────────────────────────────────────────────────────────────────
const CONFIG_KEY = 'resend:config';
const TEMPLATE_PREFIX = 'resend:template:';

// ─── Template Metadata ─────────────────────────────────────────────────────────
const TEMPLATE_META: Record<string, any> = {
  magic_link: {
    id: 'magic_link',
    name: 'Magic Link de Acesso',
    description: 'Enviado quando o usuário solicita login via link mágico',
    category: 'Autenticação',
    subject: 'Seu link de acesso - Toyoparts',
    placeholders: [
      { key: '{{name}}', desc: 'Nome do usuário (antes do @)' },
      { key: '{{email}}', desc: 'E-mail completo do usuário' },
      { key: '{{magic_link}}', desc: 'URL do link de acesso gerado pelo Supabase' },
      { key: '{{expires_in}}', desc: 'Validade do link (ex: 24 horas)' },
    ],
  },
  order_confirmation: {
    id: 'order_confirmation',
    name: 'Confirmação de Pedido',
    description: 'Enviado logo após a finalização do pedido na loja',
    category: 'Pedidos',
    subject: 'Pedido #{{order_id}} confirmado ✓ - Toyoparts',
    placeholders: [
      { key: '{{name}}', desc: 'Nome do cliente' },
      { key: '{{order_id}}', desc: 'Número/ID do pedido' },
      { key: '{{order_total}}', desc: 'Valor total formatado (ex: R$ 1.250,00)' },
      { key: '{{order_date}}', desc: 'Data do pedido formatada' },
      { key: '{{items_html}}', desc: 'HTML da lista de itens do pedido' },
    ],
  },
  order_shipped: {
    id: 'order_shipped',
    name: 'Pedido Enviado',
    description: 'Notificação de despacho — pedido saiu para entrega',
    category: 'Pedidos',
    subject: 'Seu pedido #{{order_id}} foi enviado! 🚚',
    placeholders: [
      { key: '{{name}}', desc: 'Nome do cliente' },
      { key: '{{order_id}}', desc: 'Número do pedido' },
      { key: '{{tracking_code}}', desc: 'Código de rastreamento dos Correios/transportadora' },
      { key: '{{carrier}}', desc: 'Nome da transportadora' },
      { key: '{{estimated_delivery}}', desc: 'Prazo estimado de entrega' },
    ],
  },
  order_delivered: {
    id: 'order_delivered',
    name: 'Pedido Entregue',
    description: 'Confirmação de entrega com convite para avaliação',
    category: 'Pedidos',
    subject: 'Seu pedido chegou! ✅',
    placeholders: [
      { key: '{{name}}', desc: 'Nome do cliente' },
      { key: '{{order_id}}', desc: 'Número do pedido' },
    ],
  },
  welcome_newsletter: {
    id: 'welcome_newsletter',
    name: 'Boas-vindas Newsletter',
    description: 'E-mail de boas-vindas para novos inscritos na newsletter',
    category: 'Marketing',
    subject: 'Bem-vindo à Toyoparts! 🎉',
    placeholders: [
      { key: '{{name}}', desc: 'Nome do inscrito (antes do @)' },
      { key: '{{email}}', desc: 'E-mail do inscrito' },
    ],
  },
  password_recovery: {
    id: 'password_recovery',
    name: 'Recuperação de Senha',
    description: 'Link de redefinição de senha (auth via Supabase)',
    category: 'Autenticação',
    subject: 'Redefina sua senha - Toyoparts',
    placeholders: [
      { key: '{{name}}', desc: 'Nome do usuário' },
      { key: '{{recovery_link}}', desc: 'URL de redefinição de senha' },
      { key: '{{expires_in}}', desc: 'Validade do link' },
    ],
  },
};

// ─── Base Layout ───────────────────────────────────────────────────────────────
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
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px;width:100%;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:#EB0A1E;padding:24px 40px;text-align:left;">
            <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
              <tr>
                <td>
                  <span style="font-size:22px;font-weight:900;color:#ffffff;letter-spacing:-0.5px;text-decoration:none;">TOYOPARTS</span>
                </td>
                <td align="right">
                  <span style="font-size:12px;color:rgba(255,255,255,0.7);font-weight:500;">Peças Toyota Genuínas</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:40px 40px 32px;">
            ${content}
          </td>
        </tr>
        <tr>
          <td style="background:#f9f9f9;padding:24px 40px;border-top:1px solid #f0f0f0;">
            <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
              <tr>
                <td style="text-align:center;">
                  <p style="margin:0 0 6px;font-size:13px;color:#999;line-height:1.5;">Toyoparts · Peças Genuínas e Compatíveis Toyota</p>
                  <p style="margin:0;font-size:11px;color:#bbb;">© ${new Date().getFullYear()} Toyoparts. Todos os direitos reservados.</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── Default HTML Templates ────────────────────────────────────────────────────
const DEFAULT_HTML: Record<string, string> = {
  magic_link: baseLayout(`
    <h2 style="margin:0 0 12px;font-size:28px;font-weight:700;color:#1d1d1f;line-height:1.2;">Olá, {{name}}! 👋</h2>
    <p style="margin:0 0 28px;font-size:16px;color:#666;line-height:1.7;">Você solicitou acesso à sua conta Toyoparts. Clique no botão abaixo para entrar instantaneamente — sem precisar de senha.</p>
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:32px 0;">
      <tr>
        <td align="center">
          <a href="{{magic_link}}" style="display:inline-block;background:#EB0A1E;color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;padding:18px 48px;border-radius:12px;letter-spacing:0.2px;">Acessar Minha Conta →</a>
        </td>
      </tr>
    </table>
    <div style="background:#fff8f8;border:1px solid #fde8e8;border-radius:12px;padding:16px 20px;margin:24px 0;">
      <p style="margin:0;font-size:13px;color:#cc4444;line-height:1.6;">⚠️ Este link expira em <strong>{{expires_in}}</strong>. Por segurança, não compartilhe com ninguém.</p>
    </div>
    <hr style="border:none;border-top:1px solid #f0f0f0;margin:28px 0;">
    <p style="margin:0;font-size:12px;color:#bbb;text-align:center;">Se você não solicitou este acesso, pode ignorar este e-mail com segurança.</p>
  `, 'Seu link mágico de acesso à Toyoparts está aqui'),

  order_confirmation: baseLayout(`
    <h2 style="margin:0 0 8px;font-size:28px;font-weight:700;color:#1d1d1f;">Pedido Confirmado! 🎉</h2>
    <p style="margin:0 0 28px;font-size:16px;color:#666;line-height:1.7;">Olá, <strong>{{name}}</strong>! Recebemos seu pedido com sucesso e já estamos preparando tudo para você.</p>
    <div style="background:#f8f8f8;border-radius:12px;padding:20px 24px;margin:0 0 20px;">
      <p style="margin:0 0 4px;font-size:11px;color:#999;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Número do Pedido</p>
      <p style="margin:0;font-size:26px;font-weight:800;color:#1d1d1f;font-family:monospace;">#{{order_id}}</p>
    </div>
    <div style="margin:20px 0;">{{items_html}}</div>
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-top:2px solid #EB0A1E;padding-top:16px;margin-top:16px;">
      <tr>
        <td style="font-size:16px;font-weight:600;color:#1d1d1f;">Total do Pedido</td>
        <td align="right" style="font-size:22px;font-weight:800;color:#EB0A1E;">{{order_total}}</td>
      </tr>
    </table>
    <p style="margin:20px 0 0;font-size:13px;color:#999;text-align:center;">Pedido realizado em {{order_date}}</p>
  `, 'Seu pedido foi confirmado — obrigado pela compra!'),

  order_shipped: baseLayout(`
    <h2 style="margin:0 0 8px;font-size:28px;font-weight:700;color:#1d1d1f;">Seu pedido está a caminho! 🚚</h2>
    <p style="margin:0 0 28px;font-size:16px;color:#666;line-height:1.7;">Olá, <strong>{{name}}</strong>! Ótima notícia — seu pedido <strong>#{{order_id}}</strong> foi despachado e está em trânsito.</p>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:20px 24px;margin:0 0 16px;">
      <p style="margin:0 0 6px;font-size:11px;color:#16a34a;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Código de Rastreamento</p>
      <p style="margin:0;font-size:22px;font-weight:800;color:#1d1d1f;font-family:monospace;letter-spacing:2px;">{{tracking_code}}</p>
    </div>
    <div style="background:#f8f8f8;border-radius:12px;padding:16px 24px;margin:0 0 28px;">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
        <tr>
          <td style="font-size:14px;color:#666;padding:4px 0;"><strong>Transportadora:</strong> {{carrier}}</td>
        </tr>
        <tr>
          <td style="font-size:14px;color:#666;padding:4px 0;"><strong>Prazo estimado:</strong> {{estimated_delivery}}</td>
        </tr>
      </table>
    </div>
    <hr style="border:none;border-top:1px solid #f0f0f0;margin:28px 0;">
    <p style="margin:0;font-size:13px;color:#999;text-align:center;">Qualquer dúvida sobre a entrega, entre em contato com nosso suporte.</p>
  `, 'Seu pedido foi enviado — acompanhe a entrega'),

  order_delivered: baseLayout(`
    <div style="text-align:center;margin:0 0 32px;">
      <div style="width:72px;height:72px;background:#f0fdf4;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;border:3px solid #bbf7d0;">
        <span style="font-size:32px;">✅</span>
      </div>
    </div>
    <h2 style="margin:0 0 8px;font-size:28px;font-weight:700;color:#1d1d1f;text-align:center;">Entrega Confirmada!</h2>
    <p style="margin:0 0 28px;font-size:16px;color:#666;line-height:1.7;text-align:center;">Olá, <strong>{{name}}</strong>! Seu pedido <strong>#{{order_id}}</strong> foi entregue com sucesso. Esperamos que fique muito satisfeito com os produtos!</p>
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:32px 0;">
      <tr>
        <td align="center">
          <a href="https://toyoparts.com.br/minha-conta/pedidos" style="display:inline-block;background:#EB0A1E;color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;padding:16px 40px;border-radius:12px;">Ver Meus Pedidos →</a>
        </td>
      </tr>
    </table>
    <p style="margin:0;font-size:14px;color:#999;text-align:center;line-height:1.6;">Obrigado por comprar na Toyoparts! 🙏</p>
  `, 'Seu pedido foi entregue!'),

  welcome_newsletter: baseLayout(`
    <h2 style="margin:0 0 8px;font-size:28px;font-weight:700;color:#1d1d1f;">Seja bem-vindo! 🎉</h2>
    <p style="margin:0 0 24px;font-size:16px;color:#666;line-height:1.7;">Olá, <strong>{{name}}</strong>! Você acaba de se juntar à comunidade Toyoparts. Fique por dentro de:</p>
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 24px;">
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;">
          <span style="font-size:20px;margin-right:12px;">🚗</span>
          <span style="font-size:15px;color:#444;">Novidades e lançamentos de peças Toyota</span>
        </td>
      </tr>
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;">
          <span style="font-size:20px;margin-right:12px;">💡</span>
          <span style="font-size:15px;color:#444;">Dicas de manutenção e revisão</span>
        </td>
      </tr>
      <tr>
        <td style="padding:10px 0;">
          <span style="font-size:20px;margin-right:12px;">🏷️</span>
          <span style="font-size:15px;color:#444;">Promoções exclusivas para assinantes</span>
        </td>
      </tr>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:32px 0;">
      <tr>
        <td align="center">
          <a href="https://toyoparts.com.br" style="display:inline-block;background:#EB0A1E;color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;padding:16px 40px;border-radius:12px;">Explorar Catálogo →</a>
        </td>
      </tr>
    </table>
  `, 'Bem-vindo à newsletter Toyoparts!'),

  password_recovery: baseLayout(`
    <h2 style="margin:0 0 8px;font-size:28px;font-weight:700;color:#1d1d1f;">Redefinir sua senha</h2>
    <p style="margin:0 0 28px;font-size:16px;color:#666;line-height:1.7;">Olá, <strong>{{name}}</strong>! Recebemos uma solicitação para redefinir a senha da sua conta Toyoparts. Clique no botão abaixo para criar uma nova senha.</p>
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:32px 0;">
      <tr>
        <td align="center">
          <a href="{{recovery_link}}" style="display:inline-block;background:#EB0A1E;color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;padding:18px 48px;border-radius:12px;">Redefinir Senha →</a>
        </td>
      </tr>
    </table>
    <div style="background:#fff8f8;border:1px solid #fde8e8;border-radius:12px;padding:16px 20px;margin:24px 0;">
      <p style="margin:0;font-size:13px;color:#cc4444;line-height:1.6;">⚠️ Este link expira em <strong>{{expires_in}}</strong>. Por segurança, não compartilhe com ninguém.</p>
    </div>
    <hr style="border:none;border-top:1px solid #f0f0f0;margin:28px 0;">
    <p style="margin:0;font-size:12px;color:#bbb;text-align:center;">Se você não solicitou a redefinição de senha, pode ignorar este e-mail com segurança.</p>
  `, 'Solicitação de redefinição de senha'),
};

// ─── Fallback sender helper ────────────────────────────────────────────────────
const RESEND_FALLBACK_FROM = 'Toyoparts <onboarding@resend.dev>';

async function sendWithFallback(
  apiKey: string,
  payload: { from: string; to: string[]; subject: string; html: string },
): Promise<{ data: any; usedFallback: boolean }> {
  // First attempt with the configured sender
  const res1 = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data1 = await res1.json();

  if (res1.ok) return { data: data1, usedFallback: false };

  // If domain not verified (403), retry with Resend's free domain
  const isDomainError = res1.status === 403 && /domain.*not verified/i.test(data1.message || '');
  if (!isDomainError) {
    // Not a domain error — propagate original error
    throw Object.assign(new Error(data1.message || 'Resend API error'), { detail: data1, status: res1.status });
  }

  console.log(`[Resend] Domain not verified, retrying with fallback sender: ${RESEND_FALLBACK_FROM}`);
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

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET /config
resend.get('/config', async (c) => {
  try {
    const config = await kv.get(CONFIG_KEY) || {};
    const apiKey = (Deno.env.get('RESEND_API') || '').trim();

    // Auto-migrate stale domain from old typo (toyopar → toyoparts)
    const staleEmail = 'noreply@toyopar.com.br';
    const correctEmail = 'noreply@toyoparts.com.br';
    if (config.from_email === staleEmail) {
      config.from_email = correctEmail;
      await kv.set(CONFIG_KEY, { ...config, updated_at: new Date().toISOString() });
      console.log('[Resend] Auto-migrated from_email from toyopar.com.br → toyoparts.com.br');
    }

    return c.json({
      from_email: config.from_email || correctEmail,
      from_name: config.from_name || 'Toyoparts',
      magic_link_enabled: config.magic_link_enabled ?? false,
      api_key_configured: !!apiKey,
    });
  } catch (e: any) {
    console.error('[Resend] GET /config error:', e.message);
    return c.json({ error: e.message }, 500);
  }
});

// POST /config
resend.post('/config', async (c) => {
  try {
    const body = await c.req.json();
    const existing = await kv.get(CONFIG_KEY) || {};
    const updated = { ...existing, ...body, updated_at: new Date().toISOString() };
    await kv.set(CONFIG_KEY, updated);
    return c.json({ ok: true });
  } catch (e: any) {
    console.error('[Resend] POST /config error:', e.message);
    return c.json({ error: e.message }, 500);
  }
});

// POST /test — Envia e-mail de teste
resend.post('/test', async (c) => {
  try {
    const { to } = await c.req.json();
    if (!to) return c.json({ error: 'Campo "to" é obrigatório' }, 400);

    const apiKey = (Deno.env.get('RESEND_API') || '').trim();
    if (!apiKey) return c.json({ error: 'RESEND_API não configurado no ambiente' }, 400);

    const config = await kv.get(CONFIG_KEY) || {};
    const fromName = config.from_name || 'Toyoparts';
    const fromEmail = config.from_email || 'noreply@toyoparts.com.br';

    const testHtml = baseLayout(`
      <h2 style="margin:0 0 12px;font-size:28px;font-weight:700;color:#1d1d1f;">Tudo funcionando! ✅</h2>
      <p style="margin:0 0 24px;font-size:16px;color:#666;line-height:1.7;">Sua integração com o <strong>Resend</strong> está configurada corretamente. Este é um e-mail de teste enviado pelo painel admin da Toyoparts.</p>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:20px 24px;margin:20px 0;">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
          <tr><td style="padding:4px 0;font-size:14px;color:#16a34a;">✓ API Key válida e funcional</td></tr>
          <tr><td style="padding:4px 0;font-size:14px;color:#16a34a;">✓ Remetente configurado: <strong>${fromName} &lt;${fromEmail}&gt;</strong></td></tr>
          <tr><td style="padding:4px 0;font-size:14px;color:#16a34a;">✓ Entrega de e-mails operacional</td></tr>
        </table>
      </div>
      <p style="margin:20px 0 0;font-size:14px;color:#999;text-align:center;">Enviado em ${new Date().toLocaleString('pt-BR')}</p>
    `, 'Teste de configuração Resend - Toyoparts');

    const { data, usedFallback } = await sendWithFallback(apiKey, {
      from: `${fromName} <${fromEmail}>`,
      to: [to],
      subject: '✅ Teste de E-mail - Toyoparts',
      html: testHtml,
    });

    console.log('[Resend] Test email sent:', data.id, '→', to, usedFallback ? '(fallback)' : '');
    return c.json({ ok: true, id: data.id });
  } catch (e: any) {
    console.error('[Resend] POST /test error:', e.message);
    return c.json({ error: e.message }, 500);
  }
});

// GET /templates — Lista todos os templates
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
      })
    );
    return c.json({ templates });
  } catch (e: any) {
    console.error('[Resend] GET /templates error:', e.message);
    return c.json({ error: e.message }, 500);
  }
});

// GET /templates/:id — Retorna template específico
resend.get('/templates/:id', async (c) => {
  try {
    const id = c.req.param('id');
    if (!TEMPLATE_META[id]) return c.json({ error: 'Template não encontrado' }, 404);

    const stored = await kv.get(`${TEMPLATE_PREFIX}${id}`);
    if (stored) return c.json(stored);

    // Retorna o padrão
    return c.json({
      ...TEMPLATE_META[id],
      html: DEFAULT_HTML[id] || '<p>Template padrão não disponível</p>',
      customized: false,
    });
  } catch (e: any) {
    console.error('[Resend] GET /templates/:id error:', e.message);
    return c.json({ error: e.message }, 500);
  }
});

// POST /templates/:id — Salva/atualiza template
resend.post('/templates/:id', async (c) => {
  try {
    const id = c.req.param('id');
    if (!TEMPLATE_META[id]) return c.json({ error: 'Template não encontrado' }, 404);

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

// DELETE /templates/:id — Reseta template para padrão
resend.delete('/templates/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await kv.del(`${TEMPLATE_PREFIX}${id}`);
    return c.json({ ok: true });
  } catch (e: any) {
    console.error('[Resend] DELETE /templates/:id error:', e.message);
    return c.json({ error: e.message }, 500);
  }
});

// POST /magic-link — Envia magic link via Resend com template customizado
resend.post('/magic-link', async (c) => {
  try {
    const { email } = await c.req.json();
    if (!email) return c.json({ error: 'E-mail é obrigatório' }, 400);

    const apiKey = (Deno.env.get('RESEND_API') || '').trim();
    if (!apiKey) return c.json({ error: 'RESEND_API não configurado no ambiente' }, 400);

    const config = await kv.get(CONFIG_KEY) || {};
    if (!config.magic_link_enabled) {
      return c.json({ error: 'Envio de Magic Link via Resend não está habilitado nas configurações' }, 400);
    }

    // Gera o magic link via Supabase Admin
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data, error } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });

    if (error || !data?.properties?.action_link) {
      console.error('[Resend] magic-link generateLink error:', error);
      return c.json({ error: error?.message || 'Falha ao gerar magic link no Supabase' }, 500);
    }

    const magicLink = data.properties.action_link;

    // Busca template salvo ou usa o padrão
    const storedTemplate = await kv.get(`${TEMPLATE_PREFIX}magic_link`);
    const template = storedTemplate || {
      ...TEMPLATE_META.magic_link,
      html: DEFAULT_HTML.magic_link,
    };

    const name = email.split('@')[0];
    const html = template.html
      .replace(/\{\{name\}\}/g, name)
      .replace(/\{\{email\}\}/g, email)
      .replace(/\{\{magic_link\}\}/g, magicLink)
      .replace(/\{\{expires_in\}\}/g, '24 horas');

    const subject = (template.subject || 'Seu link de acesso - Toyoparts')
      .replace(/\{\{name\}\}/g, name)
      .replace(/\{\{email\}\}/g, email);

    const fromName = config.from_name || 'Toyoparts';
    const fromEmail = config.from_email || 'noreply@toyoparts.com.br';

    const { data: resData, usedFallback } = await sendWithFallback(apiKey, {
      from: `${fromName} <${fromEmail}>`,
      to: [email],
      subject,
      html,
    });

    console.log('[Resend] Magic link sent via Resend:', resData.id, '→', email, usedFallback ? '(fallback)' : '');
    return c.json({ ok: true, id: resData.id });
  } catch (e: any) {
    console.error('[Resend] POST /magic-link error:', e.message);
    return c.json({ error: e.message }, 500);
  }
});