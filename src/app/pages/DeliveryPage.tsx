// ─── Política de Entrega ──────────────────────────────────────────────────────

import React from 'react';
import { ShieldCheck, RefreshCw, Search, Truck, AlertTriangle, CheckCircle2, Clock, Package } from 'lucide-react';
import { SEOHead } from '../components/seo/SEOHead';
import { PolicyShell, PolicySection, RelatedPage } from '../components/policies/PolicyShell';

const sections: PolicySection[] = [
  {
    id: 'como-funciona',
    title: 'Como funciona o processo de entrega',
    content: (
      <>
        <p>
          Após a confirmação do pagamento, seu pedido entra automaticamente na fila de
          separação e despacho. O cliente receberá atualizações por e-mail em cada etapa do
          processo — por isso, mantenha seu endereço eletrônico atualizado em seu cadastro.
        </p>
        {/* Progress steps */}
        <div className="mt-5 space-y-3">
          {[
            { icon: CheckCircle2, color: 'text-green-600 bg-green-50',  step: '1', label: 'Pagamento confirmado',   desc: 'Prazo de entrega começa a contar a partir deste momento.' },
            { icon: Package,      color: 'text-blue-600 bg-blue-50',    step: '2', label: 'Separação e embalagem', desc: 'Equipe separa o item, confere e embala com cuidado.' },
            { icon: Truck,        color: 'text-primary bg-red-50',      step: '3', label: 'Despacho',             desc: 'Pedido entregue à transportadora ou Correios.' },
            { icon: Clock,        color: 'text-amber-600 bg-amber-50',  step: '4', label: 'Em trânsito',          desc: 'Acompanhe pelo código de rastreio enviado por e-mail.' },
            { icon: CheckCircle2, color: 'text-green-600 bg-green-50',  step: '5', label: 'Entregue',             desc: 'Pedido recebido. Confira o produto conforme instruções abaixo.' },
          ].map(s => (
            <div key={s.step} className="flex items-start gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${s.color}`}>
                <s.icon className="w-4.5 h-4.5" />
              </div>
              <div>
                <p className="font-semibold text-foreground text-[13px]">{s.step}. {s.label}</p>
                <p className="text-[12px] text-muted-foreground">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </>
    ),
  },
  {
    id: 'prazos',
    title: 'Prazos e cálculo do frete',
    content: (
      <>
        <p>
          O prazo de entrega varia de acordo com:
        </p>
        <ul className="space-y-2 mt-3">
          {[
            'Localidade de entrega (CEP de destino)',
            'Modalidade de transporte escolhida (Correios PAC, SEDEX, transportadora)',
            'Peso e volume do pedido',
            'Se o pagamento foi confirmado antes das 14h em dias úteis',
          ].map(i => (
            <li key={i} className="flex gap-2.5">
              <span className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
              <span>{i}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3">
          O valor e prazo estimados são exibidos na tela de checkout <strong className="text-foreground">antes
          da conclusão da compra</strong>, com base no seu CEP.
        </p>
        <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-xl flex gap-3">
          <Clock className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <p className="text-blue-700 text-[13px]">
            Pedidos com pagamento confirmado até as <strong>14h em dias úteis</strong> são
            despachados no mesmo dia. Pedidos confirmados após as 14h ou em fins de semana/
            feriados são despachados no próximo dia útil.
          </p>
        </div>
      </>
    ),
  },
  {
    id: 'frete',
    title: 'Responsabilidade pelo frete e ICMS',
    content: (
      <>
        <p>
          O frete é de encargo do cliente e é calculado automaticamente durante o checkout
          com base em:
        </p>
        <ul className="space-y-1.5 mt-3">
          {[
            'CEP de destino',
            'Tipo de transporte (Correios ou transportadora)',
            'Peso e dimensões do volume',
          ].map(i => (
            <li key={i} className="flex gap-2.5">
              <span className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
              <span>{i}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3">
          Para entregas fora do <strong className="text-foreground">Estado do Paraná</strong>, pode
          incidir <strong className="text-foreground">diferencial de ICMS</strong> conforme a
          legislação tributária vigente. O valor será informado antes da conclusão do pedido.
        </p>
        <p className="mt-2">
          Promoções de <strong className="text-foreground">frete grátis</strong> aplicam-se
          exclusivamente ao produto promocional. A compra conjunta de outros produtos terá o
          frete calculado normalmente para os itens não promocionais.
        </p>
      </>
    ),
  },
  {
    id: 'recebimento',
    title: 'Instruções no ato do recebimento',
    content: (
      <>
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex gap-3 mb-4">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-amber-700 text-[13px]">
            <strong>Importante:</strong> Os Correios e transportadoras não aceitam reclamações
            após a assinatura do comprovante de entrega. Siga rigorosamente as instruções abaixo.
          </p>
        </div>
        <p>Ao receber seu pedido, siga este protocolo:</p>
        <div className="mt-4 space-y-3">
          {[
            {
              cor:   'bg-red-100 text-primary',
              label: 'Embalagem aberta ou avariada',
              desc:  'RECUSE o produto, anote os dados do comprovante de entrega e entre em contato imediatamente com nosso SAC.',
            },
            {
              cor:   'bg-green-100 text-green-700',
              label: 'Embalagem em perfeito estado',
              desc:  'Abra na presença do entregador. Confira a documentação fiscal e verifique se o produto está íntegro, correto e com todos os itens/acessórios.',
            },
          ].map(s => (
            <div key={s.label} className="flex gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${s.cor}`}>
                {s.label.includes('aberta') ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
              </div>
              <div>
                <p className="font-semibold text-foreground text-[13px]">{s.label}</p>
                <p className="text-[12px] text-muted-foreground">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4">
          <strong className="text-foreground">Recuse o produto</strong> caso esteja:
        </p>
        <ul className="space-y-1.5 mt-2">
          {[
            'Danificado',
            'Em desacordo com o pedido',
            'Sem todos os itens e/ou acessórios',
            'Com equívoco no preenchimento da documentação fiscal',
          ].map(i => (
            <li key={i} className="flex gap-2.5">
              <span className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
              <span>{i}</span>
            </li>
          ))}
        </ul>
      </>
    ),
  },
  {
    id: 'atrasos',
    title: 'Atrasos e situações excepcionais',
    content: (
      <>
        <p>
          A Toyoparts não se responsabiliza por atrasos decorrentes de:
        </p>
        <ul className="space-y-1.5 mt-3">
          {[
            'Greve nos Correios ou transportadoras',
            'Estradas interditadas ou imprevistos climáticos',
            'Retenção por órgãos públicos (exceto quando causada pela Toyoparts)',
            'Endereço incompleto, inexistente ou sem responsável para recebimento',
            'Caso fortuito ou força maior',
          ].map(i => (
            <li key={i} className="flex gap-2.5">
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground mt-2 flex-shrink-0" />
              <span>{i}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3">
          Em caso de retenção por culpa do cliente junto a órgão fiscal, ele deverá comparecer
          pessoalmente ao posto fiscal para liberar a encomenda.
        </p>
        <p className="mt-2">
          Verificando qualquer demora atípica no status do pedido, entre em contato com nosso
          SAC — nossa equipe irá verificar e resolver o problema.
        </p>
      </>
    ),
  },
  {
    id: 'contato',
    title: 'Dúvidas sobre entrega? Fale conosco',
    content: (
      <div className="grid sm:grid-cols-2 gap-3">
        {[
          { label: 'WhatsApp', value: '(43) 3294-1144', href: 'https://api.whatsapp.com/send?phone=554332941144', desc: 'Resposta rápida em horário comercial' },
          { label: 'E-mail',   value: 'sac@toyoparts.com.br', href: 'mailto:sac@toyoparts.com.br', desc: 'Resposta em até 1 dia útil' },
        ].map(c => (
          <a
            key={c.label}
            href={c.href}
            target={c.href.startsWith('http') ? '_blank' : undefined}
            rel="noopener noreferrer"
            className="flex flex-col p-4 rounded-xl border border-border hover:border-primary/30 hover:bg-primary/5 transition-all"
          >
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">{c.label}</span>
            <span className="text-[14px] font-bold text-primary mb-0.5">{c.value}</span>
            <span className="text-[11px] text-muted-foreground">{c.desc}</span>
          </a>
        ))}
      </div>
    ),
  },
];

const related: RelatedPage[] = [
  { href: '/trocas-e-devolucoes',      label: 'Trocas e Devoluções',  icon: RefreshCw },
  { href: '/rastreamento',             label: 'Rastrear meu pedido',  icon: Search },
  { href: '/politica-de-privacidade',  label: 'Privacidade',          icon: ShieldCheck },
];

export function DeliveryPage() {
  return (
    <>
      <SEOHead
        title="Política de Entrega — Toyoparts"
        description="Entenda como funciona o processo de entrega, prazos, cálculo de frete e instruções para recebimento de peças Toyota."
        canonical="https://www.toyoparts.com.br/politica-de-entrega"
      />
      <PolicyShell
        hero={{
          label:     'Política de Entrega',
          title:     'Política de Entrega',
          subtitle:  'Como seu pedido chega até você com segurança e rapidez.',
          icon:      Truck,
          updatedAt: 'Março de 2025',
          color:     'bg-blue-700',
        }}
        sections={sections}
        related={related}
      />
    </>
  );
}