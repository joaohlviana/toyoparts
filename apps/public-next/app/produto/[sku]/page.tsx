import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { CatalogApiError, getProductBySku, searchCatalog } from '@/lib/api';
import { ProductDetailView } from '@/components/product-detail-view';
import { buildPageMetadata } from '@/lib/metadata';
import { generateBreadcrumbJsonLd, generateProductJsonLd, slugify } from '@/lib/seo';

export const revalidate = 300;

interface Props {
  params: Promise<{ sku: string; slug?: string }>;
}

function isGenericProductDescription(description?: string | null) {
  const normalized = String(description || '').trim().toLowerCase();
  return !normalized || normalized.includes('verifique a compatibilidade da peça');
}

function buildProductDescription(product: {
  name: string;
  sku: string;
  meta_description?: string | null;
  short_description?: string | null;
  description?: string | null;
  modelo_label?: string | null;
  ano_labels?: string | null;
}) {
  if (!isGenericProductDescription(product.meta_description)) return String(product.meta_description).trim();
  if (!isGenericProductDescription(product.short_description)) return String(product.short_description).trim();

  const compatibility = [product.modelo_label, product.ano_labels].filter(Boolean).join(' ');
  return [
    `${product.name} original Toyota`,
    `SKU ${product.sku}`,
    compatibility ? `compatível com ${compatibility}` : '',
    'na Toyoparts. Consulte compatibilidade pelo chassi e compre com envio para todo o Brasil.',
  ].filter(Boolean).join(' ');
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { sku, slug } = await params;

  try {
    const product = await getProductBySku(sku);
    const canonicalSlug = product.url_key || slugify(product.name);
    const description = buildProductDescription(product);
    return buildPageMetadata({
      title: product.seo_title || product.name,
      description,
      canonical: `/produto/${encodeURIComponent(product.sku)}/${canonicalSlug}`,
      image: product.image_url || product.images?.[0],
    });
  } catch (error) {
    if (!(error instanceof CatalogApiError) || error.status !== 404) throw error;
    return buildPageMetadata({
      title: 'Produto | Toyoparts',
      description: 'Produto da Toyoparts',
      canonical: `/produto/${encodeURIComponent(sku)}`,
    });
  }
}

export default async function ProductPage({ params }: Props) {
  const { sku, slug } = await params;

  let product;
  try {
    product = await getProductBySku(sku);
  } catch (error) {
    if (error instanceof CatalogApiError && error.status === 404) notFound();
    throw error;
  }

  const canonicalSlug = product.url_key || slugify(product.name);
  const canonicalPath = `/produto/${encodeURIComponent(product.sku)}/${canonicalSlug}`;
  if (slug !== canonicalSlug) permanentRedirect(canonicalPath);

  const related = await searchCatalog({
    q: '',
    limit: 4,
    inStock: true,
    modelos: product.modelo_label ? [product.modelo_label] : undefined,
    categoryNames: product.category_names?.length ? [product.category_names[product.category_names.length - 1].name] : undefined,
  }).catch(() => ({ hits: [] as any[] }));

  const jsonLd = generateProductJsonLd({
    sku: product.sku,
    name: product.name,
    seo_title: product.seo_title,
    description: buildProductDescription(product),
    price: product.price,
    special_price: product.special_price,
    image_url: product.image_url,
    images: product.images,
    in_stock: product.in_stock ?? true,
    url_key: product.url_key,
    url_slug: canonicalSlug,
    modelo_label: product.modelo_label || undefined,
    ano_labels: product.ano_labels || undefined,
  });

  const relatedProducts = related.hits.filter((item) => item.sku !== product.sku).slice(0, 4);
  const breadcrumbJsonLd = generateBreadcrumbJsonLd([
    { name: 'Home', path: '/' },
    { name: 'Peças', path: '/pecas' },
    { name: product.name, path: canonicalPath },
  ]);

  return (
    <>
      {jsonLd ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} /> : null}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <ProductDetailView product={product} relatedProducts={relatedProducts} />
    </>
  );
}
