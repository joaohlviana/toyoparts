import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router';
import { motion } from 'motion/react';
import { 
  ArrowRight, 
  Mail, 
  CheckCircle2, 
  Loader2, 
  ShieldCheck, 
  AlertCircle,
  Package,
  Car
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { toast } from 'sonner';
import { supabase } from '../../../lib/supabase';
import { projectId, publicAnonKey } from '../../../../utils/supabase/info';
import { ImageWithFallback } from '../../components/figma/ImageWithFallback';

const LOGIN_SIDE_IMAGE = 'https://images.unsplash.com/photo-1631377875146-b10de5d7acb7?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx0b3lvdGElMjBoaWx1eCUyMGFkdmVudHVyZSUyMGxpZmVzdHlsZXxlbnwxfHx8fDE3NzE2NDE2NTl8MA&ixlib=rb-4.1.0&q=80&w=1080';

export function MagicLoginPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'initial' | 'resolving' | 'confirm' | 'sent'>('initial');
  const [resolvedData, setResolvedData] = useState<{ email: string, masked: string } | null>(null);
  const [error, setError] = useState('');

  // 1. Resolve Token if present
  useEffect(() => {
    if (token) {
      resolveToken(token.trim());
    }
  }, [token]);

  const resolveToken = async (t: string) => {
    setStep('resolving');
    try {
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-1d6e33e0/access-links/resolve`, {
        method: 'POST',
        body: JSON.stringify({ token: t }),
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`
        }
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Link inválido (${res.status})`);
      }

      const data = await res.json();
      setResolvedData({ email: data.email, masked: data.email_masked });
      setStep('confirm');
    } catch (e: any) {
      setError(e.message);
      setStep('initial');
    }
  };

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    
    const targetEmail = resolvedData?.email || email;
    if (!targetEmail) return;

    setLoading(true);
    try {
      // Tenta enviar via Resend (template customizado) se configurado
      let sentViaResend = false;
      try {
        const resendRes = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-1d6e33e0/resend/magic-link`,
          {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${publicAnonKey}`,
            },
            body: JSON.stringify({ email: targetEmail }),
          }
        );
        if (resendRes.ok) {
          sentViaResend = true;
        }
      } catch {
        // Silencioso — fallback para Supabase nativo
      }

      // Fallback: Supabase nativo signInWithOtp
      if (!sentViaResend) {
        const { error } = await supabase.auth.signInWithOtp({
          email: targetEmail,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`
          }
        });
        if (error) throw error;
      }
      
      setStep('sent');
      toast.success('Link de acesso enviado!');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  if (step === 'sent') {
    return (
      <div className="w-full min-h-[70vh] flex flex-col items-center justify-center px-4 py-12">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full text-center space-y-8 bg-card p-8 rounded-3xl border border-border/50 shadow-lg"
        >
          <div className="w-24 h-24 bg-green-500/10 rounded-full flex items-center justify-center mx-auto ring-4 ring-green-500/5">
            <CheckCircle2 className="w-12 h-12 text-green-500" strokeWidth={2.5} />
          </div>
          
          <div className="space-y-3">
            <h1 className="text-3xl font-bold tracking-tight text-[#1d1d1f]">Verifique seu e-mail</h1>
            <div className="space-y-2 text-muted-foreground text-lg">
              <p>Enviamos um link mágico de acesso para:</p>
              <div className="inline-block px-4 py-2 bg-muted rounded-lg font-medium text-foreground border border-border">
                {resolvedData?.masked || email}
              </div>
              <p className="text-base pt-2">Clique no link enviado para acessar sua conta instantaneamente.</p>
            </div>
          </div>

          <div className="pt-4 space-y-4">
             <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground bg-blue-50/50 p-3 rounded-lg border border-blue-100">
               <Mail className="w-4 h-4 text-blue-500" />
               <span>Não recebeu? Verifique sua caixa de spam</span>
             </div>

            <Button variant="ghost" onClick={() => { setStep('initial'); setEmail(''); }} className="w-full h-12 text-base font-medium">
              Tentar outro e-mail
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="w-full bg-background flex justify-center py-8 lg:py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl w-full flex flex-col lg:flex-row gap-8 lg:gap-16 items-center">
        
        {/* Left Column - Image & Branding (Desktop only) */}
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
          className="hidden lg:block w-full lg:w-1/2 h-[700px] relative rounded-[2.5rem] overflow-hidden shadow-2xl"
        >
          <div className="absolute inset-0 z-10 bg-black/40" />
          <div className="absolute inset-0 z-0">
            <ImageWithFallback 
              src={LOGIN_SIDE_IMAGE}
              alt="Toyoparts Adventure"
              className="w-full h-full object-cover"
            />
          </div>
          
          {/* Content over image */}
          <div className="absolute bottom-0 left-0 p-12 z-20 text-white max-w-xl">
            <h2 className="text-4xl font-bold mb-6 leading-tight">
              A aventura começa com as peças certas.
            </h2>
            <div className="space-y-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-white/10 backdrop-blur-md flex items-center justify-center shrink-0 border border-white/20">
                  <Package className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg text-white">Estoque Completo</h3>
                  <p className="text-white/80">Milhares de peças genuínas e compatíveis prontas para envio.</p>
                </div>
              </div>
              
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-white/10 backdrop-blur-md flex items-center justify-center shrink-0 border border-white/20">
                  <Car className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg text-white">Especialistas Toyota</h3>
                  <p className="text-white/80">Peças verificadas para Hilux, Corolla, Yaris e toda a linha.</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-white/10 backdrop-blur-md flex items-center justify-center shrink-0 border border-white/20">
                  <ShieldCheck className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg text-white">Compra Segura</h3>
                  <p className="text-white/80">Garantia em todos os produtos e suporte técnico especializado.</p>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Right Column - Form */}
        <div className="w-full lg:w-1/2 flex items-center justify-center relative">
           {/* Background decoration for mobile */}
           <div className="lg:hidden absolute top-0 left-0 w-full h-32 bg-primary/5 -z-10" />

          <div className="w-full max-w-md space-y-8 bg-card p-8 sm:p-12 rounded-[2.5rem] border border-border/40 shadow-xl lg:shadow-none lg:border-none lg:bg-transparent">
            <div className="space-y-2">
              <h1 className="text-3xl font-bold tracking-tight text-[#1d1d1f]">
                {step === 'confirm' ? 'Confirmar Acesso' : 'Acesse sua conta'}
              </h1>
              <p className="text-muted-foreground text-base">
                {step === 'confirm' 
                  ? 'Para sua segurança, confirme sua identidade.' 
                  : 'Gerencie seus pedidos, acompanhe entregas e facilite suas próximas compras.'}
              </p>
            </div>

            {error && (
              <div className="bg-destructive/10 text-destructive p-4 rounded-xl text-sm flex items-start gap-3 border border-destructive/20">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <p>{error}</p>
              </div>
            )}

            {step === 'resolving' ? (
              <div className="py-12 flex flex-col items-center justify-center bg-muted/30 rounded-2xl border border-dashed border-border">
                <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
                <p className="font-medium">Validando token...</p>
              </div>
            ) : step === 'confirm' && resolvedData ? (
               <div className="space-y-6">
                  <div className="bg-muted/50 p-5 rounded-xl border border-border">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1">Entrando como</p>
                    <p className="font-mono text-lg font-medium text-foreground">{resolvedData.masked}</p>
                  </div>
                  
                  <Button className="w-full h-12 text-base font-semibold" onClick={() => handleLogin()} disabled={loading}>
                    {loading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Mail className="w-5 h-5 mr-2" />}
                    Receber Link de Acesso
                  </Button>
                </div>
            ) : (
              <div className="space-y-8">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">E-mail</Label>
                    <div className="relative group">
                      <Mail className="absolute left-3.5 top-3.5 h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
                      <Input
                        id="email"
                        type="email"
                        placeholder="seu@email.com"
                        className="pl-11 h-12 text-base bg-background"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        disabled={loading}
                        required
                      />
                    </div>
                  </div>

                  <Button type="submit" className="w-full h-12 text-base font-semibold" disabled={loading}>
                    {loading ? (
                      <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    ) : (
                      <>
                        Continuar <ArrowRight className="w-5 h-5 ml-2" />
                      </>
                    )}
                  </Button>
                </form>

                {/* How it works steps */}
                <div className="pt-6 border-t border-border">
                  <p className="text-sm font-medium text-foreground mb-4">Como funciona o acesso sem senha:</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="flex flex-col items-center text-center gap-2 p-3 bg-muted/30 rounded-lg">
                      <div className="w-8 h-8 rounded-full bg-background border border-border flex items-center justify-center text-primary font-bold text-sm shadow-sm">1</div>
                      <span className="text-xs text-muted-foreground">Digite seu e-mail</span>
                    </div>
                    <div className="hidden sm:block absolute left-[33%] top-[60%] w-8 border-t border-dashed border-border" />
                     <div className="flex flex-col items-center text-center gap-2 p-3 bg-muted/30 rounded-lg">
                      <div className="w-8 h-8 rounded-full bg-background border border-border flex items-center justify-center text-primary font-bold text-sm shadow-sm">2</div>
                      <span className="text-xs text-muted-foreground">Receba o link</span>
                    </div>
                     <div className="flex flex-col items-center text-center gap-2 p-3 bg-muted/30 rounded-lg">
                      <div className="w-8 h-8 rounded-full bg-background border border-border flex items-center justify-center text-primary font-bold text-sm shadow-sm">3</div>
                      <span className="text-xs text-muted-foreground">Acesse num clique</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <p className="text-center text-xs text-muted-foreground">
              Protegido por reCAPTCHA e sujeito à Política de Privacidade e Termos de Serviço do Google.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}