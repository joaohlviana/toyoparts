import * as kv from './kv_store.tsx';

export const RESEND_FALLBACK_FROM = 'Toyoparts <onboarding@resend.dev>';
export const RESEND_DEFAULT_FROM_EMAIL = 'noreply@toyoparts.com.br';
export const RESEND_DEFAULT_FROM_NAME = 'Toyoparts';
export const RESEND_DEFAULT_REPLY_TO_EMAIL = 'atendimento@toyoparts.com.br';
export const RESEND_INTERNAL_BCC_EMAIL = 'joao@toyopar.com.br';
const CONFIG_KEY = 'resend:config';

interface SendResendEmailOptions {
  to: string[];
  subject: string;
  html: string;
  text?: string;
  fromName?: string;
  fromEmail?: string;
  replyTo?: string[];
  bcc?: string[];
  includeInternalBcc?: boolean;
}

function uniqueEmails(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => String(value || '').trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

export function normalizeResendConfig(raw: any) {
  const config = { ...(raw || {}) };
  if (config.from_email === 'noreply@toyopar.com.br') {
    config.from_email = RESEND_DEFAULT_FROM_EMAIL;
  }
  if (!config.reply_to_email) {
    config.reply_to_email = RESEND_DEFAULT_REPLY_TO_EMAIL;
  }
  return config;
}

export async function getResendConfig() {
  return normalizeResendConfig(await kv.get(CONFIG_KEY));
}

function buildResendPayload(options: SendResendEmailOptions, config: any) {
  const fromName = String(options.fromName || config.from_name || RESEND_DEFAULT_FROM_NAME).trim();
  const fromEmail = String(options.fromEmail || config.from_email || RESEND_DEFAULT_FROM_EMAIL).trim();
  const replyToList = uniqueEmails([
    ...(options.replyTo || []),
    !options.replyTo?.length ? config.reply_to_email || RESEND_DEFAULT_REPLY_TO_EMAIL : null,
  ]);
  const bccList = uniqueEmails([
    ...(options.bcc || []),
    options.includeInternalBcc ? RESEND_INTERNAL_BCC_EMAIL : null,
  ]);

  return {
    from: `${fromName} <${fromEmail}>`,
    to: uniqueEmails(options.to),
    subject: options.subject,
    html: options.html,
    ...(options.text ? { text: options.text } : {}),
    ...(replyToList.length === 1
      ? { reply_to: replyToList[0] }
      : replyToList.length > 1
        ? { reply_to: replyToList }
        : {}),
    ...(bccList.length > 0 ? { bcc: bccList } : {}),
  };
}

export async function sendResendEmail(options: SendResendEmailOptions): Promise<{ data: any; usedFallback: boolean }> {
  const apiKey = String(Deno.env.get('RESEND_API') || '').trim();
  if (!apiKey) {
    throw new Error('RESEND_API nao configurado no ambiente');
  }

  const config = await getResendConfig();
  const payload = buildResendPayload(options, config);

  const send = async (body: Record<string, unknown>) => {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => ({}));
    return { res, data };
  };

  const firstAttempt = await send(payload);
  if (firstAttempt.res.ok) {
    return { data: firstAttempt.data, usedFallback: false };
  }

  const isDomainError =
    firstAttempt.res.status === 403 &&
    /domain.*not verified/i.test(String(firstAttempt.data?.message || ''));

  if (!isDomainError) {
    throw Object.assign(new Error(firstAttempt.data?.message || 'Resend API error'), {
      detail: firstAttempt.data,
      status: firstAttempt.res.status,
    });
  }

  const fallbackAttempt = await send({
    ...payload,
    from: RESEND_FALLBACK_FROM,
  });

  if (!fallbackAttempt.res.ok) {
    throw Object.assign(new Error(fallbackAttempt.data?.message || 'Resend fallback also failed'), {
      detail: fallbackAttempt.data,
      status: fallbackAttempt.res.status,
    });
  }

  return { data: fallbackAttempt.data, usedFallback: true };
}
