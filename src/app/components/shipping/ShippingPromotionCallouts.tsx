import React from 'react';
import { Sparkles } from 'lucide-react';
import type { FreeShippingEvaluationRuleSummary, FreeShippingWhatsAppOffer } from '../../lib/shipping/shipping-types';
import { WhatsAppOfferBanner } from './WhatsAppOfferBanner';

export function ShippingPromotionCallouts({
  appliedRule,
  potentialRules,
  whatsappOffer,
  compact = false,
  onWhatsappClick,
}: {
  appliedRule?: FreeShippingEvaluationRuleSummary | null;
  potentialRules?: FreeShippingEvaluationRuleSummary[];
  whatsappOffer?: FreeShippingWhatsAppOffer | null;
  compact?: boolean;
  onWhatsappClick?: () => void;
}) {
  const bodyClass = compact ? 'text-[11px]' : 'text-[12px]';
  const titleClass = compact ? 'text-xs' : 'text-sm';

  return (
    <>
      {appliedRule ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 h-4 w-4 text-emerald-600" />
            <div>
              <p className={`${titleClass} font-bold text-emerald-800`}>{appliedRule.ruleName}</p>
              <p className={`${bodyClass} mt-1 text-emerald-700`}>{appliedRule.message}</p>
            </div>
          </div>
        </div>
      ) : null}

      {!appliedRule && (potentialRules?.length || 0) > 0 ? (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 h-4 w-4 text-blue-600" />
            <div>
              <p className={`${titleClass} font-bold text-blue-800`}>Beneficio potencial de frete gratis</p>
              <p className={`${bodyClass} mt-1 text-blue-700`}>
                {potentialRules?.[0]?.message} A selecao da transportadora confirma a regra.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {whatsappOffer ? (
        <WhatsAppOfferBanner
          href={whatsappOffer.url}
          message={whatsappOffer.message}
          onClick={onWhatsappClick}
          className={compact ? 'rounded-xl' : ''}
        />
      ) : null}
    </>
  );
}
