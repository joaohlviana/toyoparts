function normalizeSpaces(value: string | null | undefined): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeForCompare(value: string): string {
  return normalizeSpaces(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function getShippingServiceDisplayName(serviceDescription: string, carrier: string): string {
  const description = normalizeSpaces(serviceDescription);
  const fullCarrierName = normalizeSpaces(carrier);

  if (!description && !fullCarrierName) return 'Frete';
  if (!description) return fullCarrierName;
  if (!fullCarrierName) return description;

  const normalizedDescription = normalizeForCompare(description);
  const normalizedCarrier = normalizeForCompare(fullCarrierName);

  if (
    normalizedDescription === normalizedCarrier ||
    normalizedDescription === normalizeForCompare(`transportadora ${fullCarrierName}`) ||
    normalizedDescription === normalizeForCompare(`transp ${fullCarrierName}`)
  ) {
    return fullCarrierName;
  }

  if (normalizedDescription.includes(normalizedCarrier)) {
    return description;
  }

  return `${fullCarrierName} - ${description}`;
}

export function formatShippingTransitTime(days: number): string {
  const safeDays = Number.isFinite(days) ? Math.max(0, Math.trunc(days)) : 0;
  return `${safeDays} dia${safeDays !== 1 ? 's' : ''} ${safeDays === 1 ? 'útil' : 'úteis'}`;
}
