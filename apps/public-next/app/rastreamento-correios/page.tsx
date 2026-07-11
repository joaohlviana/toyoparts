import { StaticPage } from '@/components/static-page';
import { buildPageMetadata } from '@/lib/metadata';
import { staticPages } from '@/lib/static-content';

export const metadata = buildPageMetadata({
  title: staticPages.rastreamento.title,
  description: staticPages.rastreamento.description,
  canonical: staticPages.rastreamento.canonical,
});

export default function RastreamentoPage() {
  return <StaticPage content={staticPages.rastreamento} />;
}
