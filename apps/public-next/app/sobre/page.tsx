import { StaticPage } from '@/components/static-page';
import { buildPageMetadata } from '@/lib/metadata';
import { staticPages } from '@/lib/static-content';

export const metadata = buildPageMetadata({
  title: staticPages.sobre.title,
  description: staticPages.sobre.description,
  canonical: staticPages.sobre.canonical,
});

export default function SobrePage() {
  return <StaticPage content={staticPages.sobre} />;
}
