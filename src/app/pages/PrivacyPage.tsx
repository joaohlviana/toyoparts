// ─── Política de Privacidade ──────────────────────────────────────────────────

import React from 'react';
import { Truck, RefreshCw, Search, ShieldCheck, Lock } from 'lucide-react';
import { SEOHead } from '../components/seo/SEOHead';
import { PolicyShell, PolicySection, RelatedPage } from '../components/policies/PolicyShell';

const sections: PolicySection[] = [
  {
    id: 'compromisso',
    title: 'Nosso compromisso com sua privacidade',
    content: (
      <>
        <p>
          A Toyoparts tem um enorme apreço pela individualidade e privacidade dos usuários,
          com o máximo respeito pelo segredo das informações e confidencialidade das operações,
          pautado pela transparência, credibilidade e eticidade em todas as relações.
        </p>
        <p>
          Esta política se aplica exclusivamente ao site <strong>www.toyoparts.com.br</strong> e
          a todos os serviços digitais operados pela Toyopar. Recomendamos sua leitura periódica,
          pois está em constante evolução.
        </p>
      </>
    ),
  },
  {
    id: 'dados-coletados',
    title: 'Quais dados coletamos?',
    content: (
      <>
        <p>Coletamos informações necessárias para processar seus pedidos e melhorar sua experiência:</p>
        <ul className="space-y-2 mt-3">
          {[
            ['Dados cadastrais', 'Nome completo, CPF/CNPJ, endereço, telefone e e-mail para criação de conta e emissão de nota fiscal.'],
            ['Dados de entrega', 'CEP e endereço completo para cálculo de frete e despacho do pedido.'],
            ['Dados de pagamento', 'Processados diretamente pelo gateway de pagamento (Asaas, Stripe ou Vindi). A Toyoparts não armazena dados de cartão de crédito.'],
            ['Dados de navegação', 'Cookies, páginas visitadas e buscas realizadas, usados para personalização da experiência e análises internas.'],
          ].map(([titulo, desc]) => (
            <li key={titulo} className="flex gap-2.5">
              <span className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
              <span><strong className="text-foreground">{titulo}:</strong> {desc}</span>
            </li>
          ))}
        </ul>
      </>
    ),
  },
  {
    id: 'uso-dados',
    title: 'Como usamos seus dados?',
    content: (
      <>
        <p>
          Todas as informações fornecidas são de uso exclusivo para o procedimento de compra e
          relacionamento com o cliente. <strong className="text-foreground">Não compartilhamos, vendemos
          ou cedemos seus dados a terceiros</strong>, exceto quando:
        </p>
        <ul className="space-y-2 mt-3">
          {[
            'Necessário para processamento do pagamento (gateway parceiro).',
            'Necessário para entrega do pedido (transportadora contratada).',
            'Exigido por lei ou autoridade competente.',
          ].map(item => (
            <li key={item} className="flex gap-2.5">
              <span className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3">
          Os dados são registrados de modo automatizado e armazenados com total segurança em
          nosso banco de dados, sem intromissão humana desnecessária.
        </p>
      </>
    ),
  },
  {
    id: 'senhas',
    title: 'Senhas e segurança da conta',
    content: (
      <>
        <p>
          As senhas são armazenadas de forma <strong className="text-foreground">criptografada</strong> (hashing
          com salt), de modo que nem a equipe Toyoparts tem acesso à sua senha em texto claro.
          Apenas você, como titular do cadastro, tem conhecimento da senha.
        </p>
        <p>
          Recomendamos usar uma senha única e forte para sua conta. Em caso de suspeita de
          comprometimento, utilize a opção "Esqueci minha senha" imediatamente.
        </p>
      </>
    ),
  },
  {
    id: 'seguranca',
    title: 'Segurança das transações (SSL)',
    content: (
      <>
        <p>
          Os servidores da Toyoparts utilizam certificado SSL com <strong className="text-foreground">criptografia
          de 128 bits</strong>, assegurando que toda informação transmitida em uma sessão protegida
          é codificada contra acesso de terceiros.
        </p>
        <p>
          Você pode verificar a segurança da conexão através do protocolo{' '}
          <strong className="text-foreground">HTTPS</strong> na barra de endereço e pelo
          ícone de cadeado exibido pelo navegador.
        </p>
        <div className="mt-4 flex items-start gap-3 bg-green-50 border border-green-200 rounded-xl p-4">
          <Lock className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
          <p className="text-green-700 text-[13px]">
            Todas as informações financeiras — dados de cartão, boleto ou Pix — transitam
            diretamente pelo gateway de pagamento certificado. A Toyoparts nunca visualiza
            ou armazena esses dados.
          </p>
        </div>
      </>
    ),
  },
  {
    id: 'cookies',
    title: 'Uso de cookies',
    content: (
      <>
        <p>
          Utilizamos cookies para personalizar anúncios, lembrar suas preferências e analisar
          o tráfego do site. Ao continuar navegando você concorda com o uso de cookies conforme
          nossa política.
        </p>
        <p>
          Você pode configurar seu navegador para recusar cookies, mas isso pode limitar
          algumas funcionalidades do site. Para mais informações, acesse nossa política de
          cookies completa disponível no rodapé do site.
        </p>
      </>
    ),
  },
  {
    id: 'seus-direitos',
    title: 'Seus direitos (LGPD)',
    content: (
      <>
        <p>
          Em conformidade com a <strong className="text-foreground">Lei Geral de Proteção de Dados
          (Lei 13.709/2018)</strong>, você tem os seguintes direitos em relação aos seus dados:
        </p>
        <ul className="space-y-2 mt-3">
          {[
            ['Acesso', 'Solicitar a confirmação e acesso aos seus dados pessoais tratados por nós.'],
            ['Correção', 'Solicitar a atualização de dados incompletos, inexatos ou desatualizados.'],
            ['Exclusão', 'Solicitar a exclusão de dados desnecessários ou tratados em desconformidade.'],
            ['Portabilidade', 'Solicitar a transferência dos seus dados para outro fornecedor de serviço.'],
            ['Oposição', 'Opor-se ao tratamento de dados em determinadas situações.'],
          ].map(([dir, desc]) => (
            <li key={dir} className="flex gap-2.5">
              <span className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
              <span><strong className="text-foreground">{dir}:</strong> {desc}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3">
          Para exercer qualquer direito, entre em contato pelo e-mail{' '}
          <a href="mailto:privacidade@toyoparts.com.br" className="text-primary hover:underline font-medium">
            privacidade@toyoparts.com.br
          </a>.
        </p>
      </>
    ),
  },
  {
    id: 'propriedade',
    title: 'Propriedade intelectual',
    content: (
      <p>
        Todos os textos, imagens, sons e/ou aplicativos exibidos no site www.toyoparts.com.br
        estão salvaguardados pelos direitos autorais. Modificações, reproduções, armazenamentos,
        transmissões, cópias, distribuições ou outros modos de publicação para fins comerciais
        requerem prévio e expresso consentimento da Toyopar. Tentativas de invasão ao site serão
        tratadas segundo prescrição legal como dano, roubo ou outra tipificação penal.
      </p>
    ),
  },
  {
    id: 'contato',
    title: 'Contato e DPO',
    content: (
      <>
        <p>
          Em caso de dúvidas sobre esta política ou para exercer seus direitos como titular de dados,
          entre em contato com nosso Encarregado de Proteção de Dados (DPO):
        </p>
        <div className="mt-4 grid sm:grid-cols-2 gap-3">
          {[
            { label: 'E-mail privacidade', value: 'privacidade@toyoparts.com.br', href: 'mailto:privacidade@toyoparts.com.br' },
            { label: 'SAC geral', value: '(43) 3294-1144', href: 'https://api.whatsapp.com/send?phone=554332941144' },
          ].map(c => (
            <a
              key={c.label}
              href={c.href}
              className="flex flex-col p-3.5 rounded-xl border border-border hover:border-primary/30 hover:bg-primary/5 transition-all"
            >
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">{c.label}</span>
              <span className="text-[13px] font-semibold text-primary">{c.value}</span>
            </a>
          ))}
        </div>
      </>
    ),
  },
];

const related: RelatedPage[] = [
  { href: '/politica-de-entrega',    label: 'Política de Entrega',      icon: Truck },
  { href: '/trocas-e-devolucoes',    label: 'Trocas e Devoluções',      icon: RefreshCw },
  { href: '/rastreamento',           label: 'Rastrear meu pedido',      icon: Search },
];

export function PrivacyPage() {
  return (
    <>
      <SEOHead
        title="Política de Privacidade — Toyoparts"
        description="Saiba como a Toyoparts coleta, usa e protege seus dados pessoais em conformidade com a LGPD."
        canonical="https://www.toyoparts.com.br/politica-de-privacidade"
      />
      <PolicyShell
        hero={{
          label:     'Política de Privacidade',
          title:     'Política de Privacidade',
          subtitle:  'Seu dado é seu. Saiba como o tratamos com respeito e transparência.',
          icon:      ShieldCheck,
          updatedAt: 'Março de 2025',
          color:     'bg-slate-900',
        }}
        sections={sections}
        related={related}
      />
    </>
  );
}