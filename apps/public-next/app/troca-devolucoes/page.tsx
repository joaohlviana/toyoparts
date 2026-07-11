import { StaticPage } from '@/components/static-page';
import { buildPageMetadata } from '@/lib/metadata';
import { staticPages } from '@/lib/static-content';

export const metadata = buildPageMetadata({
  title: staticPages.troca.title,
  description: staticPages.troca.description,
  canonical: staticPages.troca.canonical,
});

export default function TrocaDevolucoesPage() {
  return <StaticPage content={staticPages.troca} />;
}
