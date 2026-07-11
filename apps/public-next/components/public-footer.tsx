import Link from 'next/link';
import { Facebook, Instagram, Lock, Mail, Phone, Shield } from 'lucide-react';

export function PublicFooter() {
  return (
    <footer className="bg-[#1f1f23] pb-6 pt-8 text-white sm:pt-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8 grid grid-cols-2 gap-6 sm:grid-cols-2 sm:gap-8 md:grid-cols-3 lg:grid-cols-5">
          <div className="col-span-2 sm:col-span-1">
            <Link href="/" className="mb-5 block">
              <img
                src="/brand/toyoparts-email-logo.svg"
                alt="Toyoparts"
                className="h-7 w-auto brightness-0 invert"
                width={164}
                height={20}
              />
              <p className="mt-1.5 text-[11px] font-normal tracking-wide text-white/50">Tudo para seu Toyota.</p>
            </Link>
            <div className="flex gap-2.5">
              <a href="https://www.facebook.com/toyoparts" target="_blank" rel="noopener noreferrer" className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/8 transition-colors hover:bg-white/15" aria-label="Facebook Toyoparts">
                <Facebook className="h-3.5 w-3.5" />
              </a>
              <a href="https://www.instagram.com/toyoparts" target="_blank" rel="noopener noreferrer" className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/8 transition-colors hover:bg-white/15" aria-label="Instagram Toyoparts">
                <Instagram className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>

          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.1em] text-white/80">Institucional</h3>
            <ul className="space-y-2 text-[13px] font-normal text-white/60">
              <li><Link href="/sobre" className="transition-colors hover:text-white">Sobre</Link></li>
              <li><Link href="/privacidade" className="transition-colors hover:text-white">Política de Privacidade</Link></li>
              <li><Link href="/loja-fisica" className="transition-colors hover:text-white">Loja Física (Toyopar)</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.1em] text-white/80">Minha Conta</h3>
            <ul className="mb-5 space-y-2 text-[13px] font-normal text-white/60">
              <li><Link href="/acesso" className="transition-colors hover:text-white">Entrar</Link></li>
            </ul>

            <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.1em] text-white/80">Informações de Envio</h3>
            <ul className="space-y-2 text-[13px] font-normal text-white/60">
              <li><Link href="/entrega" className="transition-colors hover:text-white">Política de Entrega</Link></li>
              <li><Link href="/troca-devolucoes" className="transition-colors hover:text-white">Trocas e Devoluções</Link></li>
              <li><Link href="/rastreamento-correios" className="transition-colors hover:text-white">Rastreamento de Pedidos</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.1em] text-white/80">Formas de Pagamento</h3>
            <div className="mb-5 flex flex-wrap gap-1.5">
              <div className="flex h-7 items-center rounded-md bg-white px-2 py-1"><img src="/payments/mastercard.svg" alt="Mastercard" className="h-3.5" loading="lazy" /></div>
              <div className="flex h-7 items-center rounded-md bg-white px-2 py-1"><img src="/payments/visa.svg" alt="Visa" className="h-2.5" loading="lazy" /></div>
              <div className="flex h-7 items-center rounded-md bg-white px-2 py-1"><img src="/payments/amex.svg" alt="Amex" className="h-2.5" loading="lazy" /></div>
              <div className="flex h-7 items-center rounded-md bg-white px-2 py-1"><span className="text-[10px] font-bold tracking-wide text-black">PIX</span></div>
              <div className="flex h-7 items-center rounded-md bg-white px-2 py-1"><span className="text-[10px] font-bold tracking-wide text-black">Boleto</span></div>
            </div>

            <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.1em] text-white/80">Segurança</h3>
            <div className="flex gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white p-1.5">
                <Shield className="h-5 w-5 text-green-600" />
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white p-1.5">
                <Lock className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="col-span-2 sm:col-span-1">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.1em] text-white/80">Atendimento</h3>
            <div className="space-y-2.5 text-[13px] font-normal text-white/60">
              <p className="text-xs font-semibold text-white/80">Central de atendimento</p>
              <div className="flex items-center gap-2">
                <Phone className="h-3.5 w-3.5 shrink-0 text-white/40" />
                <span className="break-all sm:break-normal">(43) 3294-1144</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="h-3.5 w-3.5 shrink-0 text-white/40" />
                <a href="mailto:atendimento@toyoparts.com.br" className="break-all transition-colors hover:text-white">
                  atendimento@toyoparts.com.br
                </a>
              </div>
              <p className="mt-1.5 text-[10px] font-normal text-white/40">
                Atendimento: Seg a Sex: 8h às 18h | Sáb: 8h às 12h.
              </p>
            </div>

            <Link
              href="/fale-conosco"
              className="mt-5 inline-flex items-center justify-center rounded-xl border border-primary/40 bg-primary/12 px-4 py-3 text-sm font-bold text-white transition-all hover:border-primary/60 hover:bg-primary/20"
            >
              Fale conosco
            </Link>
          </div>
        </div>

        <div className="mb-6 h-px bg-white/10" />
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="max-w-4xl text-[9px] font-normal leading-relaxed text-white/30">
            L.A. Motors Comércio e Intermediação de Veículos LTDA | CNPJ 10.986.290/0001-53 | Av. Tiradentes, 2333, Londrina - PR, CEP 86071-000 | Copyright © TODOS OS DIREITOS RESERVADOS. As fotos aqui veiculadas, logo e marca são de propriedade de www.toyoparts.com.br. A inclusão de um produto no carrinho não garante seu preço. Em caso de variação, prevalecerá o preço vigente na finalização da compra. É vedada a sua reprodução total ou parcial. * Preços válidos somente para a loja virtual | * Produtos estão sujeitos à confirmação de estoque em nossa loja ou junto ao fabricante | * Pedidos que violam as regras de compra e promoções do site serão cancelados | * Condições promocionais de frete grátis podem variar conforme campanha, região, itens do pedido, forma de pagamento e canal de atendimento.
          </p>
        </div>
      </div>
    </footer>
  );
}
