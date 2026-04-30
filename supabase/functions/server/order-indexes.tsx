import { crypto } from "jsr:@std/crypto";
import * as kv from './kv_store.tsx';
import { isStoreOrderRecord } from './order-records.tsx';

function normalizeEmail(email: string): string {
  return (email || '').trim().toLowerCase();
}

async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function extractCustomerEmail(order: any): string {
  return normalizeEmail(
    order?.customer?.email
    || order?.customer_email
    || '',
  );
}

function extractExplicitCustomerId(order: any): string {
  const raw =
    order?.customer?.id
    || order?.customer?.customer_id
    || order?.customer_id
    || '';
  return String(raw || '').trim();
}

async function readOrderIds(key: string): Promise<string[]> {
  const value = await kv.get(key);
  return Array.isArray(value)
    ? value.map((item) => String(item)).filter(Boolean)
    : [];
}

async function appendOrderId(key: string, orderId: string) {
  const current = await readOrderIds(key);
  if (!current.includes(orderId)) {
    current.push(orderId);
    await kv.set(key, current);
  }
}

export async function ensureOrderCustomerIndexes(orderId: string, order: any): Promise<void> {
  const email = extractCustomerEmail(order);
  if (!email) {
    return;
  }

  const emailHash = await sha256(email);
  const emailIndexKey = `idx_customer_by_email:${emailHash}`;
  const existingCustomerId = await kv.get(emailIndexKey).catch(() => null);
  const explicitCustomerId = extractExplicitCustomerId(order);
  const customerId = String(
    existingCustomerId
    || explicitCustomerId
    || `site:${emailHash}`,
  );

  if (!existingCustomerId) {
    await kv.set(emailIndexKey, customerId);
  }

  await appendOrderId(`idx_orders_by_customer:${customerId}`, orderId);
  await appendOrderId(`idx:orders:${email}`, orderId);
}

export async function findStoreOrdersByEmailFallback(email: string): Promise<any[]> {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return [];
  }

  const allOrders = await kv.getByPrefix('order:');
  return (allOrders || []).filter((order: any) => {
    if (!isStoreOrderRecord(order)) {
      return false;
    }
    return extractCustomerEmail(order) === normalizedEmail;
  });
}
