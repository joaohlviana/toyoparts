export const TOYOPARTS_WHATSAPP_PHONE = '554332941144';
export const TOYOPARTS_WHATSAPP_DEFAULT_MESSAGE = 'Olá, Toyoparts.';
export const TOYOPARTS_PHONE_DISPLAY = '(43) 3294-1144';
export const TOYOPARTS_TEL_HREF = 'tel:+554332941144';

const LEGACY_TOYOPARTS_PHONES = new Set([
  '5543996729711',
  '43996729711',
  '554332941120',
  '4332941120',
]);

const LEGACY_TOYOPARTS_GREETING_RE = /^(?:ola|ol[a\u00e1\u00c1])\s*[!,]?\s*toyoparts\.?$/i;

function normalizeToyopartsGreeting(message: string) {
  const lines = message
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return TOYOPARTS_WHATSAPP_DEFAULT_MESSAGE;

  if (LEGACY_TOYOPARTS_GREETING_RE.test(lines[0])) {
    lines[0] = TOYOPARTS_WHATSAPP_DEFAULT_MESSAGE;
    return lines.join('\n');
  }

  return message.trim();
}

export function ensureToyopartsInWhatsAppMessage(message?: string | null) {
  const trimmed = String(message || '').trim();
  if (!trimmed) return TOYOPARTS_WHATSAPP_DEFAULT_MESSAGE;

  const normalized = normalizeToyopartsGreeting(trimmed);
  if (/toyoparts/i.test(normalized)) return normalized;

  return `${TOYOPARTS_WHATSAPP_DEFAULT_MESSAGE}\n${normalized}`;
}

export function buildToyopartsWhatsAppUrl(
  message?: string | null,
  phone: string = TOYOPARTS_WHATSAPP_PHONE,
) {
  const text = ensureToyopartsInWhatsAppMessage(message);
  return `https://wa.me/${encodeURIComponent(phone)}?text=${encodeURIComponent(text)}`;
}

export const TOYOPARTS_DEFAULT_WHATSAPP_URL = buildToyopartsWhatsAppUrl();

export function isWhatsAppUrl(href?: string | null) {
  const normalized = String(href || '').trim().toLowerCase();
  return normalized.includes('wa.me/') || normalized.includes('api.whatsapp.com/send');
}

export function normalizeToyopartsWhatsAppUrl(
  href?: string | null,
  fallbackMessage?: string | null,
) {
  const rawHref = String(href || '').trim();
  if (!rawHref) return buildToyopartsWhatsAppUrl(fallbackMessage);
  if (!isWhatsAppUrl(rawHref)) return rawHref;

  try {
    const url = new URL(rawHref);
    const currentText = url.searchParams.get('text');
    return buildToyopartsWhatsAppUrl(currentText || fallbackMessage);
  } catch {
    return buildToyopartsWhatsAppUrl(fallbackMessage);
  }
}

function digitsOnly(value?: string | null) {
  return String(value || '').replace(/\D+/g, '');
}

function isLegacyToyopartsPhone(value?: string | null) {
  const digits = digitsOnly(value);
  return LEGACY_TOYOPARTS_PHONES.has(digits);
}

function replaceLegacyToyopartsPhoneText(value: string) {
  return value
    .replace(/\+?55\s*43\s*99672[-\s]?9711/g, '+55 43 3294-1144')
    .replace(/\(43\)\s*99672[-\s]?9711/g, TOYOPARTS_PHONE_DISPLAY)
    .replace(/43\s*99672[-\s]?9711/g, '43 3294-1144')
    .replace(/\+?55\s*43\s*3294[-\s]?1120/g, '+55 43 3294-1144')
    .replace(/\(43\)\s*3294[-\s]?1120/g, TOYOPARTS_PHONE_DISPLAY)
    .replace(/43\s*3294[-\s]?1120/g, '43 3294-1144')
    .replace(/5543996729711/g, TOYOPARTS_WHATSAPP_PHONE)
    .replace(/43996729711/g, '4332941144')
    .replace(/554332941120/g, TOYOPARTS_WHATSAPP_PHONE)
    .replace(/4332941120/g, '4332941144');
}

export function normalizeToyopartsContactLinks(root?: ParentNode) {
  const target = root || (typeof document !== 'undefined' ? document : null);
  if (!target || typeof target.querySelectorAll !== 'function') return;

  target.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((anchor) => {
    const href = anchor.getAttribute('href') || '';

    if (isWhatsAppUrl(href)) {
      const normalizedHref = normalizeToyopartsWhatsAppUrl(href);
      if (href !== normalizedHref) {
        anchor.setAttribute('href', normalizedHref);
      }
      return;
    }

    if (/^tel:/i.test(href) && isLegacyToyopartsPhone(href)) {
      anchor.setAttribute('href', TOYOPARTS_TEL_HREF);
    }
  });

  if (typeof document === 'undefined') return;

  const rootNode = target instanceof Document ? target.body : target as Node;
  if (!rootNode) return;

  const walker = document.createTreeWalker(rootNode, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(parent.tagName)) {
        return NodeFilter.FILTER_REJECT;
      }
      return /99672[-\s]?9711|3294[-\s]?1120|5543996729711|43996729711|554332941120|4332941120/.test(node.nodeValue || '')
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    },
  });

  let node = walker.nextNode();
  while (node) {
    node.nodeValue = replaceLegacyToyopartsPhoneText(node.nodeValue || '');
    node = walker.nextNode();
  }
}
