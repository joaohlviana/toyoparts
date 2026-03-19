// ─── Sobre a Toyopar ─────────────────────────────────────────────────────────
// Página institucional: história, missão, valores, números, equipe e contato.

import React, { useRef, useState } from 'react';
import { motion, useInView } from 'motion/react';
import { Link } from 'react-router';
import {
  Award, Truck, ShieldCheck, Users, MapPin, Phone, Mail,
  Instagram, Facebook, Youtube, ArrowRight, Star, Package,
  Clock, Headphones, Wrench, ChevronDown, Heart, Target,
  Eye, Zap, CheckCircle2, Building2, CarFront,
} from 'lucide-react';
import { SEOHead } from '../components/seo/SEOHead';

// ─── Animation helpers ────────────────────────────────────────────────────────
function FadeIn({
  children,
  delay = 0,
  direction = 'up',
  className = '',
}: {
  children: React.ReactNode;
  delay?: number;
  direction?: 'up' | 'left' | 'right' | 'none';
  className?: string;
}) {
  const ref  = useRef(null);
  const seen = useInView(ref, { once: true, margin: '-80px' });
  const initial = {
    opacity: 0,
    y: direction === 'up' ? 32 : 0,
    x: direction === 'left' ? -32 : direction === 'right' ? 32 : 0,
  };
  return (
    <motion.div
      ref={ref}
      initial={initial}
      animate={seen ? { opacity: 1, y: 0, x: 0 } : initial}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ─── Counter animation ────────────────────────────────────────────────────────
function CountUp({ end, suffix = '' }: { end: number; suffix?: string }) {
  const ref    = useRef(null);
  const seen   = useInView(ref, { once: true });
  const [val, setVal] = useState(0);

  React.useEffect(() => {
    if (!seen) return;
    let start    = 0;
    const steps  = 60;
    const inc    = end / steps;
    const ticker = setInterval(() => {
      start += inc;
      if (start >= end) { setVal(end); clearInterval(ticker); return; }
      setVal(Math.floor(start));
    }, 20);
    return () => clearInterval(ticker);
  }, [seen, end]);

  return (
    <span ref={ref} className="tabular-nums">
      {val.toLocaleString('pt-BR')}{suffix}
    </span>
  );
}

// ─── Data ─────────────────────────────────────────────────────────────────────
const TIMELINE = [
  {
    year: '2008',
    title: 'Fundação',
    desc: 'A Toyopar nasce em Londrina (PR) com o sonho de oferecer peças genuínas Toyota com preço justo e atendimento humano.',
  },
  {
    year: '2012',
    title: 'Expansão regional',
    desc: 'Crescimento acelerado no Paraná. Estoque ampliado para mais de 15.000 referências de peças originais Toyota.',
  },
  {
    year: '2017',
    title: 'Loja virtual',
    desc: 'Lançamento da plataforma de e-commerce, levando as peças genuínas Toyota para todo o Brasil com entrega rápida.',
  },
  {
    year: '2020',
    title: 'Centro de distribuição',
    desc: 'Inauguração de novo CD com 3.000 m², permitindo despachos no mesmo dia para pedidos realizados até as 14h.',
  },
  {
    year: '2024',
    title: 'Toyoparts — nova era digital',
    desc: 'Relançamento da plataforma Toyoparts com busca inteligente por IA, catálogo por modelo e experiência omnichannel.',
  },
];

const VALORES = [
  {
    icon: ShieldCheck,
    color: 'bg-red-50 text-primary',
    title: 'Genuíno. Sempre.',
    desc: 'Trabalhamos exclusivamente com peças originais Toyota. Sem réplica, sem genérico — só o que foi feito para o seu carro.',
  },
  {
    icon: Heart,
    color: 'bg-rose-50 text-rose-500',
    title: 'Atendimento que cuida',
    desc: 'Cada cliente tem um nome, não um número. Nossos especialistas estão prontos para encontrar a peça certa pelo modelo e ano do veículo.',
  },
  {
    icon: Zap,
    color: 'bg-amber-50 text-amber-500',
    title: 'Agilidade real',
    desc: 'Estoque local amplo, processamento rápido e parceria com as melhores transportadoras garantem que seu pedido chegue no prazo.',
  },
  {
    icon: Target,
    color: 'bg-blue-50 text-blue-500',
    title: 'Preço justo',
    desc: 'Peça original não precisa ser sinônimo de preço abusivo. Compramos em volume para repassar economia ao cliente final.',
  },
  {
    icon: Eye,
    color: 'bg-green-50 text-green-600',
    title: 'Transparência',
    desc: 'Rastreio em tempo real, notas fiscais eletrônicas e política de troca clara. Sem letras miúdas, sem surpresas.',
  },
  {
    icon: Users,
    color: 'bg-purple-50 text-purple-500',
    title: 'Comunidade Toyota',
    desc: 'Somos apaixonados pela marca tanto quanto você. Dicas, guias de manutenção e conteúdo técnico para donos Toyota.',
  },
];

const NUMEROS = [
  { value: 15,   suffix: '+',  label: 'Anos de experiência',    icon: Award },
  { value: 50000, suffix: '+', label: 'Pedidos entregues',      icon: Package },
  { value: 25000, suffix: '+', label: 'SKUs em catálogo',       icon: Wrench },
  { value: 98,   suffix: '%',  label: 'Avaliações positivas',   icon: Star },
];

const CONTATOS = [
  { icon: Phone,   label: 'Telefone / WhatsApp', value: '(43) 3294-1144', href: 'https://api.whatsapp.com/send?phone=554332941144' },
  { icon: Mail,    label: 'E-mail',              value: 'contato@toyoparts.com.br', href: 'mailto:contato@toyoparts.com.br' },
  { icon: MapPin,  label: 'Endereço',            value: 'Londrina, Paraná — Brasil', href: 'https://maps.google.com/?q=Londrina+PR' },
  { icon: Clock,   label: 'Horário',             value: 'Seg–Sex 8h–18h | Sáb 8h–12h', href: '#' },
];

const SOCIAIS = [
  { icon: Instagram, label: 'Instagram', href: 'https://instagram.com/toyoparts', color: 'hover:text-pink-500' },
  { icon: Facebook,  label: 'Facebook',  href: 'https://facebook.com/toyoparts',  color: 'hover:text-blue-600' },
  { icon: Youtube,   label: 'YouTube',   href: 'https://youtube.com/toyoparts',   color: 'hover:text-red-500' },
];

const MODELOS = ['Hilux', 'Corolla', 'SW4', 'Yaris', 'Etios', 'RAV4', 'Prius', 'Corolla Cross', 'Bandeirante', 'Land Cruiser'];

// ─── Component ────────────────────────────────────────────────────────────────
export function SobrePage() {
  const [faqOpen, setFaqOpen] = useState<number | null>(null);

  const FAQS = [
    { q: 'As peças são 100% originais Toyota?', a: 'Sim. A Toyopar trabalha exclusivamente com peças genuínas Toyota, adquiridas de distribuidores oficiais autorizados. Todos os itens acompanham nota fiscal e garantia de fábrica.' },
    { q: 'Vocês atendem todo o Brasil?', a: 'Sim! Despachamos para todo o território nacional via Correios, Jadlog, Braspress e outras transportadoras. Pedidos até as 14h nos dias úteis saem no mesmo dia.' },
    { q: 'Qual é a política de troca e devolução?', a: 'Em caso de peça errada ou defeito de fabricação, fazemos a troca em até 30 dias. Basta entrar em contato pelo WhatsApp ou e-mail com o número do pedido.' },
    { q: 'Como sei se a peça serve no meu veículo?', a: 'Nossa busca por modelo e ano garante a compatibilidade. Se tiver dúvida, nossa equipe de especialistas ajuda pelo WhatsApp — basta informar o modelo, ano e chassi do veículo.' },
    { q: 'Vocês têm loja física?', a: 'Sim, nossa sede e centro de distribuição ficam em Londrina (PR). Você também pode retirar seu pedido pessoalmente após 2 horas da confirmação do pagamento.' },
  ];

  return (
    <>
      <SEOHead
        title="Sobre a Toyopar — Especialistas em Peças Genuínas Toyota"
        description="Há mais de 15 anos a Toyopar oferece peças originais Toyota com entrega rápida para todo o Brasil. Conheça nossa história, missão e valores."
        canonical="https://www.toyoparts.com.br/sobre"
      />

      <div className="w-full overflow-x-hidden bg-background font-sans">

        {/* ── HERO ─────────────────────────────────────────────────────────── */}
        <section className="relative min-h-[540px] md:min-h-[620px] flex items-center overflow-hidden">
          {/* BG image with dark overlay */}
          <div className="absolute inset-0">
            <img
              src="https://images.unsplash.com/photo-1714213624189-9a9fc8a0736a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxUb3lvdGElMjBjYXIlMjBkZWFsZXJzaGlwJTIwc2hvd3Jvb218ZW58MXx8fHwxNzcyNDYzNTY1fDA&ixlib=rb-4.1.0&q=80&w=1080"
              alt=""
              className="w-full h-full object-cover object-center"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-slate-950/90 via-slate-900/75 to-slate-900/30" />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 via-transparent to-transparent" />
          </div>

          {/* Red accent bar */}
          <div className="absolute top-0 left-0 w-1.5 h-full bg-primary" />

          <div className="relative z-10 max-w-6xl mx-auto px-6 lg:px-8 py-24 md:py-32">
            <FadeIn>
              <div className="inline-flex items-center gap-2 bg-primary/15 border border-primary/30 text-primary text-[11px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full mb-6">
                <Building2 className="w-3.5 h-3.5" /> Quem somos
              </div>
            </FadeIn>
            <FadeIn delay={0.1}>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-black text-white leading-tight mb-5 max-w-2xl">
                Peças genuínas Toyota,<br />
                <span className="text-primary">desde 2008.</span>
              </h1>
            </FadeIn>
            <FadeIn delay={0.2}>
              <p className="text-[17px] md:text-lg text-slate-300 leading-relaxed max-w-xl mb-8">
                A Toyopar nasceu em Londrina (PR) com uma missão simples: levar a peça original Toyota certa, no menor tempo possível, com o atendimento de quem entende do assunto.
              </p>
            </FadeIn>
            <FadeIn delay={0.3} className="flex flex-wrap items-center gap-4">
              <Link
                to="/busca"
                className="inline-flex items-center gap-2 bg-primary text-white px-6 py-3.5 rounded-2xl font-bold text-[15px] hover:bg-primary/90 transition-all shadow-xl shadow-primary/25"
              >
                Ver catálogo <ArrowRight className="w-4 h-4" />
              </Link>
              <a
                href="https://api.whatsapp.com/send?phone=554332941144"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 text-white px-6 py-3.5 rounded-2xl font-bold text-[15px] hover:bg-white/20 transition-all"
              >
                <Headphones className="w-4 h-4" /> Falar com especialista
              </a>
            </FadeIn>
          </div>
        </section>

        {/* ── NÚMEROS ──────────────────────────────────────────────────────── */}
        <section className="bg-primary py-12 md:py-16">
          <div className="max-w-6xl mx-auto px-6 lg:px-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">
              {NUMEROS.map((n, i) => (
                <FadeIn key={n.label} delay={i * 0.1} direction="up" className="text-center">
                  <n.icon className="w-7 h-7 text-white/70 mx-auto mb-2" />
                  <p className="text-3xl md:text-4xl font-black text-white mb-1">
                    <CountUp end={n.value} suffix={n.suffix} />
                  </p>
                  <p className="text-[13px] text-white/75 font-medium">{n.label}</p>
                </FadeIn>
              ))}
            </div>
          </div>
        </section>

        {/* ── HISTÓRIA / SPLIT ─────────────────────────────────────────────── */}
        <section className="py-20 md:py-28">
          <div className="max-w-6xl mx-auto px-6 lg:px-8">
            <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
              {/* Text */}
              <div>
                <FadeIn>
                  <span className="inline-block text-[11px] font-bold uppercase tracking-widest text-primary mb-4">Nossa história</span>
                  <h2 className="text-3xl md:text-4xl font-black text-foreground mb-6 leading-tight">
                    De uma loja em Londrina<br />para todo o Brasil
                  </h2>
                  <div className="space-y-4 text-[15px] text-muted-foreground leading-relaxed">
                    <p>
                      A Toyopar foi fundada por um grupo de apaixonados pela Toyota que percebeu uma lacuna no mercado: os proprietários de veículos da marca tinham dificuldade em encontrar peças genuínas fora das concessionárias — com bom preço e atendimento técnico especializado.
                    </p>
                    <p>
                      Com um estoque criteriosamente selecionado e uma equipe que respira Toyota, construímos ao longo de 15 anos uma operação logística capaz de despachar peças originais para qualquer canto do país, muitas vezes no mesmo dia do pedido.
                    </p>
                    <p>
                      Hoje, o Toyoparts é a evolução digital da Toyopar — uma plataforma com busca inteligente por modelo, chat de suporte especializado e a mesma confiabilidade de sempre, agora em escala nacional.
                    </p>
                  </div>
                </FadeIn>

                {/* Models badge cloud */}
                <FadeIn delay={0.2} className="mt-8">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Modelos que atendemos</p>
                  <div className="flex flex-wrap gap-2">
                    {MODELOS.map(m => (
                      <span key={m} className="inline-flex items-center gap-1 bg-secondary border border-border text-foreground text-[12px] font-semibold px-2.5 py-1 rounded-full">
                        <CarFront className="w-3 h-3 text-primary" /> {m}
                      </span>
                    ))}
                  </div>
                </FadeIn>
              </div>

              {/* Image grid */}
              <FadeIn delay={0.15} direction="right">
                <div className="grid grid-cols-2 gap-3 h-[420px] md:h-[480px]">
                  <div className="relative rounded-2xl overflow-hidden">
                    <img
                      src="https://images.unsplash.com/photo-1583737077549-d078beef3046?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxhdXRvJTIwcGFydHMlMjB3YXJlaG91c2UlMjBpbnZlbnRvcnl8ZW58MXx8fHwxNzcyNDI2Nzc2fDA&ixlib=rb-4.1.0&q=80&w=600"
                      alt="Estoque de peças Toyota"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                    <span className="absolute bottom-3 left-3 text-white text-[11px] font-bold uppercase tracking-wider">Estoque próprio</span>
                  </div>
                  <div className="flex flex-col gap-3">
                    <div className="relative rounded-2xl overflow-hidden flex-1">
                      <img
                        src="https://images.unsplash.com/photo-1633281256183-c0f106f70d76?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxnZW51aW5lJTIwY2FyJTIwZW5naW5lJTIwcGFydHMlMjBjbG9zZSUyMHVwfGVufDF8fHx8MTc3MjQ2MzU3MHww&ixlib=rb-4.1.0&q=80&w=600"
                        alt="Peças originais Toyota"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="relative rounded-2xl overflow-hidden flex-1">
                      <img
                        src="https://images.unsplash.com/photo-1545732870-5dced7323d26?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtZWNoYW5pYyUyMGF1dG8lMjByZXBhaXIlMjB3b3Jrc2hvcCUyMHRlYW18ZW58MXx8fHwxNzcyNDYzNTY2fDA&ixlib=rb-4.1.0&q=80&w=600"
                        alt="Equipe técnica"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                      <span className="absolute bottom-3 left-3 text-white text-[11px] font-bold uppercase tracking-wider">Equipe especialista</span>
                    </div>
                  </div>
                </div>
              </FadeIn>
            </div>
          </div>
        </section>

        {/* ── LINHA DO TEMPO ───────────────────────────────────────────────── */}
        <section className="py-20 md:py-28 bg-slate-950 overflow-hidden">
          <div className="max-w-6xl mx-auto px-6 lg:px-8">
            <FadeIn className="text-center mb-16">
              <span className="inline-block text-[11px] font-bold uppercase tracking-widest text-primary mb-4">15 anos de história</span>
              <h2 className="text-3xl md:text-4xl font-black text-white">Nossa trajetória</h2>
            </FadeIn>

            {/* Timeline — desktop horizontal / mobile vertical */}
            <div className="relative">
              {/* Horizontal connector (desktop) */}
              <div className="hidden lg:block absolute top-[28px] left-0 right-0 h-[2px] bg-slate-800" />
              <div className="hidden lg:block absolute top-[28px] left-0 right-0 h-[2px] bg-gradient-to-r from-primary/0 via-primary to-primary/0 opacity-40" />

              <div className="grid lg:grid-cols-5 gap-8 lg:gap-6">
                {TIMELINE.map((item, i) => (
                  <FadeIn key={item.year} delay={i * 0.1} className="relative flex lg:flex-col gap-4 lg:gap-0">
                    {/* Mobile vertical line */}
                    {i < TIMELINE.length - 1 && (
                      <div className="lg:hidden absolute left-[19px] top-10 bottom-[-32px] w-[2px] bg-slate-800" />
                    )}
                    {/* Dot */}
                    <div className="relative z-10 w-10 h-10 lg:w-14 lg:h-14 rounded-full bg-primary flex items-center justify-center flex-shrink-0 lg:mx-auto lg:mb-5 shadow-lg shadow-primary/30">
                      <span className="text-white font-black text-[10px] lg:text-[11px]">{item.year}</span>
                    </div>
                    <div className="lg:text-center">
                      <p className="text-white font-bold text-[15px] mb-2">{item.title}</p>
                      <p className="text-slate-400 text-[13px] leading-relaxed">{item.desc}</p>
                    </div>
                  </FadeIn>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── MISSÃO + VALORES ─────────────────────────────────────────────── */}
        <section className="py-20 md:py-28">
          <div className="max-w-6xl mx-auto px-6 lg:px-8">
            {/* Mission statement */}
            <FadeIn className="max-w-3xl mx-auto text-center mb-16">
              <span className="inline-block text-[11px] font-bold uppercase tracking-widest text-primary mb-4">Missão & Valores</span>
              <h2 className="text-3xl md:text-4xl font-black text-foreground mb-5">O que nos move todo dia</h2>
              <p className="text-[16px] text-muted-foreground leading-relaxed">
                Nossa missão é ser a referência nacional em peças genuínas Toyota, combinando expertise técnica, logística ágil e atendimento humano — para que cada motorista Toyota mantenha seu carro funcionando com excelência.
              </p>
            </FadeIn>

            {/* Values grid */}
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {VALORES.map((v, i) => (
                <FadeIn key={v.title} delay={i * 0.08}>
                  <div className="group bg-card border border-border rounded-2xl p-6 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300">
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-4 ${v.color} transition-transform group-hover:scale-110 duration-300`}>
                      <v.icon className="w-5 h-5" />
                    </div>
                    <h3 className="text-[15px] font-bold text-foreground mb-2">{v.title}</h3>
                    <p className="text-[13px] text-muted-foreground leading-relaxed">{v.desc}</p>
                  </div>
                </FadeIn>
              ))}
            </div>
          </div>
        </section>

        {/* ── HILUX PARALLAX BREAK ─────────────────────────────────────────── */}
        <section className="relative h-[320px] md:h-[420px] overflow-hidden flex items-center">
          <div className="absolute inset-0">
            <img
              src="https://images.unsplash.com/photo-1758393605683-e28bb39d8917?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxUb3lvdGElMjBIaWx1eCUyMHBpY2t1cCUyMHRydWNrJTIwcm9hZHxlbnwxfHx8fDE3NzI0NjM1NjZ8MA&ixlib=rb-4.1.0&q=80&w=1080"
              alt="Toyota Hilux"
              className="w-full h-full object-cover object-center scale-110"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-slate-950/85 via-slate-900/60 to-slate-950/85" />
          </div>
          <div className="relative z-10 max-w-6xl mx-auto px-6 lg:px-8 text-center w-full">
            <FadeIn>
              <p className="text-[13px] font-bold uppercase tracking-widest text-primary mb-4">Peça original Toyota</p>
              <h2 className="text-3xl md:text-5xl font-black text-white mb-6">
                O certo para o seu carro.<br />Entregue onde você estiver.
              </h2>
              <Link
                to="/busca"
                className="inline-flex items-center gap-2 bg-primary text-white px-7 py-3.5 rounded-2xl font-bold text-[15px] hover:bg-primary/90 transition-all shadow-xl shadow-primary/30"
              >
                Encontrar minha peça <ArrowRight className="w-4 h-4" />
              </Link>
            </FadeIn>
          </div>
        </section>

        {/* ── POR QUE COMPRAR NA TOYOPAR ───────────────────────────────────── */}
        <section className="py-20 md:py-28 bg-secondary/50">
          <div className="max-w-6xl mx-auto px-6 lg:px-8">
            <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
              <FadeIn direction="left">
                <div className="relative rounded-3xl overflow-hidden shadow-2xl">
                  <img
                    src="https://images.unsplash.com/photo-1595596825246-8197d0ed5a3f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxCcmF6aWwlMjBQYXJhbmElMjBMb25kcmluYSUyMGNpdHklMjBhZXJpYWx8ZW58MXx8fHwxNzcyNDYzNTcwfDA&ixlib=rb-4.1.0&q=80&w=800"
                    alt="Londrina Paraná"
                    className="w-full h-[400px] object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 to-transparent" />
                  <div className="absolute bottom-5 left-5 flex items-center gap-2 bg-white/10 backdrop-blur-md border border-white/20 text-white px-4 py-2 rounded-xl">
                    <MapPin className="w-4 h-4 text-primary flex-shrink-0" />
                    <span className="text-[13px] font-semibold">Londrina, Paraná — Brasil</span>
                  </div>
                </div>
              </FadeIn>

              <div>
                <FadeIn>
                  <span className="inline-block text-[11px] font-bold uppercase tracking-widest text-primary mb-4">Por que a Toyopar?</span>
                  <h2 className="text-3xl md:text-4xl font-black text-foreground mb-8 leading-tight">
                    Vantagens que<br />fazem diferença
                  </h2>
                </FadeIn>
                <div className="space-y-5">
                  {[
                    { icon: ShieldCheck, title: 'Peças 100% originais com nota fiscal',     desc: 'Cada item vendido tem procedência garantida, NF-e e garantia de fabricante.' },
                    { icon: Truck,       title: 'Entrega expressa para todo o Brasil',       desc: 'Parceria com Correios, Jadlog e transportadoras regionais. Pedidos expedidos no mesmo dia.' },
                    { icon: Headphones,  title: 'Suporte técnico por especialistas Toyota',  desc: 'Equipe treinada para identificar a peça correta pelo chassi, modelo e ano do veículo.' },
                    { icon: CheckCircle2,title: 'Preço competitivo e parcelamento em 12x',  desc: 'Peça original com preço direto ao consumidor. Aceitamos Pix, boleto e cartão.' },
                  ].map((item, i) => (
                    <FadeIn key={item.title} delay={i * 0.1}>
                      <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-xl bg-primary/8 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <item.icon className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-bold text-foreground text-[15px] mb-1">{item.title}</p>
                          <p className="text-[13px] text-muted-foreground leading-relaxed">{item.desc}</p>
                        </div>
                      </div>
                    </FadeIn>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── FAQ ──────────────────────────────────────────────────────────── */}
        <section className="py-20 md:py-28">
          <div className="max-w-3xl mx-auto px-6 lg:px-8">
            <FadeIn className="text-center mb-12">
              <span className="inline-block text-[11px] font-bold uppercase tracking-widest text-primary mb-4">FAQ</span>
              <h2 className="text-3xl md:text-4xl font-black text-foreground">Perguntas frequentes</h2>
            </FadeIn>
            <div className="space-y-3">
              {FAQS.map((faq, i) => (
                <FadeIn key={i} delay={i * 0.06}>
                  <div className={`border rounded-2xl overflow-hidden transition-all duration-300 ${faqOpen === i ? 'border-primary/40 shadow-md shadow-primary/5' : 'border-border'}`}>
                    <button
                      onClick={() => setFaqOpen(faqOpen === i ? null : i)}
                      className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left hover:bg-secondary/50 transition-colors"
                    >
                      <span className="font-semibold text-[14px] text-foreground">{faq.q}</span>
                      <ChevronDown className={`w-4 h-4 text-muted-foreground flex-shrink-0 transition-transform duration-300 ${faqOpen === i ? 'rotate-180 text-primary' : ''}`} />
                    </button>
                    <motion.div
                      initial={false}
                      animate={{ height: faqOpen === i ? 'auto' : 0, opacity: faqOpen === i ? 1 : 0 }}
                      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                      className="overflow-hidden"
                    >
                      <p className="px-5 pb-5 text-[14px] text-muted-foreground leading-relaxed">{faq.a}</p>
                    </motion.div>
                  </div>
                </FadeIn>
              ))}
            </div>
          </div>
        </section>

        {/* ── CONTATO ──────────────────────────────────────────────────────── */}
        <section className="py-20 md:py-28 bg-slate-950">
          <div className="max-w-6xl mx-auto px-6 lg:px-8">
            <div className="grid lg:grid-cols-2 gap-12 lg:gap-20">
              {/* Info */}
              <div>
                <FadeIn>
                  <span className="inline-block text-[11px] font-bold uppercase tracking-widest text-primary mb-4">Fale com a gente</span>
                  <h2 className="text-3xl md:text-4xl font-black text-white mb-4">Estamos aqui para<br />te ajudar</h2>
                  <p className="text-[15px] text-slate-400 leading-relaxed mb-8">
                    Dúvida sobre compatibilidade? Precisa de suporte pós-venda? Nossa equipe técnica responde rápido.
                  </p>
                </FadeIn>

                <div className="space-y-4">
                  {CONTATOS.map((c, i) => (
                    <FadeIn key={c.label} delay={i * 0.08}>
                      <a
                        href={c.href}
                        target={c.href.startsWith('http') ? '_blank' : undefined}
                        rel="noopener noreferrer"
                        className="flex items-center gap-4 group"
                      >
                        <div className="w-11 h-11 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/20 group-hover:border-primary/40 transition-all">
                          <c.icon className="w-4.5 h-4.5 text-slate-400 group-hover:text-primary transition-colors" />
                        </div>
                        <div>
                          <p className="text-[11px] text-slate-500 font-medium uppercase tracking-wider mb-0.5">{c.label}</p>
                          <p className="text-[14px] text-slate-200 font-semibold group-hover:text-white transition-colors">{c.value}</p>
                        </div>
                      </a>
                    </FadeIn>
                  ))}
                </div>

                {/* Sociais */}
                <FadeIn delay={0.4} className="mt-10 pt-8 border-t border-white/10">
                  <p className="text-[11px] text-slate-500 uppercase tracking-widest font-bold mb-4">Redes sociais</p>
                  <div className="flex items-center gap-3">
                    {SOCIAIS.map(s => (
                      <a
                        key={s.label}
                        href={s.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={s.label}
                        className={`w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 ${s.color} hover:border-white/20 hover:bg-white/10 transition-all`}
                      >
                        <s.icon className="w-4 h-4" />
                      </a>
                    ))}
                  </div>
                </FadeIn>
              </div>

              {/* CTA card */}
              <FadeIn delay={0.2} direction="right">
                <div className="bg-gradient-to-br from-primary to-red-700 rounded-3xl p-8 md:p-10 h-full flex flex-col justify-between shadow-2xl shadow-primary/30">
                  <div>
                    <div className="w-14 h-14 bg-white/15 rounded-2xl flex items-center justify-center mb-6">
                      <Headphones className="w-7 h-7 text-white" />
                    </div>
                    <h3 className="text-2xl md:text-3xl font-black text-white mb-4 leading-tight">
                      Precisa de ajuda para encontrar a peça?
                    </h3>
                    <p className="text-white/80 text-[15px] leading-relaxed mb-8">
                      Informe o modelo, ano e o número do chassi. Nossa equipe encontra a referência exata em minutos — sem complicação.
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <a
                      href="https://api.whatsapp.com/send?phone=554332941144&text=Ol%C3%A1!%20Preciso%20de%20ajuda%20para%20encontrar%20uma%20pe%C3%A7a%20Toyota."
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 flex items-center justify-center gap-2 bg-white text-primary px-5 py-3.5 rounded-xl font-bold text-[14px] hover:bg-white/90 transition-all shadow-lg"
                    >
                      WhatsApp <ArrowRight className="w-4 h-4" />
                    </a>
                    <a
                      href="mailto:contato@toyoparts.com.br"
                      className="flex-1 flex items-center justify-center gap-2 bg-white/15 border border-white/30 text-white px-5 py-3.5 rounded-xl font-bold text-[14px] hover:bg-white/25 transition-all"
                    >
                      E-mail
                    </a>
                  </div>
                </div>
              </FadeIn>
            </div>
          </div>
        </section>

        {/* ── BOTTOM CTA ───────────────────────────────────────────────────── */}
        <section className="py-16 md:py-20 bg-background border-t border-border">
          <div className="max-w-4xl mx-auto px-6 lg:px-8 text-center">
            <FadeIn>
              <div className="inline-flex items-center gap-2 bg-primary/8 border border-primary/15 text-primary text-[11px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full mb-6">
                <Star className="w-3.5 h-3.5 fill-primary" /> Mais de 50.000 pedidos entregues
              </div>
              <h2 className="text-3xl md:text-4xl font-black text-foreground mb-5">
                Pronto para encontrar<br />a peça certa?
              </h2>
              <p className="text-[16px] text-muted-foreground mb-8 max-w-xl mx-auto">
                Busque pelo modelo do seu Toyota, pelo nome da peça ou pelo código OEM. Entregamos para todo o Brasil.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-4">
                <Link
                  to="/busca"
                  className="inline-flex items-center gap-2 bg-primary text-white px-7 py-3.5 rounded-2xl font-bold text-[15px] hover:bg-primary/90 transition-all shadow-xl shadow-primary/25"
                >
                  Buscar peças agora <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  to="/"
                  className="inline-flex items-center gap-2 bg-secondary border border-border text-foreground px-7 py-3.5 rounded-2xl font-bold text-[15px] hover:bg-muted transition-all"
                >
                  Ver catálogo completo
                </Link>
              </div>
            </FadeIn>
          </div>
        </section>

      </div>
    </>
  );
}