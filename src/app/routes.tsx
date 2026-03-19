// ─── React Router Data Mode Configuration ────────────────────────────────────
// Uses createBrowserRouter + RouterProvider (required by this environment).
// All page components are lazy-loaded to reduce initial bundle size.

import React from 'react';
import { createBrowserRouter } from 'react-router';

// Layout components
import { RootLayout } from './components/RootLayout';
import { AdminLayout } from './components/AdminLayout';

// Page components
import { HomePage } from './pages/HomePage';
import { ProductDetailPage } from './pages/ProductDetailPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { OrderSuccessPage } from './pages/OrderSuccessPage';
import { MagicLoginPage } from './pages/auth/MagicLoginPage';
import { AuthCallbackPage } from './pages/auth/AuthCallbackPage';
import { OrderHistoryPage } from './pages/account/OrderHistoryPage';
import { SearchPageWrapper } from './components/wrappers/SearchPageWrapper';
import { ModeloSearchWrapper } from './components/wrappers/ModeloSearchWrapper';
import { SobrePage } from './pages/SobrePage';
import { PrivacyPage } from './pages/PrivacyPage';
import { DeliveryPage } from './pages/DeliveryPage';
import { ReturnsPage } from './pages/ReturnsPage';
import { OrderTrackingPage } from './pages/OrderTrackingPage';

// ─── Router ──────────────────────────────────────────────────────────────────

export const router = createBrowserRouter([
  // Admin routes — separate layout (no MegaMenu/Footer)
  {
    path: '/admin/*',
    Component: AdminLayout,
  },
  // Checkout route — separate layout (Clean UX)
  {
    path: '/checkout',
    Component: CheckoutPage,
  },
  // Store routes — full layout with MegaMenu, Footer, etc.
  {
    path: '/',
    Component: RootLayout,
    children: [
      { index: true, Component: HomePage },
      { path: 'acesso', Component: MagicLoginPage },
      { path: 'sobre', Component: SobrePage },
      { path: 'politica-de-privacidade', Component: PrivacyPage },
      { path: 'politica-de-entrega',     Component: DeliveryPage },
      { path: 'trocas-e-devolucoes',     Component: ReturnsPage },
      { path: 'rastreamento',            Component: OrderTrackingPage },
      { path: 'auth/callback', Component: AuthCallbackPage },
      { path: 'minha-conta/pedidos', Component: OrderHistoryPage },
      { path: 'pecas/:modelo/:categoriaSlug', Component: ModeloSearchWrapper },
      { path: 'pecas/:modelo', Component: ModeloSearchWrapper },
      { path: 'produto/:sku/:slug', Component: ProductDetailPage },
      { path: 'produto/:sku', Component: ProductDetailPage },
      { path: 'busca', Component: SearchPageWrapper },
      { path: 'pecas', Component: SearchPageWrapper },
      { path: 'pedido/sucesso', Component: OrderSuccessPage },
      { path: 'pedido/obrigado', Component: OrderSuccessPage },
      { path: '*', Component: SearchPageWrapper },
    ],
  },
]);