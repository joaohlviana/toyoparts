export function getOrderRecordDate(order: any): string {
  return String(
    order?.createdAt
    || order?.created_at
    || order?.updatedAt
    || order?.updated_at
    || new Date(0).toISOString(),
  );
}

export function compareOrderRecordDateDesc(a: any, b: any): number {
  return new Date(getOrderRecordDate(b)).getTime() - new Date(getOrderRecordDate(a)).getTime();
}

export function isStoreOrderRecord(order: any): boolean {
  if (!order || typeof order !== 'object') {
    return false;
  }

  const orderId = String(order.orderId || order.id || '').trim();
  return Boolean(orderId);
}

export function isMagentoStoredOrderRecord(order: any): boolean {
  if (!order || typeof order !== 'object') {
    return false;
  }

  if (isStoreOrderRecord(order)) {
    return false;
  }

  const entityId = String(order.entity_id ?? '').trim();
  const incrementId = String(order.increment_id ?? '').trim();
  const customerEmail = String(order.customer_email ?? '').trim();
  const createdAt = String(order.created_at ?? '').trim();
  const status = String(order.status ?? '').trim();

  return Boolean((entityId || incrementId) && (customerEmail || createdAt || status));
}

export function getMagentoStoredOrderIdentity(order: any): string {
  return String(
    order?.entity_id
    || order?.increment_id
    || order?.reserved_order_id
    || '',
  ).trim();
}
