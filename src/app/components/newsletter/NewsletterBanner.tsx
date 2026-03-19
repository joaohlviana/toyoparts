// ─── NewsletterBanner — componente reutilizável ───────────────────────────────
// Estado interno próprio: nome, e-mail, WhatsApp, loading, done.
// Usa o mesmo estilo/layout do ProductDetailPage como referência canônica.

import React, { useState } from 'react';
import { Tag, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { Input }  from '../ui/input';
import { projectId, publicAnonKey } from '../../../../utils/supabase/info';

const API     = `https://${projectId}.supabase.co/functions/v1/make-server-1d6e33e0`;
const HEADERS: HeadersInit = {
  Authorization: `Bearer ${publicAnonKey}`,
  apikey: publicAnonKey,
  'Content-Type': 'application/json',
};

interface NewsletterBannerProps {
  /** Identifica a origem da inscrição no backend (ex: 'homepage', 'pdp', 'sobre') */
  source?: string;
  /** Classes extras para o elemento raiz (ex: margens específicas por contexto) */
  className?: string;
}

export function NewsletterBanner({ source = 'site', className = '' }: NewsletterBannerProps) {
  const [name,     setName]     = useState('');
  const [email,    setEmail]    = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [done,     setDone]     = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || loading || done) return;
    setLoading(true);
    try {
      const res  = await fetch(`${API}/newsletter/subscribe`, {
        method:  'POST',
        headers: HEADERS,
        body:    JSON.stringify({ email, name, whatsapp, source }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao inscrever');
      setDone(true);
      toast.success(data.message || 'Inscrito com sucesso!');
    } catch (err: any) {
      console.error('[newsletter]', err);
      toast.error(err.message || 'Erro ao inscrever. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      className={`bg-card rounded-2xl shadow-sm border border-border p-5 sm:p-8 flex flex-col xl:flex-row items-center gap-6 ${className}`}
      onSubmit={handleSubmit}
    >
      {/* Identidade */}
      <div className="flex items-center gap-4 flex-shrink-0">
        <div className="w-12 h-12 sm:w-16 sm:h-16 bg-primary/5 rounded-2xl flex items-center justify-center text-primary border border-primary/10 flex-shrink-0">
          <Tag className="w-6 h-6 sm:w-8 sm:h-8" />
        </div>
        <div>
          <span className="font-bold block text-lg text-foreground tracking-tight">
            Ofertas Exclusivas
          </span>
          <span className="font-medium block text-muted-foreground text-sm">
            Novidades e promoções para seu Toyota.
          </span>
        </div>
      </div>

      {/* Campos */}
      <div className="flex-1 w-full grid grid-cols-1 md:grid-cols-12 gap-3">
        <div className="md:col-span-3">
          <Input
            placeholder="Seu nome"
            value={name}
            onChange={e => setName(e.target.value)}
            disabled={done}
            className="bg-secondary/50 border-border h-12 rounded-xl focus:ring-primary/20"
          />
        </div>
        <div className="md:col-span-4">
          <Input
            type="email"
            placeholder="E-mail"
            value={email}
            onChange={e => setEmail(e.target.value)}
            disabled={done}
            required
            className="bg-secondary/50 border-border h-12 rounded-xl focus:ring-primary/20"
          />
        </div>
        <div className="md:col-span-3">
          <Input
            placeholder="WhatsApp"
            value={whatsapp}
            onChange={e => setWhatsapp(e.target.value)}
            disabled={done}
            className="bg-secondary/50 border-border h-12 rounded-xl focus:ring-primary/20"
          />
        </div>
        <div className="md:col-span-2">
          <Button
            type="submit"
            disabled={loading || done || !email}
            className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-bold uppercase tracking-widest rounded-xl transition-all"
          >
            {loading
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : done
              ? 'Inscrito!'
              : 'Assinar'}
          </Button>
        </div>
      </div>
    </form>
  );
}
