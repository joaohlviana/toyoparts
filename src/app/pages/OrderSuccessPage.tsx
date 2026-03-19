// ─── Order Success / Thank You Page ─────────────────────────────────────────

import React from 'react';
import { Link, useSearchParams } from 'react-router';
import { CheckCircle2, ShoppingBag, ArrowRight, Home, Copy, Check } from 'lucide-react';
import { Button } from '../components/ui/button';
import { SEOHead } from '../components/seo/SEOHead';
import { copyToClipboard } from '../utils/clipboard';

export function OrderSuccessPage() {
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get('orderId') || '';
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    if (orderId) {
      copyToClipboard(orderId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <>
      <SEOHead title="Pedido realizado! | Toyoparts" robots="noindex,nofollow" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
        <div className="max-w-lg mx-auto text-center">
          {/* Animated check icon */}
          <div className="relative w-20 h-20 mx-auto mb-6">
            <div className="absolute inset-0 rounded-full bg-green-100 animate-ping opacity-20" />
            <div className="relative w-20 h-20 rounded-full bg-green-50 border-2 border-green-200 flex items-center justify-center">
              <CheckCircle2 className="w-10 h-10 text-green-500" strokeWidth={1.5} />
            </div>
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight mb-3">
            Pedido realizado!
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base mb-6 leading-relaxed">
            Seu pagamento está sendo processado. Você receberá uma confirmação por e-mail em breve.
          </p>

          {/* Order ID */}
          {orderId && (
            <div className="bg-muted/40 rounded-xl p-4 mb-8 inline-flex items-center gap-3">
              <div className="text-left">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Código do pedido</p>
                <p className="text-sm font-mono font-bold text-foreground mt-0.5 break-all">{orderId.slice(0, 8)}...</p>
              </div>
              <button
                onClick={handleCopy}
                className="w-8 h-8 rounded-lg bg-background border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex-shrink-0"
                title="Copiar código"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          )}

          {/* WhatsApp */}
          <div className="bg-card border border-border rounded-xl p-4 mb-8 text-left">
            <p className="text-[13px] text-muted-foreground mb-2">
              Dúvidas sobre seu pedido? Fale conosco:
            </p>
            <a
              href="https://api.whatsapp.com/send?phone=554332941144&text=Ol%C3%A1!%20Toyoparts!"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-semibold text-green-600 hover:text-green-700 transition-colors"
            >
              <span className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-white fill-current">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                </svg>
              </span>
              (43) 3294-1144
            </a>
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link to="/">
              <Button variant="outline" className="rounded-full px-6 h-10 gap-2">
                <Home className="w-4 h-4" /> Ir para início
              </Button>
            </Link>
            <Link to="/pecas">
              <Button className="rounded-full px-6 h-10 gap-2">
                Continuar comprando <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}