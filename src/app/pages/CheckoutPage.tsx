// ─── Checkout Page ──────────────────────────────────────────────────────────
// Order summary + customer form → PAL unified checkout (Asaas / Vindi / Stripe).
// Todos os providers retornam checkoutUrl (hosted page) — fluxo de redirect uniforme.

import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, ShoppingBag, Package, User, MapPin,
  CreditCard, Shield, Truck, ChevronDown,
  Loader2, AlertCircle, Lock, CheckCircle2,
  Tag, Sparkles, MessageCircle,
} from 'lucide-react';
import { useCart } from '../lib/cart/cart-store';
import { useShippingQuote } from '../lib/shipping/useFrenet';
import {
  maskCPF, maskCEP, maskPhone,
} from '../lib/checkout/checkout-validation';
import { useAbandonedCart } from '../lib/checkout/useAbandonedCart';
import { AbandonedCartBanner } from '../components/checkout/AbandonedCartBanner';
import type { AbandonedCartData } from '../components/checkout/AbandonedCartBanner';
import { CouponInput } from '../components/checkout/CouponInput';
import type { AppliedCoupon } from '../components/checkout/CouponInput';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { ToyotaPlaceholder } from '../components/ToyotaPlaceholder';
import { SEOHead } from '../components/seo/SEOHead';
import { ToyopartsLogo } from '../components/ToyopartsLogo';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';
import type { PaymentMethodIntent } from '../lib/shipping/shipping-types';

function formatBRL(v: number | undefined | null) {
  if (v === undefined || v === null) return 'R$ 0,00';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// ─── UF list ─────────────────────────────────────────────────────────────────
const UF_LIST = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
  'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
];

// ─── Component ───────────────────────────────────────────────────────────────

