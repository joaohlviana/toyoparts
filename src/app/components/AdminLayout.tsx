// ─── Admin Layout ────────────────────────────────────────────────────────────
// Wraps AdminDashboard with auth gate. If not authenticated, shows login form.
// AdminDashboard is lazy-loaded since it pulls in 15+ admin sub-modules.

import React, { Suspense, useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Toaster, toast } from 'sonner';
import { Lock, Loader2, LogOut, Eye, EyeOff } from 'lucide-react';
import { AdminDashboard } from '../pages/AdminDashboard';
import {
  getAdminToken,
  adminLogin,
  adminValidateToken,
  adminLogout,
  onAdminUnauthorized,
} from '../lib/admin-auth';

function AdminLoader() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-3 border-primary/20 border-t-primary rounded-full animate-spin" />
        <p className="text-sm text-muted-foreground font-medium">Carregando painel admin...</p>
      </div>
    </div>
  );
}

// ─── Login Page ──────────────────────────────────────────────────────────────

function AdminLoginForm({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;

    setLoading(true);
    setError('');

    const result = await adminLogin(password.trim());

    if ('error' in result) {
      setError(result.error);
      setLoading(false);
      return;
    }

    toast.success('Login admin realizado com sucesso');
    setLoading(false);
    onSuccess();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#fafafa] dark:bg-[#0a0a0a] px-4">
      <div className="w-full max-w-sm">
        <div className="bg-white dark:bg-[#111] border border-black/[0.06] dark:border-white/10 rounded-2xl p-8 shadow-sm">
          {/* Icon */}
          <div className="flex justify-center mb-6">
            <div className="w-14 h-14 rounded-2xl bg-blue-500/10 flex items-center justify-center">
              <Lock className="w-7 h-7 text-blue-500" />
            </div>
          </div>

          {/* Title */}
          <h1 className="text-xl font-bold text-center text-[#1d1d1f] dark:text-white mb-1">
            Painel Administrativo
          </h1>
          <p className="text-sm text-[#86868b] text-center mb-6">
            Toyoparts &mdash; acesso restrito
          </p>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="admin-password" className="text-xs font-bold text-[#86868b] uppercase tracking-widest">
                Senha
              </label>
              <div className="relative">
                <input
                  id="admin-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError(''); }}
                  placeholder="Digite a senha do admin"
                  autoFocus
                  autoComplete="current-password"
                  className="w-full h-11 px-4 pr-10 rounded-xl border border-black/[0.1] dark:border-white/10 bg-[#fafafa] dark:bg-[#0a0a0a] text-sm text-[#1d1d1f] dark:text-white placeholder:text-[#86868b] focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#86868b] hover:text-[#1d1d1f] dark:hover:text-white transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2 text-xs text-rose-600 dark:text-rose-400 font-medium">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !password.trim()}
              className="w-full h-11 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Verificando...
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  Entrar
                </>
              )}
            </button>
          </form>
        </div>

        <p className="text-[11px] text-[#86868b] text-center mt-4">
          Acesso restrito a administradores autorizados
        </p>
      </div>
    </div>
  );
}

// ─── Main Layout ─────────────────────────────────────────────────────────────

export function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [authState, setAuthState] = useState<'checking' | 'authenticated' | 'unauthenticated'>('checking');

  const resolveAdminSection = useCallback((search: string): NonNullable<React.ComponentProps<typeof AdminDashboard>['initialSection']> => {
    const page = new URLSearchParams(search).get('page');
    const aliases: Record<string, NonNullable<React.ComponentProps<typeof AdminDashboard>['initialSection']>> = {
      dashboard: 'dashboard',
      products: 'products',
      categories: 'categories',
      images: 'images',
      banners: 'banners',
      newsletter: 'newsletter',
      seo: 'seo_metadata',
      seo_metadata: 'seo_metadata',
      seo_redirects: 'seo_redirects',
      snapshots: 'snapshots',
      seo_sitemaps: 'seo_sitemaps',
      ssg: 'ssg',
      search_ops: 'search_ops_dashboard',
      search_ops_dashboard: 'search_ops_dashboard',
      payments: 'payments',
      frenet: 'frenet',
      carriers: 'carriers',
      coupons: 'coupons',
      orders: 'orders',
      stored_orders: 'stored_orders',
      stored_customers: 'stored_customers',
      rede_pecas: 'rede_pecas',
      price_update: 'price_update',
      enrichment: 'enriquecimento',
      enriquecimento: 'enriquecimento',
      operations: 'operations',
      magento_migration: 'magento_migration',
      search_intelligence: 'search_intelligence',
      resend: 'resend',
      audit_log: 'audit_log',
      integration_health: 'integration_health',
      stripe_test: 'stripe_test',
      growth_plan: 'growth_plan',
      dados: 'dados',
      customers_loja: 'customers_loja',
    };

    if (!page) return 'dashboard';
    return aliases[page] || 'dashboard';
  }, []);

  const initialSection = resolveAdminSection(location.search);

  // Check existing token on mount
  useEffect(() => {
    const token = getAdminToken();
    if (!token) {
      setAuthState('unauthenticated');
      return;
    }
    // Validate token with backend
    adminValidateToken().then(valid => {
      setAuthState(valid ? 'authenticated' : 'unauthenticated');
    });
  }, []);

  // Listen for 401 events (expired token during session)
  useEffect(() => {
    const unsub = onAdminUnauthorized(() => {
      setAuthState('unauthenticated');
      toast.error('Sessao admin expirada. Faca login novamente.');
    });
    return unsub;
  }, []);

  const handleLoginSuccess = useCallback(() => {
    setAuthState('authenticated');
  }, []);

  const handleLogout = useCallback(async () => {
    await adminLogout();
    setAuthState('unauthenticated');
    toast.info('Logout realizado');
  }, []);

  // Checking state
  if (authState === 'checking') {
    return <AdminLoader />;
  }

  // Not authenticated — show login
  if (authState === 'unauthenticated') {
    return (
      <div className="min-h-screen bg-background font-sans antialiased">
        <Toaster position="top-right" theme="light" closeButton richColors />
        <AdminLoginForm onSuccess={handleLoginSuccess} />
      </div>
    );
  }

  // Authenticated — show admin
  return (
    <div className="min-h-screen bg-background font-sans antialiased">
      <Toaster position="top-right" theme="light" closeButton richColors />

      {/* Logout button — fixed top-right */}
      <button
        onClick={handleLogout}
        className="fixed top-3 right-4 z-50 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/[0.04] dark:bg-white/[0.06] hover:bg-black/[0.08] dark:hover:bg-white/10 text-[11px] font-bold text-[#86868b] hover:text-[#1d1d1f] dark:hover:text-white transition-all"
        title="Sair do admin"
      >
        <LogOut className="w-3.5 h-3.5" />
        Sair
      </button>

      <Suspense fallback={<AdminLoader />}>
        <AdminDashboard
          initialSection={initialSection}
          onBackToStore={() => navigate('/')}
          onSectionChange={(section) => {
            const params = new URLSearchParams(location.search);
            if (section === 'dashboard') {
              params.delete('page');
            } else {
              params.set('page', section);
            }
            const search = params.toString();
            navigate(
              {
                pathname: location.pathname,
                search: search ? `?${search}` : '',
              },
              { replace: true }
            );
          }}
        />
      </Suspense>
    </div>
  );
}
