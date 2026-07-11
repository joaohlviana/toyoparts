import { StaticPage } from '@/components/static-page';
import { buildPageMetadata } from '@/lib/metadata';
import { staticPages } from '@/lib/static-content';

export const metadata = buildPageMetadata({
  title: staticPages.entrega.title,
  description: staticPages.entrega.description,
  canonical: staticPages.entrega.canonical,
});

export default function EntregaPage() {
  return <StaticPage content={staticPages.entrega} />;
}
