// ─── Checkout Validation ────────────────────────────────────────────────────
// Strict validation per Increazy docs: if address/company is partially filled,
// ALL fields become required.

import type { IncreazyMember, IncreazyAddress, IncreazyCompany } from './checkout-types';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// ── CPF validator (simple mod-11 check) ──
export function isValidCPF(cpf: string): boolean {
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11) return false;
  if (/^(\d)\1+$/.test(digits)) return false;
  const calc = (slice: string, factor: number) => {
    let sum = 0;
    for (let i = 0; i < slice.length; i++) sum += parseInt(slice[i]) * (factor - i);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  const d1 = calc(digits.slice(0, 9), 10);
  const d2 = calc(digits.slice(0, 10), 11);
  return parseInt(digits[9]) === d1 && parseInt(digits[10]) === d2;
}

// ── Email validator ──
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ── CEP validator ──
export function isValidCEP(cep: string): boolean {
  return /^\d{5}-?\d{3}$/.test(cep);
}

// ── Validate Member (always required) ──
export function validateMember(m: Partial<IncreazyMember>): ValidationResult {
  const errors: string[] = [];
  if (!m.name?.trim()) errors.push('Nome é obrigatório');
  if (!m.email?.trim()) errors.push('E-mail é obrigatório');
  else if (!isValidEmail(m.email)) errors.push('E-mail inválido');
  if (!m.document?.trim()) errors.push('CPF é obrigatório');
  else if (!isValidCPF(m.document)) errors.push('CPF inválido');
  return { valid: errors.length === 0, errors };
}

// ── Validate Address (all-or-nothing) ──
const REQUIRED_ADDRESS_FIELDS: (keyof IncreazyAddress)[] = [
  'postcode', 'phone', 'street', 'number', 'state', 'district', 'city', 'complement', 'receiver',
];

export function validateAddress(a: Partial<IncreazyAddress> | undefined): ValidationResult {
  if (!a) return { valid: true, errors: [] };
  // Check if any field has a value
  const hasAnyValue = REQUIRED_ADDRESS_FIELDS.some(k => a[k]?.trim());
  if (!hasAnyValue) return { valid: true, errors: [] };
  // If any is filled, ALL are required
  const errors: string[] = [];
  for (const field of REQUIRED_ADDRESS_FIELDS) {
    if (!a[field]?.trim()) {
      errors.push(`Endereço: campo "${field}" é obrigatório quando endereço é fornecido`);
    }
  }
  if (a.postcode && !isValidCEP(a.postcode)) errors.push('CEP inválido');
  return { valid: errors.length === 0, errors };
}

// ── Validate Company (all-or-nothing) ──
const REQUIRED_COMPANY_FIELDS: (keyof IncreazyCompany)[] = [
  'name', 'social_name', 'fantasy_name', 'document',
];

export function validateCompany(c: Partial<IncreazyCompany> | undefined): ValidationResult {
  if (!c) return { valid: true, errors: [] };
  const hasAnyValue = REQUIRED_COMPANY_FIELDS.some(k => {
    const v = c[k];
    return typeof v === 'string' ? v.trim().length > 0 : v != null;
  });
  if (!hasAnyValue) return { valid: true, errors: [] };
  const errors: string[] = [];
  for (const field of REQUIRED_COMPANY_FIELDS) {
    const v = c[field];
    if (typeof v === 'string' ? !v.trim() : v == null) {
      errors.push(`Empresa: campo "${field}" é obrigatório quando dados de empresa são fornecidos`);
    }
  }
  return { valid: errors.length === 0, errors };
}

// ── Full checkout validation ──
export function validateCheckout(
  member: Partial<IncreazyMember>,
  address?: Partial<IncreazyAddress>,
  company?: Partial<IncreazyCompany>,
): ValidationResult {
  const memberResult = validateMember(member);
  const addressResult = validateAddress(address);
  const companyResult = validateCompany(company);
  const allErrors = [...memberResult.errors, ...addressResult.errors, ...companyResult.errors];
  return { valid: allErrors.length === 0, errors: allErrors };
}

// ── CPF mask ──
export function maskCPF(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

// ── CEP mask ──
export function maskCEP(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

// ── Phone mask ──
export function maskPhone(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