export function CheckoutPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { items, totals, shipping, setShipping, clearCart, addItem } = useCart();
  const {
    calculate: calcShipping,
    quotes,
    isLoading: isLoadingShipping,
    error: shippingError,
    appliedRule: shippingAppliedRule,
    potentialRules: shippingPotentialRules,
    whatsappOffer: shippingWhatsAppOffer,
    eligibleFreeShippingServiceIds,
  } = useShippingQuote();

  const [imgErrors, setImgErrors] = useState<Set<string>>(new Set());

  // ── Customer form state ──
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [cpf, setCpf] = useState('');
  const [phone, setPhone] = useState('');

  // ── Address ──
  const [showAddress, setShowAddress] = useState(true);
  const [isEditingAddress, setIsEditingAddress] = useState(false);
  const [paymentMethodIntent, setPaymentMethodIntent] = useState<PaymentMethodIntent>('pix');
  const [cep, setCep] = useState('');
  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [complement, setComplement] = useState('');
  const [district, setDistrict] = useState('');
  const [city, setCity] = useState('');
  const [uf, setUf] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingCEP, setIsLoadingCEP] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  // ── Abandoned cart tracking ──
  const { clear: clearAbandoned } = useAbandonedCart({ email, name, cart: items });
  const [wasRecovered, setWasRecovered] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);

  // ── Coupon state ──
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);

  // ── Per-field validation errors ──
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const clearFieldError = (field: string) =>
    setFieldErrors(prev => { const n = { ...prev }; delete n[field]; return n; });

  // ── Recovery from ?recover=TOKEN ──
  useEffect(() => {
    const token = searchParams.get('recover');
    if (!token) return;

    setIsRecovering(true);
    fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-1d6e33e0/checkout/abandoned/recover/${token}`,
      { headers: { 'Authorization': `Bearer ${publicAnonKey}` } }
    )
      .then(r => r.json())
      .then(data => {
        if (!data.ok) {
          toast.error('Link de recuperação inválido ou expirado.');
          return;
        }
        // Restore form fields
        if (data.formData?.name)  setName(data.formData.name);
        if (data.formData?.email) setEmail(data.formData.email);

        // Restore cart items (point 2: revalidação — items com preços podem ter mudado)
        if (Array.isArray(data.cart) && data.cart.length > 0) {
          data.cart.forEach((item: any) => {
            addItem({
              sku:           item.sku,
              name:          item.name,
              unitPrice:     item.unitPrice,
              originalPrice: item.originalPrice ?? item.unitPrice,
              imageUrl:      item.imageUrl,
              urlKey:        item.urlKey,
              inStock:       true,
              weight:        null,
            }, item.qty);
          });
        }

        setWasRecovered(true);
        setShowAddress(true);
        toast.success('Carrinho restaurado! Verifique os itens e finalize sua compra.', { duration: 5000 });
        // Remove token from URL without reload
        window.history.replaceState({}, '', '/checkout');
      })
      .catch(() => toast.error('Erro ao recuperar carrinho.'))
      .finally(() => setIsRecovering(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Auto-fetch Address by CEP ──
  useEffect(() => {
    const cleanCep = cep.replace(/\D/g, '');
    if (cleanCep.length === 8) {
      setIsLoadingCEP(true);
      fetch(`https://viacep.com.br/ws/${cleanCep}/json/`)
        .then(res => res.json())
        .then(data => {
          if (!data.erro) {
            setStreet(data.logradouro);
            setDistrict(data.bairro);
            setCity(data.localidade);
            setUf(data.uf);
            setIsEditingAddress(false); // Reset editing mode when new valid CEP is found
            toast.success('Endereço encontrado!');
            
            // Auto-focus the number field
            setTimeout(() => {
              const numInput = document.getElementById('address-number');
              if (numInput) numInput.focus();
            }, 300);
          } else {
            toast.error('CEP não encontrado.');
            setIsEditingAddress(true);
          }
        })
        .catch(() => {
          toast.error('Erro ao buscar CEP.');
          setIsEditingAddress(true);
        })
        .finally(() => setIsLoadingCEP(false));
      
      // Also calculate shipping
      calcShipping({
        recipientCep: cleanCep,
        recipientUf: uf,
        paymentMethodIntent,
        items: items.map(i => ({
          sku: i.sku,
          qty: i.qty,
          price: i.unitPrice,
          name: i.name,
        }))
      });
    } else {
      setShipping(null);
    }
  }, [cep, items, uf, paymentMethodIntent, calcShipping, setShipping]);

  useEffect(() => {
    if (!shipping) return;
    if (quotes.length === 0) {
      if (!isLoadingShipping) {
        setShipping(null);
      }
      return;
    }

    const syncedQuote = quotes.find((quote) => quote.id === shipping.id);
    if (!syncedQuote) {
      if (!isLoadingShipping) {
        setShipping(null);
      }
      return;
    }

    const sameSelection =
      syncedQuote.price === shipping.price &&
      syncedQuote.estimatedDays === shipping.estimatedDays &&
      syncedQuote.originalPrice === shipping.originalPrice &&
      syncedQuote.message === shipping.message &&
      syncedQuote.freeShipping === shipping.freeShipping;

    if (!sameSelection) {
      setShipping(syncedQuote);
    }
  }, [quotes, shipping, isLoadingShipping, setShipping]);

  // ── Cart empty guard ──
  const isEmpty = items.length === 0 && !isSubmitting;

  // ── Handle submit ──
  const handlePay = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    
    // Per-field validation
    const fe: Record<string, string> = {};
    if (!name.trim())  fe.name  = 'Informe seu nome completo';
    if (!email.trim()) fe.email = 'Informe um e-mail válido';
    if (cpf.replace(/\D/g, '').length < 11) fe.cpf = 'CPF inválido ou não preenchido';
    if (phone.replace(/\D/g, '').length < 10) fe.phone = 'Informe um telefone válido';
    if (showAddress) {
      if (!cep || cep.replace(/\D/g, '').length < 8) fe.cep = 'Informe o CEP de entrega';
      if (!number.trim()) fe.number = 'Informe o número do endereço';
      if (!shipping) fe.shipping = 'Selecione uma opção de frete';
    }

    if (Object.keys(fe).length > 0) {
      setFieldErrors(fe);
      toast.error('Preencha os campos destacados antes de continuar.');
      return;
    }

    setFieldErrors({});
    setErrors([]);
    setIsSubmitting(true);

    const orderId = uuidv4();

    try {
      console.log(`[Checkout] Submitting order ${orderId} — total=${totals.total}, subtotal=${totals.subtotal}, shipping=${totals.shipping}, coupon=${appliedCoupon?.code || 'none'}, discount=${appliedCoupon?.discountValue ?? 0}`);

      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-1d6e33e0/checkout/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`
        },
        body: JSON.stringify({
          orderId,
          couponCode:    appliedCoupon?.code ?? null,
          discountValue: appliedCoupon?.discountValue ?? 0,
          shippingDiscount: appliedCoupon?.shippingDiscount ?? 0,
          freeShipping:  appliedCoupon?.freeShipping ?? false,
          subtotal:      totals.subtotal,
          customer: {
            name: name.trim(),
            email: email.trim(),
            document: cpf.replace(/\D/g, ''),
            phone: phone.replace(/\D/g, ''),
          },
          address: {
            cep: cep.replace(/\D/g, ''),
            street,
            number,
            complement,
            district,
            city,
            state: uf,
          },
          items: items.map(i => ({
            id: i.sku,
            name: i.name,
            description: i.name,
            quantity: i.qty,
            qty: i.qty,
            price: i.unitPrice,
            unitPrice: i.unitPrice,
          })),
          shippingValue: totals.shipping || 0,
          totals: { total: totals.total, subtotal: totals.subtotal, shipping: totals.shipping },
          shipping: shipping ? {
            carrier:       shipping.carrier,
            service:       shipping.name,
            estimatedDays: shipping.estimatedDays,
            price:         shipping.price,
          } : null,
          paymentMethodIntent,
          // Stripe redirect URLs — frontend passes its own origin so the server
          // can construct correct redirect URLs without needing FRONTEND_URL env var.
          successUrl: `${window.location.origin}/pedido/obrigado?orderId=${orderId}`,
          cancelUrl:  `${window.location.origin}/checkout?cancelled=1`,
          billingType: 'UNDEFINED',
          chargeType: 'DETACHED',
          discount: 0,
          fine: 0,
          interest: 0,
          callback: {
            successUrl: `${window.location.origin}/pedido/obrigado?orderId=${orderId}`,
            autoRedirect: true
          }
        })
      });

      // Handle non-JSON responses (e.g. 502, 504 gateway errors)
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const text = await response.text();
        console.error(`[Checkout] Non-JSON response (${response.status}):`, text);
        throw new Error(`Erro de servidor (HTTP ${response.status}). Tente novamente em alguns segundos.`);
      }

      const result = await response.json();
      console.log('[Checkout] Server response:', result);

      if (!result.success) throw new Error(result.error || 'Erro ao gerar checkout');

      // Todos os providers retornam checkoutUrl — redirect uniforme
      if (result.checkoutUrl) {
        toast.success('Pedido criado! Redirecionando para pagamento...');
        // Clear abandoned cart after successful purchase
        await clearAbandoned(wasRecovered);
        // Redeem coupon after order confirmed (idempotent)
        if (appliedCoupon?.code) {
          fetch(`https://${projectId}.supabase.co/functions/v1/make-server-1d6e33e0/coupons/redeem`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${publicAnonKey}` },
            body: JSON.stringify({ code: appliedCoupon.code, email, orderId }),
          }).catch(() => {});
        }
        clearCart();
        // Use window.open for external checkout URLs (iframe-safe)
        // Falls back to location.href for same-origin URLs
        try {
          const isExternal = !result.checkoutUrl.startsWith(window.location.origin);
          if (isExternal) {
            const win = window.open(result.checkoutUrl, '_blank');
            if (!win) {
              // Popup blocked — try top-level redirect as fallback
              console.warn('[Checkout] Popup blocked, trying top-level redirect');
              (window.top || window).location.href = result.checkoutUrl;
            }
          } else {
            window.location.href = result.checkoutUrl;
          }
        } catch {
          // Cross-origin iframe restriction — direct assign as last resort
          window.location.href = result.checkoutUrl;
        }
        // Reset submitting after a timeout in case redirect doesn't navigate away
        setTimeout(() => setIsSubmitting(false), 5000);
        return;
      }

      throw new Error('Resposta inesperada do servidor');
    } catch (err: any) {
      console.error('[Checkout] Error:', err);
      const msg = err.message || 'Erro ao processar pagamento';
      setErrors([msg]);
      toast.error(msg, { duration: 6000 });
      setIsSubmitting(false);
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  if (isRecovering) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-6">
        <div className="w-16 h-16 border-4 border-amber-200 border-t-amber-500 rounded-full animate-spin mb-6" />
        <h2 className="text-xl font-bold text-foreground mb-2">Restaurando seu carrinho</h2>
        <p className="text-muted-foreground max-w-xs mx-auto">
          Recuperando seus itens e dados de entrega...
        </p>
      </div>
    );
  }

  if (isSubmitting) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-6">
        <div className="w-16 h-16 border-4 border-primary/20 border-t-primary rounded-full animate-spin mb-6" />
        <h2 className="text-xl font-bold text-foreground mb-2">Preparando seu pagamento</h2>
        <p className="text-muted-foreground max-w-xs mx-auto">
          Estamos gerando sua cobrança segura. Você será redirecionado em instantes...
        </p>
      </div>
    );
  }

  if (isEmpty) {
    return (
      <>
        <SEOHead title="Checkout | Toyoparts" robots="noindex,nofollow" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
              <ShoppingBag className="w-7 h-7 text-muted-foreground/40" />
            </div>
            <h1 className="text-xl font-semibold text-foreground mb-2">Carrinho vazio</h1>
            <p className="text-sm text-muted-foreground mb-6">Adicione produtos antes de finalizar a compra.</p>
            <Link to="/pecas">
              <Button className="rounded-full px-6 h-10 gap-2">
                <ArrowLeft className="w-4 h-4" /> Explorar peças
              </Button>
            </Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <SEOHead title="Checkout | Toyoparts" robots="noindex,nofollow" />
      
      {/* Header Minimalista de Checkout */}
      <header className="bg-white border-b border-border py-3 sticky top-0 z-50 shadow-sm/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => navigate(-1)} 
              className="p-2 -ml-2 hover:bg-slate-100 rounded-full transition-colors group"
              title="Voltar"
            >
              <ArrowLeft className="w-5 h-5 text-slate-400 group-hover:text-slate-900" />
            </button>
            <Link to="/" className="flex items-center group">
              <ToyopartsLogo className="h-6 w-auto" color="#D41216" showBadge={false} />
            </Link>
          </div>
          
          <div className="hidden md:flex items-center gap-6 text-[11px] font-bold text-slate-400 uppercase tracking-widest">
            <div className="flex items-center gap-2 text-primary">
              <span className="w-5 h-5 rounded-full border-2 border-primary flex items-center justify-center text-[10px]">1</span>
              <span>Identificação</span>
            </div>
            <div className="w-8 h-[1px] bg-slate-200" />
            <div className="flex items-center gap-2 opacity-50">
              <span className="w-5 h-5 rounded-full border-2 border-current flex items-center justify-center text-[10px]">2</span>
              <span>Pagamento</span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-slate-500 text-xs font-medium bg-slate-50 px-3 py-1.5 rounded-full border border-slate-100">
            <Lock className="w-3.5 h-3.5 text-green-600" />
            <span className="hidden sm:inline">Ambiente Seguro</span>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 bg-slate-50/50 min-h-screen">
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-1 lg:grid-cols-12 gap-10"
        >
          {/* ── Left: Forms ── */}
          <div className="lg:col-span-7 space-y-6">

            {/* ── Abandoned Cart Banner ── */}
            <AbandonedCartBanner
              onRestore={(data: AbandonedCartData) => {
                if (data.name)  setName(data.name);
                if (data.email) setEmail(data.email);
                data.cart.forEach(item => {
                  addItem({
                    sku:           item.sku,
                    name:          item.name,
                    unitPrice:     item.unitPrice,
                    originalPrice: item.originalPrice,
                    imageUrl:      item.imageUrl,
                    urlKey:        item.urlKey,
                    inStock:       true,
                    weight:        null,
                  }, item.qty);
                });
                setWasRecovered(true);
                setShowAddress(true);
                toast.success('Carrinho restaurado! Verifique os preços antes de finalizar.', { duration: 5000 });
              }}
            />

            {/* ── Recovered notice ── */}
            {wasRecovered && (
              <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                <span className="text-amber-500 text-base mt-0.5">⚠️</span>
                <p className="text-[12px] text-amber-800 font-medium leading-snug">
                  Carrinho restaurado. Preços e disponibilidade de estoque foram atualizados automaticamente — verifique os valores antes de finalizar.
                </p>
              </div>
            )}

            {/* ── Customer Info ── */}
            <motion.section 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-card rounded-2xl border border-border p-5 sm:p-6 shadow-sm hover:shadow-md/5 transition-shadow group"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-primary/5 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                  <User className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-[16px] font-bold text-slate-900">Dados pessoais</h2>
                  <p className="text-[12px] text-slate-500 font-medium">Identificação para nota fiscal</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">Nome completo *</label>
                  <Input
                    name="name"
                    autoComplete="name"
                    value={name} onChange={e => { setName(e.target.value); clearFieldError('name'); }} placeholder="Ex: João da Silva" className={`h-12 rounded-xl bg-slate-50/50 focus:bg-white focus:ring-4 transition-all ${fieldErrors.name ? 'border-red-400 focus:ring-red-500/10 bg-red-50/30' : 'border-slate-200 focus:ring-primary/5'}`} />
                  {fieldErrors.name && (
                    <p className="flex items-center gap-1 text-red-500 text-[10px] font-bold mt-1.5">
                      <AlertCircle className="w-3 h-3 flex-shrink-0" />{fieldErrors.name}
                    </p>
                  )}
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">E-mail *</label>
                  <Input
                    name="email"
                    autoComplete="email"
                    type="email" value={email} onChange={e => { setEmail(e.target.value); clearFieldError('email'); }} placeholder="seu@email.com" className={`h-12 rounded-xl bg-slate-50/50 focus:bg-white focus:ring-4 transition-all ${fieldErrors.email ? 'border-red-400 focus:ring-red-500/10 bg-red-50/30' : 'border-slate-200 focus:ring-primary/5'}`} />
                  {fieldErrors.email && (
                    <p className="flex items-center gap-1 text-red-500 text-[10px] font-bold mt-1.5">
                      <AlertCircle className="w-3 h-3 flex-shrink-0" />{fieldErrors.email}
                    </p>
                  )}
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">CPF *</label>
                  <Input
                    name="cpf"
                    autoComplete="off"
                    value={cpf} onChange={e => { setCpf(maskCPF(e.target.value)); clearFieldError('cpf'); }} placeholder="000.000.000-00" maxLength={14} className={`h-12 rounded-xl bg-slate-50/50 focus:bg-white focus:ring-4 transition-all ${fieldErrors.cpf ? 'border-red-400 focus:ring-red-500/10 bg-red-50/30' : 'border-slate-200 focus:ring-primary/5'}`} />
                  {fieldErrors.cpf && (
                    <p className="flex items-center gap-1 text-red-500 text-[10px] font-bold mt-1.5">
                      <AlertCircle className="w-3 h-3 flex-shrink-0" />{fieldErrors.cpf}
                    </p>
                  )}
                </div>
                <div className="sm:col-span-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">WhatsApp / Telefone *</label>
                  <Input
                    name="tel"
                    autoComplete="tel"
                    value={phone} onChange={e => { setPhone(maskPhone(e.target.value)); clearFieldError('phone'); }} placeholder="(00) 00000-0000" maxLength={15} className={`h-12 rounded-xl bg-slate-50/50 focus:bg-white focus:ring-4 transition-all ${fieldErrors.phone ? 'border-red-400 focus:ring-red-500/10 bg-red-50/30' : 'border-slate-200 focus:ring-primary/5'}`} />
                  {fieldErrors.phone && (
                    <p className="flex items-center gap-1 text-red-500 text-[10px] font-bold mt-1.5">
                      <AlertCircle className="w-3 h-3 flex-shrink-0" />{fieldErrors.phone}
                    </p>
                  )}
                </div>
              </div>
            </motion.section>

            {/* ── Address (expandable) ── */}
            <motion.section 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-card rounded-2xl border border-border overflow-hidden shadow-sm hover:shadow-md/5 transition-shadow"
            >
              <button
                onClick={() => setShowAddress(!showAddress)}
                className="w-full flex items-center justify-between p-5 sm:p-6 text-left hover:bg-muted/30 transition-colors focus-visible:bg-muted/50 outline-none group"
                tabIndex={-1}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${showAddress ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'bg-slate-100 text-slate-400 group-hover:bg-slate-200'}`}>
                    <MapPin className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-[16px] font-bold text-slate-900">Endereço de entrega</h2>
                    <p className="text-[12px] text-slate-500 font-medium">
                      {showAddress ? 'Preencha o CEP para calcular o frete' : 'Clique para preencher o endereço'}
                    </p>
                  </div>
                </div>
                <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform duration-500 ${showAddress ? 'rotate-180' : ''}`} />
              </button>

              <AnimatePresence initial={false}>
                {showAddress && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: "easeInOut" }}
                    className="overflow-hidden"
                  >
                    <div className="px-5 sm:px-6 pb-5 sm:pb-6 border-t border-slate-100">
                      <div className="pt-6 space-y-6">
                        {/* CEP Row */}
                        <div className="max-w-xs">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">CEP de entrega *</label>
                          <div className="relative">
                            <Input 
                              name="postal-code"
                              autoComplete="postal-code"
                              value={cep} 
                              onChange={e => { setCep(maskCEP(e.target.value)); clearFieldError('cep'); }} 
                              placeholder="00000-000" 
                              maxLength={9} 
                              className={`h-12 rounded-xl bg-slate-50/50 focus:bg-white focus:ring-4 transition-all pr-12 font-bold text-slate-900 ${fieldErrors.cep ? 'border-red-400 focus:ring-red-500/10 bg-red-50/30' : 'border-slate-200 focus:ring-primary/5'}`}
                            />
                            <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center">
                              {isLoadingCEP ? (
                                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                              ) : cep.length === 9 && !shippingError && (
                                <CheckCircle2 className="w-4 h-4 text-green-500" />
                              )}
                            </div>
                          </div>
                          {fieldErrors.cep && (
                            <p className="flex items-center gap-1 text-red-500 text-[10px] font-bold mt-1.5">
                              <AlertCircle className="w-3 h-3 flex-shrink-0" />{fieldErrors.cep}
                            </p>
                          )}
                        </div>

                        {/* Smart Address Layout */}
                        <AnimatePresence mode="wait">
                          {street && !isLoadingCEP && (
                            <motion.div
                              initial={{ opacity: 0, y: 5 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -5 }}
                              className="space-y-4"
                            >
                              {!isEditingAddress ? (
                                // Summary Mode
                                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 flex items-start justify-between group/addr">
                                  <div className="space-y-1">
                                    <p className="text-sm font-bold text-slate-900 leading-tight">
                                      {street}, {district}
                                    </p>
                                    <p className="text-xs text-slate-500 font-medium">
                                      {city} - {uf}
                                    </p>
                                  </div>
                                  <button 
                                    onClick={() => setIsEditingAddress(true)}
                                    className="text-[11px] font-bold text-primary hover:underline"
                                  >
                                    Editar
                                  </button>
                                </div>
                              ) : (
                                // Manual Edit Mode
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50/30 p-4 rounded-2xl border border-dashed border-slate-200">
                                  <div className="sm:col-span-2">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">Logradouro</label>
                                    <Input value={street} onChange={e => setStreet(e.target.value)}
                                      name="address-line1"
                                      autoComplete="address-line1"
                                      className="h-10 bg-white" />
                                  </div>
                                  <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">Bairro</label>
                                    <Input value={district} onChange={e => setDistrict(e.target.value)}
                                      name="address-level3"
                                      autoComplete="off"
                                      className="h-10 bg-white" />
                                  </div>
                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">Cidade</label>
                                      <Input value={city} onChange={e => setCity(e.target.value)}
                                        name="address-level2"
                                        autoComplete="address-level2"
                                        className="h-10 bg-white" />
                                    </div>
                                    <div>
                                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">UF</label>
                                      <select
                                        value={uf}
                                        onChange={e => setUf(e.target.value)}
                                        className="w-full h-10 rounded-lg border border-slate-200 bg-white px-2 text-base md:text-xs font-bold text-slate-900 outline-none appearance-none"
                                      >
                                        <option value="">UF</option>
                                        {UF_LIST.map(u => <option key={u} value={u}>{u}</option>)}
                                      </select>
                                    </div>
                                  </div>
                                  <div className="sm:col-span-2 flex justify-end">
                                    <button 
                                      onClick={() => setIsEditingAddress(false)}
                                      className="text-[10px] font-bold text-slate-400 uppercase tracking-widest hover:text-slate-900"
                                    >
                                      Confirmar Ajustes
                                    </button>
                                  </div>
                                </div>
                              )}

                              {/* Number & Complement - ALWAYS VISIBLE if street exists */}
                              <div className="grid grid-cols-2 gap-4 pt-2">
                                <div>
                                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">Número *</label>
                                  <Input 
                                    id="address-number"
                                    name="address-line2"
                                    autoComplete="address-line2"
                                    value={number} 
                                    onChange={e => { setNumber(e.target.value); clearFieldError('number'); }} 
                                    placeholder="Ex: 123" 
                                    className={`h-12 rounded-xl focus:ring-4 transition-all font-bold ${fieldErrors.number ? 'border-red-400 focus:ring-red-500/10 bg-red-50/30' : 'border-slate-200 focus:border-primary focus:ring-primary/5'}`}
                                  />
                                  {fieldErrors.number && (
                                    <p className="flex items-center gap-1 text-red-500 text-[10px] font-bold mt-1.5">
                                      <AlertCircle className="w-3 h-3 flex-shrink-0" />{fieldErrors.number}
                                    </p>
                                  )}
                                </div>
                                <div>
                                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">Complemento</label>
                                  <Input 
                                    name="address-line3"
                                    autoComplete="off"
                                    value={complement} 
                                    onChange={e => setComplement(e.target.value)} 
                                    placeholder="Apto, Sala, Bloco..." 
                                    className="h-12 rounded-xl border-slate-200 focus:border-primary focus:ring-4 focus:ring-primary/5 transition-all font-bold" 
                                  />
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      {/* ── Shipping Options ── */}
                      <div className="mt-8 pt-8 border-t border-slate-100">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                            <Truck className="w-4 h-4 text-primary" /> Opções de frete
                          </h3>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 mb-4">
                          <div className="flex items-start gap-3">
                            <CreditCard className="w-4 h-4 text-primary mt-0.5" />
                            <div className="min-w-0 flex-1">
                              <p className="text-[12px] font-bold text-slate-900 uppercase tracking-widest">
                                Forma de pagamento desejada
                              </p>
                              <p className="text-[12px] text-slate-500 mt-1">
                                Usamos esta intenção para validar benefícios promocionais de frete antes do redirecionamento ao provedor.
                              </p>
                              <div className="mt-3 flex flex-wrap gap-2">
                                {[
                                  { value: 'pix' as PaymentMethodIntent, label: 'PIX' },
                                  { value: 'credit_card' as PaymentMethodIntent, label: 'Cartão' },
                                  { value: 'boleto' as PaymentMethodIntent, label: 'Boleto' },
                                ].map((option) => {
                                  const active = paymentMethodIntent === option.value;
                                  return (
                                    <button
                                      key={option.value}
                                      type="button"
                                      onClick={() => setPaymentMethodIntent(option.value)}
                                      className={`rounded-full border px-4 py-2 text-xs font-bold transition-all ${
                                        active
                                          ? 'border-primary bg-primary text-white shadow-sm'
                                          : 'border-slate-200 bg-white text-slate-600 hover:border-primary/30 hover:text-slate-900'
                                      }`}
                                    >
                                      {option.label}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        </div>

                        {shippingAppliedRule && (
                          <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                            <div className="flex items-start gap-3">
                              <Sparkles className="w-4 h-4 text-emerald-600 mt-0.5" />
                              <div>
                                <p className="text-sm font-bold text-emerald-800">{shippingAppliedRule.ruleName}</p>
                                <p className="text-[12px] text-emerald-700 mt-1">{shippingAppliedRule.message}</p>
                              </div>
                            </div>
                          </div>
                        )}

                        {!shippingAppliedRule && shippingPotentialRules.length > 0 && (
                          <div className="mb-4 rounded-2xl border border-blue-200 bg-blue-50 p-4">
                            <div className="flex items-start gap-3">
                              <Sparkles className="w-4 h-4 text-blue-600 mt-0.5" />
                              <div>
                                <p className="text-sm font-bold text-blue-800">Benefício potencial de frete grátis</p>
                                <p className="text-[12px] text-blue-700 mt-1">
                                  {shippingPotentialRules[0]?.message} A seleção acima confirma a regra antes do redirecionamento.
                                </p>
                              </div>
                            </div>
                          </div>
                        )}

                        {shippingWhatsAppOffer && (
                          <a
                            href={shippingWhatsAppOffer.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mb-4 flex items-start gap-3 rounded-2xl border border-[#25D366]/25 bg-[#25D366]/10 p-4 transition-colors hover:bg-[#25D366]/15"
                          >
                            <MessageCircle className="w-4 h-4 text-[#128C7E] mt-0.5" />
                            <div>
                              <p className="text-sm font-bold text-[#128C7E]">Frete grátis exclusivo no WhatsApp</p>
                              <p className="text-[12px] text-[#128C7E]/90 mt-1">{shippingWhatsAppOffer.message}</p>
                            </div>
                          </a>
                        )}

                        <p className="mb-4 text-[11px] font-medium text-slate-500">
                          A forma de pagamento final ainda será confirmada na página segura do provedor.
                        </p>
                        
                        {isLoadingShipping ? (
                          <div className="flex items-center justify-center gap-3 text-sm text-slate-500 p-8 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                            <Loader2 className="w-5 h-5 animate-spin text-primary" />
                            <span className="font-medium">Buscando melhores rotas...</span>
                          </div>
                        ) : quotes.length > 0 ? (
                          <div className="space-y-3">
                            {quotes.map((opt, idx) => {
                              const isFreeByRule = eligibleFreeShippingServiceIds.includes(opt.id) || opt.freeShipping === true;

                              return (
                                <motion.button
                                  key={opt.id}
                                  initial={{ opacity: 0, y: 5 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  transition={{ delay: idx * 0.05 }}
                                  onClick={() => setShipping(opt)}
                                  className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all text-left relative overflow-hidden group/opt ${
                                    shipping?.id === opt.id 
                                      ? 'border-primary bg-primary/[0.03] ring-2 ring-primary/20 shadow-sm' 
                                      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'
                                  }`}
                                >
                                  <div className="flex items-center gap-4 relative z-10">
                                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${shipping?.id === opt.id ? 'border-primary bg-primary' : 'border-slate-300 bg-white'}`}>
                                      {shipping?.id === opt.id && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                                    </div>
                                    <div>
                                      <div className="flex flex-wrap items-center gap-2">
                                        <p className="text-[14px] font-bold text-slate-900">{opt.name}</p>
                                        {isFreeByRule && (
                                          <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                                            Grátis por regra
                                          </span>
                                        )}
                                      </div>
                                      <p className="text-[12px] text-slate-500 font-medium">Receba em {opt.estimatedDays} dias</p>
                                      {opt.message && (
                                        <p className="text-[11px] text-emerald-700 mt-1">{opt.message}</p>
                                      )}
                                    </div>
                                  </div>
                                  <div className="text-right relative z-10">
                                    {opt.originalPrice && opt.originalPrice > opt.price && (
                                      <p className="text-[11px] text-slate-400 line-through">
                                        {formatBRL(opt.originalPrice)}
                                      </p>
                                    )}
                                    <p className={`text-[15px] font-black ${shipping?.id === opt.id ? 'text-primary' : 'text-slate-900'}`}>
                                      {opt.price === 0 ? 'Grátis' : formatBRL(opt.price)}
                                    </p>
                                  </div>
                                </motion.button>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="p-5 bg-slate-50 border border-slate-200 rounded-2xl text-slate-500 text-sm flex items-center gap-3">
                            <AlertCircle className="w-5 h-5 text-slate-400" />
                            <p className="font-medium">Informe o CEP para ver as opções.</p>
                          </div>
                        )}
                        {fieldErrors.shipping && (
                          <p className="flex items-center gap-1 text-red-500 text-[10px] font-bold mt-3">
                            <AlertCircle className="w-3 h-3 flex-shrink-0" />{fieldErrors.shipping}
                          </p>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.section>

            {/* ── Errors ── */}
            {errors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                  <div className="space-y-1">
                    {errors.map((e, i) => (
                      <p key={i} className="text-[13px] text-red-700">{e}</p>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Right: Order summary (sticky) ── */}
          <div className="lg:col-span-5">
            <div className="bg-card rounded-2xl border border-border p-5 sm:p-6 sticky top-24 shadow-sm">
              <h2 className="text-[15px] font-bold text-slate-900 mb-5 flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-primary" /> Resumo do pedido
              </h2>

              {/* Items */}
              <div className="space-y-3 mb-4 max-h-[300px] overflow-y-auto pr-1">
                {items.map(item => (
                  <div key={item.sku} className="flex gap-3">
                    <div className="w-12 h-12 flex-shrink-0 rounded-lg bg-muted/50 flex items-center justify-center overflow-hidden">
                      {item.imageUrl && !imgErrors.has(item.sku) ? (
                        <img
                          src={item.imageUrl}
                          alt=""
                          className="w-full h-full object-cover"
                          onError={() => setImgErrors(prev => new Set(prev).add(item.sku))}
                        />
                      ) : (
                        <ToyotaPlaceholder className="w-full h-full p-1" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] text-foreground font-medium leading-snug line-clamp-2">{item.name}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {item.qty}x {formatBRL(item.unitPrice)}
                      </p>
                    </div>
                    <span className="text-[12px] font-semibold text-foreground tabular-nums flex-shrink-0">
                      {formatBRL(item.unitPrice * item.qty)}
                    </span>
                  </div>
                ))}
              </div>

              {/* ── Coupon input ── */}
              <div className="mb-4 pt-4 border-t border-border">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Cupom de desconto</p>
                <CouponInput
                  subtotal={totals.subtotal}
                  shippingValue={shipping?.price ?? 0}
                  email={email}
                  items={items.map(i => ({ sku: i.sku, qty: i.qty, unitPrice: i.unitPrice }))}
                  applied={appliedCoupon}
                  onApply={c => setAppliedCoupon(c)}
                  onRemove={() => setAppliedCoupon(null)}
                />
              </div>

              {/* Totals */}
              <div className="border-t border-border pt-3 space-y-2 text-[13px]">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span className="tabular-nums">{formatBRL(totals.subtotal)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Frete</span>
                  <span className={`tabular-nums ${(totals.shipping === 0 || appliedCoupon?.freeShipping) ? 'text-green-600 font-medium' : ''}`}>
                    {appliedCoupon?.freeShipping
                      ? 'Grátis'
                      : totals.shipping == null
                        ? 'A calcular'
                        : totals.shipping === 0
                          ? 'Grátis'
                          : formatBRL(totals.shipping)}
                  </span>
                </div>
                {appliedCoupon && appliedCoupon.discountValue > 0 && (
                  <div className="flex justify-between text-green-600 font-medium">
                    <span className="flex items-center gap-1">
                      <Tag className="w-3 h-3" /> Desconto ({appliedCoupon.code})
                    </span>
                    <span className="tabular-nums">−{formatBRL(appliedCoupon.discountValue)}</span>
                  </div>
                )}
                {appliedCoupon?.freeShipping && appliedCoupon.shippingDiscount > 0 && (
                  <div className="flex justify-between text-green-600 font-medium">
                    <span className="flex items-center gap-1">
                      <Truck className="w-3 h-3" /> Frete grátis
                    </span>
                    <span className="tabular-nums">−{formatBRL(appliedCoupon.shippingDiscount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-foreground font-bold text-base pt-2 border-t border-border">
                  <span>Total</span>
                  <span className="tabular-nums">
                    {formatBRL(
                      totals.total
                      - (appliedCoupon?.discountValue ?? 0)
                      - (appliedCoupon?.freeShipping ? (appliedCoupon.shippingDiscount) : 0)
                    )}
                  </span>
                </div>
              </div>

              {/* Trust badges */}
              <div className="flex items-center gap-4 mt-4 pt-3 border-t border-border text-[11px] text-muted-foreground">
                <div className="flex items-center gap-1"><Shield className="w-3.5 h-3.5" /> Compra segura</div>
                <div className="flex items-center gap-1"><Truck className="w-3.5 h-3.5" /> Envio rápido</div>
              </div>

              {/* Pay button */}
              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                onClick={handlePay}
                disabled={isSubmitting}
                className="w-full h-[56px] bg-primary hover:bg-primary/95 disabled:opacity-60 disabled:scale-100 text-white text-[16px] font-bold rounded-2xl flex items-center justify-center gap-3 transition-all mt-6 shadow-xl shadow-primary/20 uppercase tracking-widest relative overflow-hidden group/btn"
              >
                <div className="absolute inset-0 bg-white/10 translate-y-full group-hover/btn:translate-y-0 transition-transform duration-300" />
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin relative z-10" />
                    <span className="relative z-10">Processando...</span>
                  </>
                ) : (
                  <>
                    <CreditCard className="w-5 h-5 relative z-10" />
                    <span className="relative z-10">
                      Finalizar Compra • {formatBRL(
                        totals.total
                        - (appliedCoupon?.discountValue ?? 0)
                        - (appliedCoupon?.freeShipping ? (appliedCoupon.shippingDiscount) : 0)
                      )}
                    </span>
                  </>
                )}
              </motion.button>
            </div>
          </div>
        </motion.div>
      </div>
    </>
  );
}
