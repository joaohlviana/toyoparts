import React, { useState, useCallback } from 'react';
import { SyncPage } from './SyncPage';
import { AdminPage } from './AdminPage';
import { DeptImagesSection } from './DeptImagesSection';
import { ProductsPage } from './ProductsPage';
import { RedePecasPage } from './RedePecasPage';
import { EnriquecimentoPage } from './EnriquecimentoPage';
import { SEOAdminPage } from './SEOAdminPage';
import { SEOAdmin } from './admin/SEOAdmin';
import { SearchOps } from './admin/SearchOps';
import { GrowthPlan } from './admin/GrowthPlan';
import { PaymentAdmin } from '../components/admin/PaymentAdmin';
import { BannerManager } from '../components/admin/BannerManager';
import { FrenetAdmin } from '../components/admin/FrenetAdmin';
import { OrdersPage } from './OrdersPage';
import { StoredCustomersPage } from './admin/StoredCustomersPage';
import { StoredOrdersPage } from './admin/StoredOrdersPage';
import { MagentoMigrationPage } from './admin/MagentoMigrationPage';
import { NewsletterAdminPage } from './admin/NewsletterAdminPage';
import { AdminShell } from '../components/layout/AdminShell';
import { SearchIntelligenceDashboard } from '../components/admin/analytics/SearchIntelligenceDashboard';
import { ResendAdmin } from './admin/ResendAdmin';
import { CarriersPage } from './admin/CarriersPage';
import { AuditLogPage } from './admin/AuditLogPage';
import { IntegrationHealthPage } from './admin/IntegrationHealthPage';
import { DashboardPage } from './admin/DashboardPage';
import { CouponsAdminPage } from './admin/CouponsAdminPage';
import { PriceUpdatePage }  from './admin/PriceUpdatePage';
import { StripeTestPage } from './admin/StripeTestPage';
import { SSGAdminPage } from './admin/SSGAdminPage';
import { SnapshotAdminPage } from './SnapshotAdminPage';
import { LegacyRedirectsPage } from './admin/LegacyRedirectsPage';
import { FreeShippingAdminPage } from './admin/FreeShippingAdminPage';

// ─── Props ───────────────────────────────────────────────────────────────────

type SectionId = 
  | 'dashboard'
  | 'stored_orders'
  | 'stored_customers'
  | 'orders' 
  | 'operations' 
  | 'categories' 
  | 'images' 
  | 'products' 
  | 'rede_pecas' 
  | 'price_update'
  | 'enriquecimento' 
  | 'magento_migration'
  | 'newsletter'
  | 'search_ops' 
  | 'search_ops_dashboard'
  | 'search_ops_lab'
  | 'search_ops_ai'
  | 'search_ops_relevance'
  | 'search_ops_merch'
  | 'search_ops_ops'
  | 'seo'
  | 'seo_metadata'
  | 'seo_sitemaps'
  | 'seo_redirects'
  | 'snapshots'
  | 'banners' 
  | 'frenet'
  | 'frete_gratis'
  | 'carriers'
  | 'payments'
  | 'coupons'
  | 'growth_plan'
  | 'search_intelligence'
  | 'resend'
  | 'audit_log'
  | 'integration_health'
  | 'stripe_test'
  | 'ssg'
  | 'customers_loja'
  | 'dados';

