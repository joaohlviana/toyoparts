// ─── Trocas e Devoluções ──────────────────────────────────────────────────────

import React from 'react';
import { ShieldCheck, Truck, Search, RefreshCw, AlertTriangle, CheckCircle2, Clock, Phone, FileText, Package } from 'lucide-react';
import { SEOHead } from '../components/seo/SEOHead';
import { PolicyShell, PolicySection, RelatedPage } from '../components/policies/PolicyShell';

const sections: PolicySection[] = [
  {
    id: 'direito-arrependimento',
    title: 'Direito de arrependimento (7 dias)',
    content: (
      <>
        <div className="p-4 bg-green-50 border border-green-200 rounded-xl flex gap-3 mb-4">
          <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
          <p className="text-green-700 text-[13px]">
            <strong>Garantido pelo CDC (Art. 49):</strong> Para compras realizadas fora de
            estabelecimento comercial (internet), você tem direito a desistir da compra em
            até <strong>7 dias corridos</strong> a partir do recebimento do produto, sem
            necessidade de justificativa.
          </p>
        </div>
        <p>
          Neste caso, a Toyoparts providenciará a coleta do produto e o estorno integral
          do valor pago, incluindo o frete de envio original, no prazo de até{' '}
          <strong className="text-foreground">10 dias úteis</strong> após a devolução confirmada.
        </p>
        <p className="mt-2">
          Para exercer este direito, entre em contato com nosso SAC dentro do prazo de 7 dias
          informando o número do pedido.
        </p>
      </>
    ),
  },
  {
    id: 'troca-peca-errada',
    title: 'Peça errada ou divergente do pedido',
    content: (
      <>
        <p>
          Se você recebeu uma peça diferente da solicitada, a Toyoparts assume total
          responsabilidade pela substituição:
        </p>
        <div className="mt-4 space-y-3">
          {[
            { step: '1', label: 'Não aceite no ato da entrega', desc: 'Se perceber a divergência antes de assinar o comprovante, recuse o recebimento e informe ao entregador.' },
            { step: '2', label: 'Registre o problema', desc: 'Fotografe a embalagem, etiqueta e o produto recebido. Guarde a nota fiscal.' },
            { step: '3', label: 'Entre em contato em até 48h', desc: 'Acione nosso SAC pelo WhatsApp ou e-mail com fotos e número do pedido.' },
            { step: '4', label: 'Aguarde a coleta', desc: 'Organizaremos a coleta do produto na sua residência e o reenvio do item correto sem custo.' },
          ].map(s => (
            <div key={s.step} className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-full bg-primary text-white flex items-center justify-center flex-shrink-0 text-[11px] font-black">
                {s.step}
              </div>
              <div>
                <p className="font-semibold text-foreground text-[13px]">{s.label}</p>
                <p className="text-[12px] text-muted-foreground">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </>
    ),
  },
  {
    id: 'defeito-fabricacao',
    title: 'Defeito de fabricação (garantia)',
    content: (
      <>
        <p>
          Todos os produtos vendidos pela Toyoparts são peças <strong className="text-foreground">100%
          genuínas Toyota</strong> e possuem garantia de fábrica. Em caso de defeito de fabricação:
        </p>
        <ul className="space-y-2 mt-3">
          {[
            ['Prazo', '90 dias para produtos duráveis (conforme CDC, Art. 26) + garantia do fabricante Toyota.'],
            ['Comprovação', 'O defeito deve ser de origem fabril, não decorrente de uso inadequado, instalação incorreta ou acidente.'],
            ['Solução', 'Troca por produto idêntico, crédito para nova compra ou estorno integral — à escolha do consumidor.'],
          ].map(([t, d]) => (
            <li key={t} className="flex gap-2.5">
              <span className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
              <span><strong className="text-foreground">{t}:</strong> {d}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl flex gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-amber-700 text-[13px]">
            Peças instaladas por mecânico não habilitado ou em veículo com modificações não
            homologadas podem invalidar a garantia do fabricante. Em caso de dúvida, consulte
            nossa equipe técnica antes da instalação.
          </p>
        </div>
      </>
    ),
  },
  {
    id: 'compatibilidade',
    title: 'Peça compatível — mas não serve?',
    content: (
      <>
        <p>
          Se a peça for genuína e correta para o modelo indicado, mas por alguma razão não
          se encaixar no seu veículo específico (ex.: versão especial, modificação prévia),
          analisamos cada caso individualmente.
        </p>
        <p className="mt-2">
          Recomendamos fortemente verificar a compatibilidade <strong className="text-foreground">antes
          de instalar</strong>. Nossa equipe pode ajudar a identificar a peça exata pelo número
          de chassi do veículo. Peças instaladas não são passíveis de devolução por incompatibilidade.
        </p>
      </>
    ),
  },
  {
    id: 'condicoes-devolucao',
    title: 'Condições para aceite da devolução',
    content: (
      <>
        <p>Para que a devolução seja aceita, o produto deve ser retornado:</p>
        <ul className="space-y-2 mt-3">
          {[
            'Na embalagem original, sem danos ou violações',
            'Sem sinais de uso, instalação ou desgaste',
            'Com todos os itens originais (manual, acessórios)',
            'Acompanhado da nota fiscal original',
            'Dentro do prazo aplicável (7 dias — arrependimento / 90 dias — defeito)',
          ].map(i => (
            <li key={i} className="flex gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
              <span>{i}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl flex gap-3">
          <AlertTriangle className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
          <p className="text-primary text-[13px]">
            <strong>Não aceitamos devolução</strong> de peças já instaladas, com marcas de
            uso ou que sofreram qualquer modificação após o recebimento, exceto em caso
            comprovado de defeito de fabricação.
          </p>
        </div>
      </>
    ),
  },
  {
    id: 'reembolso',
    title: 'Como funciona o reembolso',
    content: (
      <>
        <p>Após a confirmação da devolução e análise do produto, o reembolso é processado em:</p>
        <div className="mt-4 space-y-3">
          {[
            { icon: Clock,     label: 'Pix / Transferência',      prazo: 'Até 3 dias úteis', color: 'bg-green-50 text-green-600' },
            { icon: Clock,     label: 'Cartão de crédito',        prazo: 'Até 2 faturas',    color: 'bg-blue-50 text-blue-600' },
            { icon: Clock,     label: 'Boleto bancário',          prazo: 'Até 5 dias úteis', color: 'bg-amber-50 text-amber-600' },
          ].map(r => (
            <div key={r.label} className="flex items-center gap-3 p-3 rounded-xl border border-border">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${r.color}`}>
                <r.icon className="w-4.5 h-4.5" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-foreground text-[13px]">{r.label}</p>
              </div>
              <span className="text-[12px] font-bold text-muted-foreground">{r.prazo}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[13px]">
          O reembolso é sempre feito pela mesma forma de pagamento utilizada na compra.
        </p>
      </>
    ),
  },
  {
    id: 'como-solicitar',
    title: 'Como solicitar troca ou devolução',
    content: (
      <>
        <p>Entre em contato com nosso SAC pelos canais abaixo, informando:</p>
        <ul className="space-y-1.5 mt-3 mb-5">
          {[
            'Número do pedido',
            'Motivo da solicitação',
            'Fotos do produto e da embalagem (se aplicável)',
          ].map(i => (
            <li key={i} className="flex gap-2.5">
              <FileText className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
              <span>{i}</span>
            </li>
          ))}
        </ul>
        <div className="grid sm:grid-cols-2 gap-3">
          {[
            { label: 'WhatsApp', value: '(43) 3294-1144', href: 'https://api.whatsapp.com/send?phone=554332941144&text=Quero%20solicitar%20troca%20ou%20devolu%C3%A7%C3%A3o', desc: 'Mais rápido — resposta em até 2h' },
            { label: 'E-mail',   value: 'sac@toyoparts.com.br', href: 'mailto:sac@toyoparts.com.br?subject=Solicita%C3%A7%C3%A3o%20de%20Troca%20/%20Devolu%C3%A7%C3%A3o', desc: 'Resposta em até 1 dia útil' },
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
        <p className="mt-3 text-[12px] text-muted-foreground">
          Atendimento: Segunda a Sexta, 8h–18h | Sábado, 8h–12h
        </p>
      </>
    ),
  },
];

const related: RelatedPage[] = [
  { href: '/politica-de-entrega',    label: 'Política de Entrega',  icon: Truck },
  { href: '/rastreamento',           label: 'Rastrear meu pedido',  icon: Search },
  { href: '/politica-de-privacidade', label: 'Privacidade',         icon: ShieldCheck },
];

export function ReturnsPage() {
  return (
    <>
      <SEOHead
        title="Trocas e Devoluções — Toyoparts"
        description="Política de trocas e devoluções da Toyoparts. Direito de arrependimento, garantia de fábrica, condições e como solicitar."
        canonical="https://www.toyoparts.com.br/trocas-e-devolucoes"
      />
      <PolicyShell
        hero={{
          label:     'Trocas e Devoluções',
          title:     'Trocas e Devoluções',
          subtitle:  'Sua satisfação é nossa prioridade. Conheça seus direitos e como exercê-los.',
          icon:      RefreshCw,
          updatedAt: 'Março de 2025',
          color:     'bg-emerald-700',
        }}
        sections={sections}
        related={related}
      />
    </>
  );
}