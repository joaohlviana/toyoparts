import React, { useMemo, useState } from 'react';
import { Mail, MapPin, MessageCircle, Phone, Send, Clock, ArrowRight, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { SEOHead } from '../components/seo/SEOHead';
import { buildToyopartsWhatsAppUrl } from '../lib/whatsapp';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';

const CONTACT_API = `https://${projectId}.supabase.co/functions/v1/make-server-1d6e33e0/contact-leads`;

function buildWhatsAppUrl(name: string, email: string, phone: string, message: string) {
  const lines = [
    name ? `Nome: ${name}` : '',
    email ? `Email: ${email}` : '',
    phone ? `Telefone: ${phone}` : '',
    message ? `Mensagem: ${message}` : '',
  ].filter(Boolean);

  return buildToyopartsWhatsAppUrl(lines.join('\n'));
}

function buildMailtoUrl(name: string, email: string, phone: string, message: string) {
  return `mailto:atendimento@toyoparts.com.br?subject=${encodeURIComponent('Contato pelo site Toyoparts')}&body=${encodeURIComponent(`Nome: ${name}\nEmail: ${email}\nTelefone: ${phone}\n\nMensagem:\n${message}`)}`;
}

export function ContactPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [submittingChannel, setSubmittingChannel] = useState<'whatsapp' | 'email' | 'phone' | null>(null);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'warning'; message: string } | null>(null);

  const whatsappUrl = useMemo(
    () => buildWhatsAppUrl(name, email, phone, message),
    [name, email, phone, message],
  );
  const mailtoUrl = useMemo(
    () => buildMailtoUrl(name, email, phone, message),
    [name, email, phone, message],
  );

  const registerAndOpenChannel = async ({
    channel,
    targetUrl,
    fallbackMessage,
    openInNewWindow,
  }: {
    channel: 'whatsapp' | 'email' | 'phone';
    targetUrl: string;
    fallbackMessage: string;
    openInNewWindow: boolean;
  }) => {
    const popup = openInNewWindow ? window.open('', '_blank', 'noopener,noreferrer') : null;

    setSubmittingChannel(channel);
    setFeedback(null);

    try {
      const response = await fetch(`${CONTACT_API}/submit`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${publicAnonKey}`,
          apikey: publicAnonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          email,
          phone,
          message: message || fallbackMessage,
          preferredChannel: channel,
          pagePath: '/fale-conosco',
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(String(data?.error || `HTTP ${response.status}`));
      }

      const syonetStatus = data?.integrations?.syonet?.status;
      if (syonetStatus === 'success') {
        setFeedback({
          tone: 'success',
          message: 'Lead cadastrado com sucesso no atendimento. Estamos abrindo o canal escolhido.',
        });
      } else {
        setFeedback({
          tone: 'warning',
          message: 'Contato salvo, mas o envio ao CRM ficou pendente. Vamos continuar com o atendimento mesmo assim.',
        });
      }
    } catch (error) {
      console.error('[contact-page] submit error:', error);
      setFeedback({
        tone: 'warning',
        message: 'Não conseguimos registrar esse contato no CRM agora, mas vamos abrir o canal escolhido para não interromper o atendimento.',
      });
    } finally {
      setSubmittingChannel(null);

      if (openInNewWindow) {
        if (popup && !popup.closed) {
          popup.location.href = targetUrl;
        } else {
          window.open(targetUrl, '_blank', 'noopener,noreferrer');
        }
      } else {
        window.location.href = targetUrl;
      }
    }
  };

  return (
    <>
      <SEOHead
        title="Fale Conosco - Toyoparts"
        description="Entre em contato com a Toyoparts por WhatsApp, telefone ou e-mail. Tire dúvidas sobre peças genuínas Toyota, pedidos e entregas."
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
              Estamos prontos para ajudar com peças genuínas Toyota, rastreio de pedidos,
              compatibilidade e dúvidas comerciais.
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
                    Preencha os campos e continue pelo canal que preferir.
                  </p>
                </div>
              </div>

              <form
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  void registerAndOpenChannel({
                    channel: 'whatsapp',
                    targetUrl: whatsappUrl,
                    fallbackMessage: 'Contato iniciado pelo formulário do Fale Conosco.',
                    openInNewWindow: true,
                  });
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
                    placeholder="Descreva sua dúvida ou a peça que você procura."
                  />
                </label>

                {feedback && (
                  <div
                    className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm ${
                      feedback.tone === 'success'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                        : 'border-amber-200 bg-amber-50 text-amber-800'
                    }`}
                  >
                    {feedback.tone === 'success' ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    ) : (
                      <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    )}
                    <p>{feedback.message}</p>
                  </div>
                )}

                <div className="flex flex-wrap gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={submittingChannel !== null}
                    className="inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-primary/90"
                  >
                    {submittingChannel === 'whatsapp' ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Registrando contato...
                      </>
                    ) : (
                      <>
                        Continuar no WhatsApp <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    disabled={submittingChannel !== null}
                    onClick={() => {
                      void registerAndOpenChannel({
                        channel: 'email',
                        targetUrl: mailtoUrl,
                        fallbackMessage: 'Contato iniciado pelo formulário do Fale Conosco.',
                        openInNewWindow: false,
                      });
                    }}
                    className="inline-flex items-center gap-2 rounded-2xl border border-border px-5 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
                  >
                    {submittingChannel === 'email' ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Registrando contato...
                      </>
                    ) : (
                      'Enviar por email'
                    )}
                  </button>
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
                      value: '(43) 3294-1144',
                      href: 'tel:+554332941144',
                      trackChannel: 'phone' as const,
                      defaultMessage: 'Clique no canal Telefone do Fale Conosco.',
                    },
                    {
                      icon: MessageCircle,
                      label: 'WhatsApp',
                      value: '(43) 3294-1144',
                      href: buildToyopartsWhatsAppUrl('Quero falar com a equipe da Toyoparts.'),
                      trackChannel: 'whatsapp' as const,
                      defaultMessage: 'Clique no canal oficial de WhatsApp do Fale Conosco.',
                    },
                    {
                      icon: Mail,
                      label: 'Email',
                      value: 'atendimento@toyoparts.com.br',
                      href: 'mailto:atendimento@toyoparts.com.br',
                      trackChannel: 'email' as const,
                      defaultMessage: 'Clique no canal oficial de e-mail do Fale Conosco.',
                    },
                    {
                      icon: Clock,
                      label: 'Horário',
                      value: 'Seg a Sex: 8h às 18h | Sáb: 8h às 12h.',
                      href: null,
                      trackChannel: null,
                      defaultMessage: '',
                    },
                  ].map((item) => (
                    item.href ? (
                      <a
                        key={item.label}
                        href={item.href}
                        target={item.href.startsWith('http') ? '_blank' : undefined}
                        rel="noopener noreferrer"
                        onClick={(event) => {
                          if (submittingChannel !== null) {
                            event.preventDefault();
                            return;
                          }
                          if (!item.trackChannel) return;
                          event.preventDefault();
                          void registerAndOpenChannel({
                            channel: item.trackChannel,
                            targetUrl: item.href,
                            fallbackMessage: item.defaultMessage,
                            openInNewWindow: item.href.startsWith('http'),
                          });
                        }}
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
                    <h3 className="text-lg font-black text-foreground">Loja física Toyopar</h3>
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
