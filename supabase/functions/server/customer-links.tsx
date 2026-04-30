export const PRIMARY_CUSTOMER_URL = 'https://www.toyoparts.com.br';
export const SECONDARY_CUSTOMER_URL = 'https://toyoparts.vercel.app';
export const CUSTOMER_AUTH_CALLBACK_PATH = '/auth/callback';
export const CUSTOMER_ACCESS_PATH = '/acesso';
export const CUSTOMER_ORDERS_PATH = '/minha-conta/pedidos';
export const CUSTOMER_SUPPORT_EMAIL = 'atendimento@toyoparts.com.br';
export const CUSTOMER_WHATSAPP_PHONE = '554332941144';
export const CUSTOMER_WHATSAPP_DEFAULT_MESSAGE = 'Olá, Toyoparts.';
export const CUSTOMER_EMAIL_LOGO_URL = `${SECONDARY_CUSTOMER_URL}/brand/toyoparts-email-logo.png`;
export const CUSTOMER_ALLOWED_REDIRECTS = [
  'https://www.toyoparts.com.br/auth/callback',
  'https://toyoparts.vercel.app/auth/callback',
];

export function ensureCustomerWhatsAppMessage(message?: string | null) {
  const trimmed = String(message || '').trim();
  if (!trimmed) return CUSTOMER_WHATSAPP_DEFAULT_MESSAGE;
  if (/toyoparts/i.test(trimmed)) return trimmed;
  return `${CUSTOMER_WHATSAPP_DEFAULT_MESSAGE}\n${trimmed}`;
}

export function buildCustomerWhatsAppUrl(
  message?: string | null,
  phone: string = CUSTOMER_WHATSAPP_PHONE,
) {
  const text = ensureCustomerWhatsAppMessage(message);
  return `https://wa.me/${encodeURIComponent(phone)}?text=${encodeURIComponent(text)}`;
}

export const CUSTOMER_WHATSAPP_URL = buildCustomerWhatsAppUrl();

export function joinCustomerUrl(base: string, path: string) {
  const normalizedBase = base.endsWith('/') ? base.slice(0, -1) : base;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

export const CUSTOMER_AUTH_CALLBACK_URL = joinCustomerUrl(
  PRIMARY_CUSTOMER_URL,
  CUSTOMER_AUTH_CALLBACK_PATH,
);

export const CUSTOMER_ACCOUNT_ORDERS_URL = joinCustomerUrl(
  PRIMARY_CUSTOMER_URL,
  CUSTOMER_ORDERS_PATH,
);

export function buildCustomerAccessUrl(token: string) {
  return joinCustomerUrl(PRIMARY_CUSTOMER_URL, `${CUSTOMER_ACCESS_PATH}?token=${encodeURIComponent(token)}`);
}

export function buildCustomerMagicLinkCallbackUrl(tokenHash: string, type: string = 'magiclink') {
  const query = new URLSearchParams({
    token_hash: tokenHash,
    type,
  });
  return joinCustomerUrl(PRIMARY_CUSTOMER_URL, `${CUSTOMER_AUTH_CALLBACK_PATH}?${query.toString()}`);
}

export function buildCustomerMagicLoginTokenUrl(loginToken: string) {
  const query = new URLSearchParams({
    login_token: loginToken,
  });
  return joinCustomerUrl(PRIMARY_CUSTOMER_URL, `${CUSTOMER_AUTH_CALLBACK_PATH}?${query.toString()}`);
}
