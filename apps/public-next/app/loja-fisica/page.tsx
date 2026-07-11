import { StaticPage } from '@/components/static-page';
import { buildPageMetadata } from '@/lib/metadata';
import { staticPages } from '@/lib/static-content';

export const metadata = buildPageMetadata({
  title: staticPages.loja.title,
  description: staticPages.loja.description,
  canonical: staticPages.loja.canonical,
});

export default function LojaFisicaPage() {
  return <StaticPage content={staticPages.loja} />;
}
