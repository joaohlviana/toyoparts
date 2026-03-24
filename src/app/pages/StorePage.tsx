import React from 'react';
import { Clock, MapPin, Phone, CarFront, ArrowRight, PackageCheck } from 'lucide-react';
import { SEOHead } from '../components/seo/SEOHead';

export function StorePage() {
  return (
    <>
      <SEOHead
        title="Loja Fisica (Toyopar) - Toyoparts"
        description="Conheca a loja fisica Toyopar em Londrina e veja endereco, horario, retirada e canais de atendimento."
        canonical="https://www.toyoparts.com.br/loja-fisica"
      />

      <div className="min-h-screen bg-background">
        <section className="bg-slate-950 text-white py-14 md:py-18">
          <div className="max-w-6xl mx-auto px-6 lg:px-8">
            <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-primary/80 mb-4">
              Toyopar Londrina
            </p>
            <h1 className="text-3xl md:text-5xl font-black leading-tight max-w-3xl">
              Loja Fisica (Toyopar)
            </h1>
            <p className="text-white/70 text-[15px] md:text-[17px] max-w-2xl mt-4 leading-relaxed">
              Retire pedidos, fale com nossa equipe e conte com apoio especializado para encontrar a peca certa para o seu Toyota.
            </p>
          </div>
        </section>

        <section className="py-12 md:py-16">
          <div className="max-w-6xl mx-auto px-6 lg:px-8 grid lg:grid-cols-[1fr_0.9fr] gap-10">
            <div className="bg-card border border-border rounded-3xl p-6 md:p-8">
              <h2 className="text-2xl font-black text-foreground mb-6">Informacoes da unidade</h2>
              <div className="space-y-4">
                {[
                  {
                    icon: MapPin,
                    label: 'Endereco',
                    value: 'Av. Tiradentes, 2333, Londrina - PR, CEP 86071-000',
                  },
                  {
                    icon: Phone,
                    label: 'Telefone',
                    value: '(43) 3294-1144 | Ramal: 1126 | 1196',
                  },
                  {
                    icon: Clock,
                    label: 'Horario',
                    value: 'Seg a Sex: 8h as 18h | Sab: 8h as 12h.',
                  },
                  {
                    icon: PackageCheck,
                    label: 'Retirada',
                    value: 'Pedidos confirmados podem ser retirados na unidade apos orientacao da equipe.',
                  },
                ].map((item) => (
                  <div key={item.label} className="flex items-start gap-4 rounded-2xl border border-border p-4">
                    <div className="w-11 h-11 rounded-2xl bg-secondary text-primary flex items-center justify-center flex-shrink-0">
                      <item.icon className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{item.label}</p>
                      <p className="text-sm font-semibold text-foreground mt-1 leading-relaxed">{item.value}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <a
                  href="https://maps.google.com/?q=Toyopar+Londrina"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-primary/90"
                >
                  Abrir no mapa <ArrowRight className="w-4 h-4" />
                </a>
                <a
                  href="https://wa.me/554332941144"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-2xl border border-border px-5 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
                >
                  Falar com a equipe
                </a>
              </div>
            </div>

            <div className="space-y-5">
              <div className="bg-secondary border border-border rounded-3xl p-6 md:p-8">
                <div className="flex items-start gap-4">
                  <div className="w-11 h-11 rounded-2xl bg-white text-primary flex items-center justify-center flex-shrink-0">
                    <CarFront className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-foreground">Atendimento especializado Toyota</h2>
                    <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
                      Nossa equipe atende clientes de todo o Brasil e tambem oferece apoio presencial
                      para retirada e orientacao comercial em Londrina.
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl overflow-hidden border border-border bg-card">
                <iframe
                  title="Mapa Toyopar Londrina"
                  src="https://www.google.com/maps?q=Toyopar%20Londrina&output=embed"
                  className="w-full h-[320px] border-0"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
