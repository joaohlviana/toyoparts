import React, { useMemo, useState } from 'react';
import { Mail, MapPin, MessageCircle, Phone, Send, Clock, ArrowRight } from 'lucide-react';
import { SEOHead } from '../components/seo/SEOHead';

function buildWhatsAppUrl(name: string, email: string, message: string) {
  const lines = [
    'Ola, Toyoparts.',
    name ? `Nome: ${name}` : '',
    email ? `Email: ${email}` : '',
    message ? `Mensagem: ${message}` : '',
  ].filter(Boolean);

  return `https://wa.me/554332941144?text=${encodeURIComponent(lines.join('\n'))}`;
}

export function ContactPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');

  const whatsappUrl = useMemo(
    () => buildWhatsAppUrl(name, email, message),
    [name, email, message],
  );

  return (
    <>
      <SEOHead
        title="Fale Conosco - Toyoparts"
        description="Entre em contato com a Toyoparts por WhatsApp, telefone ou e-mail. Tire duvidas sobre pecas genuinas Toyota, pedidos e entregas."
        canonical="https://www.toyoparts.com.br/fale-conosco"
      />

      <div className="min-h-screen bg-background">
        <section className="bg-slate-950 text-white py-14 md:py-18">
          <div className="max-w-6xl mx-auto px-6 lg:px-8">
            <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-primary/80 mb-4">
              Atendimento
            </p>
            <h1 className="text-3xl md:text-5xl font-black leading-tight max-w-3xl">
              Fale Conosco
            </h1>
            <p className="text-white/70 text-[15px] md:text-[17px] max-w-2xl mt-4 leading-relaxed">
              Estamos prontos para ajudar com pecas genuinas Toyota, rastreio de pedidos,
              compatibilidade e duvidas comerciais.
            </p>
          </div>
        </section>

        <section className="py-12 md:py-16">
          <div className="max-w-6xl mx-auto px-6 lg:px-8 grid lg:grid-cols-[1.05fr_0.95fr] gap-10">
            <div className="bg-card border border-border rounded-3xl p-6 md:p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-11 h-11 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                  <Send className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-black text-foreground">Envie sua mensagem</h2>
                  <p className="text-sm text-muted-foreground">
                    Preencha os campos e continue pelo WhatsApp.
                  </p>
                </div>
              </div>

              <form
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
                }}
              >
                <div className="grid md:grid-cols-2 gap-4">
                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-foreground">Nome</span>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full h-12 rounded-2xl border border-border bg-background px-4 text-sm outline-none transition-colors focus:border-primary"
                      placeholder="Seu nome"
                    />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-foreground">Email</span>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full h-12 rounded-2xl border border-border bg-background px-4 text-sm outline-none transition-colors focus:border-primary"
                      placeholder="voce@exemplo.com"
                    />
                  </label>
                </div>

                <label className="space-y-2">
                  <span className="text-sm font-semibold text-foreground">WhatsApp</span>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full h-12 rounded-2xl border border-border bg-background px-4 text-sm outline-none transition-colors focus:border-primary"
                    placeholder="(43) 99999-9999"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-semibold text-foreground">Mensagem</span>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={6}
                    className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition-colors focus:border-primary resize-y"
                    placeholder="Descreva sua duvida ou a peca que voce procura."
                  />
                </label>

                <div className="flex flex-wrap gap-3 pt-2">
                  <button
                    type="submit"
                    className="inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-primary/90"
                  >
                    Continuar no WhatsApp <ArrowRight className="w-4 h-4" />
                  </button>
                  <a
                    href={`mailto:atendimento@toyoparts.com.br?subject=${encodeURIComponent('Contato pelo site Toyoparts')}&body=${encodeURIComponent(`Nome: ${name}\nEmail: ${email}\nTelefone: ${phone}\n\nMensagem:\n${message}`)}`}
                    className="inline-flex items-center gap-2 rounded-2xl border border-border px-5 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
                  >
                    Enviar por email
                  </a>
                </div>
              </form>
            </div>

            <div className="space-y-5">
              <div className="bg-card border border-border rounded-3xl p-6 md:p-8">
                <h2 className="text-xl font-black text-foreground mb-5">Canais oficiais</h2>
                <div className="space-y-4">
                  {[
                    {
                      icon: Phone,
                      label: 'Telefone',
                      value: '(43) 3294-1144 | Ramal: 1126 | 1196',
                      href: 'tel:+554332941144',
                    },
                    {
                      icon: MessageCircle,
                      label: 'WhatsApp',
                      value: '(43) 3294-1144',
                      href: 'https://wa.me/554332941144',
                    },
                    {
                      icon: Mail,
                      label: 'Email',
                      value: 'atendimento@toyoparts.com.br',
                      href: 'mailto:atendimento@toyoparts.com.br',
                    },
                    {
                      icon: Clock,
                      label: 'Horario',
                      value: 'Seg a Sex: 8h as 18h | Sab: 8h as 12h.',
                      href: null,
                    },
                  ].map((item) => (
                    item.href ? (
                      <a
                        key={item.label}
                        href={item.href}
                        target={item.href.startsWith('http') ? '_blank' : undefined}
                        rel="noopener noreferrer"
                        className="flex items-start gap-4 rounded-2xl border border-border p-4 transition-colors hover:bg-secondary"
                      >
                        <div className="w-11 h-11 rounded-2xl bg-secondary flex items-center justify-center text-primary flex-shrink-0">
                          <item.icon className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{item.label}</p>
                          <p className="text-sm font-semibold text-foreground mt-1">{item.value}</p>
                        </div>
                      </a>
                    ) : (
                      <div key={item.label} className="flex items-start gap-4 rounded-2xl border border-border p-4">
                        <div className="w-11 h-11 rounded-2xl bg-secondary flex items-center justify-center text-primary flex-shrink-0">
                          <item.icon className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{item.label}</p>
                          <p className="text-sm font-semibold text-foreground mt-1">{item.value}</p>
                        </div>
                      </div>
                    )
                  ))}
                </div>
              </div>

              <div className="bg-secondary rounded-3xl p-6 md:p-8 border border-border">
                <div className="flex items-start gap-4">
                  <div className="w-11 h-11 rounded-2xl bg-white text-primary flex items-center justify-center flex-shrink-0">
                    <MapPin className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-foreground">Loja fisica Toyopar</h3>
                    <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                      Av. Tiradentes, 2333, Londrina - PR, CEP 86071-000.
                    </p>
                    <a
                      href="https://maps.google.com/?q=Toyopar+Londrina"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-sm font-semibold text-primary mt-4 hover:underline"
                    >
                      Ver no mapa <ArrowRight className="w-4 h-4" />
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
