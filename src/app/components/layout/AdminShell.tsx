import React, { useMemo, useState } from 'react';
import {
  Activity,
  Archive,
  ArrowLeftRight,
  BarChart3,
  Brain,
  Car,
  CreditCard,
  Database,
  FileCode2,
  FileText,
  FolderTree,
  Gift,
  Globe,
  ImageIcon,
  LayoutDashboard,
  LineChart,
  Mail,
  Megaphone,
  Menu,
  Package,
  RefreshCcw,
  Rocket,
  Route,
  Search,
  Settings2,
  Shield,
  ShoppingBag,
  Sparkles,
  Tag,
  Target,
  Truck,
  Users,
} from 'lucide-react';
import { Sidebar, NavigationGroup } from './Sidebar';

interface AdminShellProps {
  children: React.ReactNode;
  activeSection: string;
  onNavigate: (id: string) => void;
  onBackToStore?: () => void;
}

export function AdminShell({ children, activeSection, onNavigate, onBackToStore }: AdminShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navGroups: NavigationGroup[] = useMemo(() => [
    {
      label: 'Visao Geral',
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      ],
    },
    {
      label: 'Operacao',
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
      label: 'Catalogo',
      items: [
        { id: 'products', label: 'Produtos', icon: Package },
        { id: 'categories', label: 'Categorias', icon: FolderTree },
        { id: 'rede_pecas', label: 'Rede de Pecas Toyota', icon: Car },
        { id: 'price_update', label: 'Atualizacao de Precos', icon: RefreshCcw },
      ],
    },
    {
      label: 'Marketing e Conteudo',
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
            { id: 'snapshots', label: 'Snapshots', icon: Database },
            { id: 'seo_sitemaps', label: 'Sitemaps', icon: Route },
            { id: 'seo_redirects', label: 'Redirects 301', icon: Route },
            { id: 'ssg', label: 'SSG (HTML Estatico)', icon: FileCode2 },
          ],
        },
      ],
    },
    {
      label: 'IA e Inteligencia',
      items: [
        {
          id: 'search_ops',
          label: 'Busca e IA (Meili)',
          icon: Search,
          items: [
            { id: 'search_ops_dashboard', label: 'Dashboard', icon: BarChart3 },
            { id: 'search_ops_lab', label: 'Search Lab', icon: Search },
            { id: 'search_ops_ai', label: 'AI Ops', icon: Sparkles },
            { id: 'search_ops_relevance', label: 'Relevancia', icon: Settings2 },
            { id: 'search_ops_merch', label: 'Merchandising', icon: Target },
            { id: 'search_ops_ops', label: 'Operacoes', icon: Activity },
          ],
        },
        { id: 'enriquecimento', label: 'Enriquecimento IA', icon: Brain },
        { id: 'search_intelligence', label: 'Search Intelligence', icon: LineChart },
      ],
    },
    {
      label: 'Plataforma e Dados',
      items: [
        { id: 'operations', label: 'Operacoes de Sync', icon: ArrowLeftRight },
        { id: 'dados', label: 'Dados', icon: Database },
        { id: 'magento_migration', label: 'Sincronizacao / Backup', icon: Archive },
      ],
    },
    {
      label: 'Integracoes',
      items: [
        { id: 'frenet', label: 'Frete (Frenet)', icon: Truck },
        { id: 'frete_gratis', label: 'Frete Gratis', icon: Gift },
        { id: 'carriers', label: 'Transportadoras', icon: Truck },
        { id: 'payments', label: 'Pagamentos', icon: CreditCard },
        { id: 'coupons', label: 'Cupons', icon: Tag },
        { id: 'resend', label: 'E-mails (Resend)', icon: Mail },
      ],
    },
    {
      label: 'Seguranca e Compliance',
      items: [
        { id: 'audit_log', label: 'Trilha de Auditoria', icon: Shield },
        { id: 'integration_health', label: 'Saude das Integracoes', icon: Activity },
      ],
    },
    {
      label: 'Estrategia',
      items: [
        { id: 'growth_plan', label: 'Plano Enterprise', icon: Rocket },
      ],
    },
  ], []);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background font-sans">
      <Sidebar
        groups={navGroups}
        activeId={activeSection}
        onNavigate={onNavigate}
        isOpenMobile={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
        onBackToStore={onBackToStore}
      />

      <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur-md lg:hidden">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="-ml-2 rounded-md p-2 text-muted-foreground transition-colors hover:bg-secondary"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
