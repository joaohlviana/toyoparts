import React, { useState, useMemo } from 'react';
import { 
  Zap, 
  Package, 
  FolderTree, 
  ImageIcon,
  Menu,
  Car,
  Brain,
  Globe,
  Megaphone,
  Truck,
  ShoppingBag,
  Search,
  BarChart3,
  Sparkles,
  Settings2,
  Target,
  Activity,
  CreditCard,
  Users,
  Database,
  Archive,
  FileText,
  Map,
  Rocket,
  Mail,
  LineChart,
  Shield,
  ArrowLeftRight,
  Store,
  LayoutDashboard,
  Tag,
  RefreshCcw,
  FlaskConical,
  FileCode2,
} from 'lucide-react';
import { Sidebar, NavigationGroup } from './Sidebar';

// ─── Untitled UI Admin Shell ─────────────────────────────────────────────────
// Sidebar + content area layout using design tokens

interface AdminShellProps {
  children: React.ReactNode;
  activeSection: string;
  onNavigate: (id: string) => void;
  onBackToStore?: () => void;
}

export function AdminShell({ children, activeSection, onNavigate, onBackToStore }: AdminShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // useMemo garante referência estável — evita re-run desnecessário do useEffect do Sidebar
  const navGroups: NavigationGroup[] = useMemo(() => [
    {
      label: 'Visão Geral',
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      ],
    },
    {
      label: 'Operação',
      items: [
        {
          id: 'pedidos',
          label: 'Pedidos',
          icon: ShoppingBag,
          items: [
            { id: 'orders', label: 'Loja', icon: ShoppingBag },
            { id: 'stored_orders', label: 'Magento', icon: ShoppingBag },
          ],
        },
        {
          id: 'clientes',
          label: 'Clientes',
          icon: Users,
          items: [
            { id: 'customers_loja', label: 'Loja', icon: Users },
            { id: 'stored_customers', label: 'Magento', icon: Users },
          ],
        },
      ],
    },
    {
      label: 'Catálogo',
      items: [
        { id: 'products',     label: 'Produtos',                icon: Package  },
        { id: 'categories',   label: 'Categorias',              icon: FolderTree },
        { id: 'rede_pecas',   label: 'Rede de Peças Toyota',    icon: Car      },
        { id: 'price_update', label: 'Atualização de Preços',   icon: RefreshCcw },
      ],
    },
    {
      label: 'Marketing & Conteúdo',
      items: [
        { id: 'banners', label: 'Banners Hero', icon: Megaphone },
        { id: 'images', label: 'Imagens do Site', icon: ImageIcon },
        { id: 'newsletter', label: 'Newsletter', icon: Mail },
        {
          id: 'seo',
          label: 'SEO',
          icon: Globe,
          items: [
            { id: 'seo_metadata', label: 'Metadados', icon: FileText },
            { id: 'seo_sitemaps', label: 'Sitemaps', icon: Map },
            { id: 'ssg', label: 'SSG (HTML Estático)', icon: FileCode2 },
          ],
        },
      ],
    },
    {
      label: 'IA & Inteligência',
      items: [
        {
          id: 'search_ops',
          label: 'Busca & IA (Meili)',
          icon: Search,
          items: [
            { id: 'search_ops_dashboard', label: 'Dashboard', icon: BarChart3 },
            { id: 'search_ops_lab', label: 'Search Lab', icon: Search },
            { id: 'search_ops_ai', label: 'AI Ops', icon: Sparkles },
            { id: 'search_ops_relevance', label: 'Relevância', icon: Settings2 },
            { id: 'search_ops_merch', label: 'Merchandising', icon: Target },
            { id: 'search_ops_ops', label: 'Operações', icon: Activity },
          ],
        },
        { id: 'enriquecimento', label: 'Enriquecimento IA', icon: Brain },
        { id: 'search_intelligence', label: 'Search Intelligence', icon: LineChart },
      ],
    },
    {
      label: 'Plataforma & Dados',
      items: [
        { id: 'operations', label: 'Operações de Sync', icon: ArrowLeftRight },
        { id: 'dados', label: 'Dados', icon: Database },
        { id: 'magento_migration', label: 'Sincronização / Backup', icon: Archive },
      ],
    },
    {
      label: 'Integrações',
      items: [
        { id: 'frenet', label: 'Frete (Frenet)', icon: Truck },
        { id: 'carriers', label: 'Transportadoras', icon: Truck },
        { id: 'payments', label: 'Pagamentos', icon: CreditCard },
        { id: 'stripe_test', label: 'Stripe Testes', icon: FlaskConical },
        { id: 'coupons',  label: 'Cupons',      icon: Tag },
        { id: 'resend', label: 'E-mails (Resend)', icon: Mail },
      ],
    },
    {
      label: 'Segurança & Compliance',
      items: [
        { id: 'audit_log', label: 'Trilha de Auditoria', icon: Shield },
        { id: 'integration_health', label: 'Saúde das Integrações', icon: Activity },
      ],
    },
    {
      label: 'Estratégia',
      items: [
        { id: 'growth_plan', label: 'Plano Enterprise', icon: Rocket },
      ],
    },
  ], []); // deps vazio — estrutura é estática

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden font-sans">
      
      <Sidebar 
        groups={navGroups}
        activeId={activeSection}
        onNavigate={onNavigate}
        isOpenMobile={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
        onBackToStore={onBackToStore}
      />

      <main className="flex-1 flex flex-col h-full overflow-hidden bg-background relative min-w-0">
        {/* Mobile Header */}
        <header className="lg:hidden sticky top-0 z-20 h-14 border-b border-border flex items-center justify-between px-4 bg-background/80 backdrop-blur-md shrink-0">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setMobileMenuOpen(true)} 
              className="p-2 -ml-2 text-muted-foreground hover:bg-secondary rounded-md transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
