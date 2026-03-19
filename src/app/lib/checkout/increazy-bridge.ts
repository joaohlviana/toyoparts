// ─── Increazy Checkout Bridge ───────────────────────────────────────────────
// Wraps the global $increazyCheckoutPay function and $increazyOnCloseCheckout
// event listener with full TypeScript safety and validation.

import type {
  IncreazyMember,
  IncreazyAddress,
  IncreazyCompany,
  IncreazyCheckoutOptions,
  IncreazyCloseMessage,
} from './checkout-types';
import { validateCheckout } from './checkout-validation';

// ── Extend Window to declare Increazy globals ──
declare global {
  interface Window {
    $increazyCheckoutPay?: (
      plano: string,
      empty: string,
      options: IncreazyCheckoutOptions,
    ) => void;
    $increazyOnCloseCheckout?: (message: IncreazyCloseMessage) => void;
  }
}

// ── Bridge params ──
export interface OpenCheckoutParams {
  plano: string;
  orderId: string | number;
  customer: IncreazyMember;
  address?: IncreazyAddress;
  company?: IncreazyCompany;
}

export interface CheckoutCallbacks {
  onPaymentFinished?: () => void;
  onBackToSite?: () => void;
  onBackToHome?: () => void;
}

// ── Open checkout ──
export function openIncreazyCheckout(
  params: OpenCheckoutParams,
  callbacks?: CheckoutCallbacks,
): { success: boolean; errors?: string[] } {
  // 1) Validate all fields
  const validation = validateCheckout(params.customer, params.address, params.company);
  if (!validation.valid) {
    console.error('[IncreazyBridge] Validation failed:', validation.errors);
    return { success: false, errors: validation.errors };
  }

  // 2) Check if global function exists
  if (typeof window.$increazyCheckoutPay !== 'function') {
    const msg = 'Increazy checkout script não carregado. window.$increazyCheckoutPay não encontrado.';
    console.error('[IncreazyBridge]', msg);
    return { success: false, errors: [msg] };
  }

  // 3) Build options
  const options: IncreazyCheckoutOptions = {
    id_externo: params.orderId,
    import: {
      member: {
        name: params.customer.name.trim(),
        email: params.customer.email.trim(),
        document: params.customer.document.replace(/\D/g, ''),
        document_type: 'cpf',
        company_payment: params.customer.company_payment,
        rg: params.customer.rg || null,
        profission: params.customer.profission || null,
        note: params.customer.note || null,
      },
    },
  };

  // Only include address if all fields present
  if (params.address) {
    options.import.address = {
      postcode: params.address.postcode.replace(/\D/g, ''),
      phone: params.address.phone.replace(/\D/g, ''),
      street: params.address.street.trim(),
      number: params.address.number.trim(),
      state: params.address.state.trim().toUpperCase(),
      district: params.address.district.trim(),
      city: params.address.city.trim(),
      complement: params.address.complement.trim(),
      receiver: params.address.receiver.trim(),
    };
  }

  // Only include company if required fields present
  if (params.company) {
    options.import.company = { ...params.company };
  }

  // 4) Register close listener
  window.$increazyOnCloseCheckout = (message: IncreazyCloseMessage) => {
    console.log('[IncreazyBridge] onCloseCheckout:', message);
    switch (message) {
      case 'payment-finished':
        callbacks?.onPaymentFinished?.();
        break;
      case 'back-to-site':
        callbacks?.onBackToSite?.();
        break;
      case 'back-to-home':
        callbacks?.onBackToHome?.();
        break;
      default:
        console.warn('[IncreazyBridge] Unknown close message:', message);
    }
  };

  // 5) Call the global function
  console.log('[IncreazyBridge] Opening checkout:', { plano: params.plano, orderId: params.orderId });
  try {
    window.$increazyCheckoutPay(params.plano, '', options);
    return { success: true };
  } catch (err) {
    console.error('[IncreazyBridge] Error calling $increazyCheckoutPay:', err);
    return { success: false, errors: [(err as Error).message] };
  }
}

// ── Cleanup ──
export function cleanupIncreazyListeners() {
  delete window.$increazyOnCloseCheckout;
}
