// React Router configuration.
// Route components are truly lazy-loaded so each public page no longer ships in the main bundle.

import React from 'react';
import { createBrowserRouter } from 'react-router';

type RouteProps = Record<string, unknown>;

function createLazyRoute<TProps extends RouteProps = RouteProps>(
  loader: () => Promise<{ default: React.ComponentType<TProps> }>,
): React.ComponentType<TProps> {
  const LazyComponent = React.lazy(loader);

  function LazyRouteComponent(props: TProps) {
    return <LazyComponent {...props} />;
  }

  LazyRouteComponent.displayName = 'LazyRouteComponent';
  return LazyRouteComponent;
}

const RootLayout = createLazyRoute(() =>
  import('./components/RootLayout').then((module) => ({ default: module.RootLayout })),
);
const AdminLayout = createLazyRoute(() =>
  import('./components/AdminLayout').then((module) => ({ default: module.AdminLayout })),
);

const HomePage = createLazyRoute(() =>
  import('./pages/HomePage').then((module) => ({ default: module.HomePage })),
);
const ProductDetailPage = createLazyRoute(() =>
  import('./pages/ProductDetailPage').then((module) => ({ default: module.ProductDetailPage })),
);
const CheckoutPage = createLazyRoute(() =>
  import('./pages/CheckoutPage').then((module) => ({ default: module.CheckoutPage })),
);
const OrderSuccessPage = createLazyRoute(() =>
  import('./pages/OrderSuccessPage').then((module) => ({ default: module.OrderSuccessPage })),
);
const MagicLoginPage = createLazyRoute(() =>
  import('./pages/auth/MagicLoginPage').then((module) => ({ default: module.MagicLoginPage })),
);
const AuthCallbackPage = createLazyRoute(() =>
  import('./pages/auth/AuthCallbackPage').then((module) => ({ default: module.AuthCallbackPage })),
);
const OrderHistoryPage = createLazyRoute(() =>
  import('./pages/account/OrderHistoryPage').then((module) => ({ default: module.OrderHistoryPage })),
);
const SearchPageWrapper = createLazyRoute(() =>
  import('./components/wrappers/SearchPageWrapper').then((module) => ({ default: module.SearchPageWrapper })),
);
const ModeloSearchWrapper = createLazyRoute(() =>
  import('./components/wrappers/ModeloSearchWrapper').then((module) => ({ default: module.ModeloSearchWrapper })),
);
const SobrePage = createLazyRoute(() =>
  import('./pages/SobrePage').then((module) => ({ default: module.SobrePage })),
);
const PrivacyPage = createLazyRoute(() =>
  import('./pages/PrivacyPage').then((module) => ({ default: module.PrivacyPage })),
);
const DeliveryPage = createLazyRoute(() =>
  import('./pages/DeliveryPage').then((module) => ({ default: module.DeliveryPage })),
);
const ReturnsPage = createLazyRoute(() =>
  import('./pages/ReturnsPage').then((module) => ({ default: module.ReturnsPage })),
);
const OrderTrackingPage = createLazyRoute(() =>
  import('./pages/OrderTrackingPage').then((module) => ({ default: module.OrderTrackingPage })),
);
const ContactPage = createLazyRoute(() =>
  import('./pages/ContactPage').then((module) => ({ default: module.ContactPage })),
);
const StorePage = createLazyRoute(() =>
  import('./pages/StorePage').then((module) => ({ default: module.StorePage })),
);
const NotFoundPage = createLazyRoute(() =>
  import('./pages/NotFoundPage').then((module) => ({ default: module.NotFoundPage })),
);

export const router = createBrowserRouter([
  {
    path: '/admin/*',
    Component: AdminLayout,
  },
  {
    path: '/checkout',
    Component: CheckoutPage,
  },
  {
    path: '/',
    Component: RootLayout,
    children: [
      { index: true, Component: HomePage },
      { path: 'acesso', Component: MagicLoginPage },
      { path: 'sobre', Component: SobrePage },
      { path: 'fale-conosco', Component: ContactPage },
      { path: 'loja-fisica', Component: StorePage },
      { path: 'privacidade', Component: PrivacyPage },
      { path: 'politica-de-privacidade', Component: PrivacyPage },
      { path: 'entrega', Component: DeliveryPage },
      { path: 'politica-de-entrega', Component: DeliveryPage },
      { path: 'troca-devolucoes', Component: ReturnsPage },
      { path: 'trocas-e-devolucoes', Component: ReturnsPage },
      { path: 'rastreamento-correios', Component: OrderTrackingPage },
      { path: 'rastreamento', Component: OrderTrackingPage },
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
      { path: '*', Component: NotFoundPage },
    ],
  },
]);
