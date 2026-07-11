import { StaticPage } from '@/components/static-page';
import { buildPageMetadata } from '@/lib/metadata';
import { staticPages } from '@/lib/static-content';

export const metadata = buildPageMetadata({
  title: staticPages.privacidade.title,
  description: staticPages.privacidade.description,
  canonical: staticPages.privacidade.canonical,
});

export default function PrivacidadePage() {
  return <StaticPage content={staticPages.privacidade} />;
}
