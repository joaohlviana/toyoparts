import { StaticPage } from '@/components/static-page';
import { buildPageMetadata } from '@/lib/metadata';
import { staticPages } from '@/lib/static-content';

export const metadata = buildPageMetadata({
  title: staticPages.contato.title,
  description: staticPages.contato.description,
  canonical: staticPages.contato.canonical,
});

export default function FaleConoscoPage() {
  return <StaticPage content={staticPages.contato} />;
}