interface AdminDashboardProps {
  initialSection?: SectionId;
  onBackToStore?: () => void;
  onSectionChange?: (section: SectionId) => void;
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function AdminDashboard({ initialSection = 'dashboard', onBackToStore, onSectionChange }: AdminDashboardProps) {
  const [activeSection, setActiveSection] = useState<SectionId>(initialSection);

  // Stable callback — não recriado a cada render, evita cascade de re-renders no AdminShell/Sidebar
  const handleNavigate = useCallback((id: string) => {
    const nextSection = id as SectionId;
    setActiveSection(nextSection);
    onSectionChange?.(nextSection);
  }, [onSectionChange]);

  React.useEffect(() => {
    setActiveSection(initialSection);
  }, [initialSection]);

  const isSearchOps = activeSection === 'search_ops' || activeSection.startsWith('search_ops_');
  const isSeo = activeSection === 'seo' || activeSection === 'seo_metadata';

  return (
    <AdminShell 
        activeSection={activeSection} 
        onNavigate={handleNavigate}
        onBackToStore={onBackToStore}
    >
        {activeSection === 'dashboard' && (
            <div className="h-full min-h-0 overflow-y-auto">
                <DashboardPage />
            </div>
        )}

        {activeSection === 'stored_orders' && (
            <div className="h-full min-h-0">
                <StoredOrdersPage />
            </div>
        )}

        {activeSection === 'stored_customers' && (
            <div className="h-full min-h-0">
                <StoredCustomersPage />
            </div>
        )}
        
        {/* Keep original 'orders' for backward compatibility or direct link, but removed from menu */}
        {activeSection === 'orders' && (
            <div className="h-full min-h-0">
                <OrdersPage />
            </div>
        )}

        {activeSection === 'operations' && (
            <div className="h-full min-h-0">
                <SyncPage />
            </div>
        )}
        
        {activeSection === 'products' && (
            <div className="h-full min-h-0">
                <ProductsPage />
            </div>
        )}
        
        {activeSection === 'categories' && (
            <div className="h-full min-h-0">
                <AdminPage />
            </div>
        )}
        
        {activeSection === 'images' && (
            <div className="h-full min-h-0">
                <div className="max-w-[1280px] mx-auto px-4 lg:px-6 pt-6 pb-12">
                    <DeptImagesSection />
                </div>
            </div>
        )}

        {activeSection === 'rede_pecas' && (
            <div className="h-full min-h-0">
                <RedePecasPage />
            </div>
        )}

        {activeSection === 'price_update' && (
            <div className="h-full min-h-0 overflow-y-auto">
                <PriceUpdatePage />
            </div>
        )}

        {activeSection === 'enriquecimento' && (
            <div className="h-full min-h-0">
                <EnriquecimentoPage />
            </div>
        )}

        {activeSection === 'magento_migration' && (
            <div className="h-full min-h-0">
                <MagentoMigrationPage />
            </div>
        )}

        {activeSection === 'newsletter' && (
            <div className="h-full min-h-0">
                <NewsletterAdminPage />
            </div>
        )}

        {isSearchOps && (
            <div className="h-full min-h-0">
                <SearchOps activeSection={activeSection} />
            </div>
        )}

        {isSeo && (
            <div className="h-full min-h-0">
                <SEOAdminPage />
            </div>
        )}

        {activeSection === 'snapshots' && (
            <div className="h-full min-h-0 overflow-y-auto">
                <SnapshotAdminPage />
            </div>
        )}

        {activeSection === 'seo_sitemaps' && (
            <div className="h-full min-h-0">
                <SEOAdmin />
            </div>
        )}

        {activeSection === 'seo_redirects' && (
            <div className="h-full min-h-0 overflow-y-auto">
                <LegacyRedirectsPage />
            </div>
        )}

        {activeSection === 'banners' && (
            <div className="h-full min-h-0">
                <BannerManager />
            </div>
        )}

        {activeSection === 'frenet' && (
            <div className="h-full min-h-0">
                <FrenetAdmin />
            </div>
        )}

        {activeSection === 'frete_gratis' && (
            <div className="h-full min-h-0 overflow-y-auto">
                <FreeShippingAdminPage />
            </div>
        )}

        {activeSection === 'carriers' && (
            <div className="h-full min-h-0">
                <CarriersPage />
            </div>
        )}

        {activeSection === 'audit_log' && (
            <div className="h-full min-h-0 overflow-y-auto">
                <AuditLogPage />
            </div>
        )}

        {activeSection === 'integration_health' && (
            <div className="h-full min-h-0 overflow-y-auto">
                <IntegrationHealthPage />
            </div>
        )}

        {activeSection === 'stripe_test' && (
            <div className="h-full min-h-0 overflow-y-auto">
                <StripeTestPage />
            </div>
        )}

        {activeSection === 'ssg' && (
            <div className="h-full min-h-0 overflow-y-auto">
                <SSGAdminPage />
            </div>
        )}

        {activeSection === 'payments' && (
            <div className="h-full min-h-0">
                <PaymentAdmin />
            </div>
        )}

        {activeSection === 'coupons' && (
            <div className="h-full min-h-0 overflow-y-auto">
                <CouponsAdminPage />
            </div>
        )}

        {activeSection === 'growth_plan' && (
            <div className="h-full min-h-0">
                <GrowthPlan />
            </div>
        )}

        {activeSection === 'search_intelligence' && (
            <div className="h-full min-h-0">
                <SearchIntelligenceDashboard />
            </div>
        )}

        {activeSection === 'resend' && (
            <div className="h-full min-h-0">
                <ResendAdmin />
            </div>
        )}

        {activeSection === 'customers_loja' && (
            <div className="h-full min-h-0 flex items-center justify-center">
                <div className="text-center space-y-3 p-12">
                    <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mx-auto">
                        <svg className="w-7 h-7 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" /></svg>
                    </div>
                    <p className="text-base font-semibold text-foreground">Clientes — Loja</p>
                    <p className="text-sm text-muted-foreground max-w-xs">Módulo em construção. Os clientes nativos da nova loja aparecerão aqui.</p>
                </div>
            </div>
        )}

        {activeSection === 'dados' && (
            <div className="h-full min-h-0 flex items-center justify-center">
                <div className="text-center space-y-3 p-12">
                    <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mx-auto">
                        <svg className="w-7 h-7 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 5.625c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" /></svg>
                    </div>
                    <p className="text-base font-semibold text-foreground">Dados</p>
                    <p className="text-sm text-muted-foreground max-w-xs">Visualização e exportação de dados da plataforma. Módulo em construção.</p>
                </div>
            </div>
        )}
    </AdminShell>
  );
}
