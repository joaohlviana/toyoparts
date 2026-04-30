import React from 'react';
import { Link } from 'react-router';
import { Facebook, Instagram, Mail, Phone, Shield, Lock } from 'lucide-react';
import { Separator } from '../ui/separator';
import { ToyopartsLogo } from '../ToyopartsLogo';

export function Footer() {
  return (
    <footer className="bg-[#1f1f23] text-white pt-8 sm:pt-10 pb-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6 sm:gap-8 mb-8">
          <div className="col-span-2 sm:col-span-1">
            <Link to="/" className="block mb-5">
              <ToyopartsLogo className="h-7 w-auto" color="white" showBadge={false} />
              <p className="text-[11px] mt-1.5 text-white/50 font-normal tracking-wide">Tudo para seu Toyota.</p>
            </Link>
            <div className="flex gap-2.5">
              <a href="https://www.facebook.com/toyoparts" target="_blank" rel="noopener noreferrer" className="w-8 h-8 rounded-lg bg-white/8 flex items-center justify-center hover:bg-white/15 transition-colors">
                <Facebook className="w-3.5 h-3.5" />
              </a>
              <a href="https://www.instagram.com/toyoparts" target="_blank" rel="noopener noreferrer" className="w-8 h-8 rounded-lg bg-white/8 flex items-center justify-center hover:bg-white/15 transition-colors">
                <Instagram className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          <div>
            <h3 className="font-semibold mb-3 text-xs uppercase tracking-[0.1em] text-white/80">Institucional</h3>
            <ul className="space-y-2 text-[13px] text-white/60 font-normal">
              <li><Link to="/sobre" className="hover:text-white transition-colors">Sobre</Link></li>
              <li><Link to="/privacidade" className="hover:text-white transition-colors">Política de Privacidade</Link></li>
              <li><Link to="/loja-fisica" className="hover:text-white transition-colors">Loja Física (Toyopar)</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold mb-3 text-xs uppercase tracking-[0.1em] text-white/80">Minha Conta</h3>
            <ul className="space-y-2 text-[13px] text-white/60 font-normal mb-5">
              <li><Link to="/acesso" className="hover:text-white transition-colors">Entrar</Link></li>
            </ul>

            <h3 className="font-semibold mb-3 text-xs uppercase tracking-[0.1em] text-white/80">Informações de Envio</h3>
            <ul className="space-y-2 text-[13px] text-white/60 font-normal">
              <li><Link to="/entrega" className="hover:text-white transition-colors">Política de Entrega</Link></li>
              <li><Link to="/troca-devolucoes" className="hover:text-white transition-colors">Trocas e Devoluções</Link></li>
              <li><Link to="/rastreamento-correios" className="hover:text-white transition-colors">Rastreamento de Pedidos</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold mb-3 text-xs uppercase tracking-[0.1em] text-white/80">Formas de Pagamento</h3>
            <div className="flex flex-wrap gap-1.5 mb-5">
              <div className="bg-white rounded-md px-2 py-1 h-7 flex items-center"><img src="/payments/mastercard.svg" alt="Mastercard" className="h-3.5" loading="lazy" /></div>
              <div className="bg-white rounded-md px-2 py-1 h-7 flex items-center"><img src="/payments/visa.svg" alt="Visa" className="h-2.5" loading="lazy" /></div>
              <div className="bg-white rounded-md px-2 py-1 h-7 flex items-center"><img src="/payments/amex.svg" alt="Amex" className="h-2.5" loading="lazy" /></div>
              <div className="bg-white rounded-md px-2 py-1 h-7 flex items-center"><span className="text-black text-[10px] font-bold tracking-wide">PIX</span></div>
              <div className="bg-white rounded-md px-2 py-1 h-7 flex items-center"><span className="text-black text-[10px] font-bold tracking-wide">Boleto</span></div>
            </div>

            <h3 className="font-semibold mb-3 text-xs uppercase tracking-[0.1em] text-white/80">Segurança</h3>
            <div className="flex gap-2">
              <div className="bg-white rounded-lg p-1.5 h-10 w-10 flex items-center justify-center">
                <Shield className="w-5 h-5 text-green-600" />
              </div>
              <div className="bg-white rounded-lg p-1.5 h-10 w-10 flex items-center justify-center">
                <Lock className="w-5 h-5 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="col-span-2 sm:col-span-1">
            <h3 className="font-semibold mb-3 text-xs uppercase tracking-[0.1em] text-white/80">Atendimento</h3>
            <div className="space-y-2.5 text-[13px] text-white/60 font-normal">
              <p className="font-semibold text-white/80 text-xs">Central de atendimento</p>
              <div className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 text-white/40 flex-shrink-0" />
                <span className="break-all sm:break-normal">(43) 3294-1144</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-white/40 flex-shrink-0" />
                <a href="mailto:atendimento@toyoparts.com.br" className="hover:text-white transition-colors break-all">
                  atendimento@toyoparts.com.br
                </a>
              </div>
              <p className="text-[10px] text-white/40 mt-1.5 font-normal">
                Atendimento: Seg a Sex: 8h às 18h | Sáb: 8h às 12h.
              </p>
            </div>

            <Link
              to="/fale-conosco"
              className="mt-5 inline-flex items-center justify-center rounded-xl border border-primary/40 bg-primary/12 px-4 py-3 text-sm font-bold text-white transition-all hover:border-primary/60 hover:bg-primary/20"
            >
              Fale conosco
            </Link>
          </div>
        </div>

        <Separator className="bg-white/10 mb-6" />
        <div className="text-center flex flex-col items-center gap-3">
          <p className="text-[9px] text-white/30 max-w-4xl leading-relaxed font-normal">
            L.A. Motors Comércio e Intermediação de Veículos LTDA | CNPJ 10.986.290/0001-53 | Av. Tiradentes, 2333, Londrina - PR, CEP 86071-000 | Copyright © TODOS OS DIREITOS RESERVADOS. As fotos aqui veiculadas, logo e marca são de propriedade de www.toyoparts.com.br. A inclusão de um produto no "carrinho" não garante seu preço. Em caso de variação, prevalecerá o preço vigente na "finalização" da compra. É vedada a sua reprodução total ou parcial. * Preços válidos somente para a loja virtual | * Produtos estão sujeitos à confirmação de estoque em nossa loja ou junto ao fabricante | * Pedidos que violam as regras de compra e promoções do site serão cancelados | * Condições promocionais de frete grátis podem variar conforme campanha, região, itens do pedido, forma de pagamento e canal de atendimento. Confira no carrinho, no checkout ou fale com nosso atendimento pelo WhatsApp (43) 3294-1144 ou telefone (43) 3294-1144
          </p>
        </div>
      </div>
    </footer>
  );
}

