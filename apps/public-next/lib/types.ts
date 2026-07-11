export interface FreeShippingPromo {
  eligible: boolean;
  couponCode: string;
  ruleId: string;
  ruleName: string;
  whatsappUrl: string;
}

export interface CatalogHit {
  id?: string;
  sku: string;
  name: string;
  seo_title?: string;
  meta_description?: string;
  price: number;
  special_price?: number | null;
  image_url?: string;
  url_key?: string;
  in_stock?: boolean;
  status?: number;
  modelos?: string[];
  anos?: string[];
  category_ids?: string[];
  category_names?: string[];
  _formatted?: Record<string, unknown>;
  freeShippingPromo?: FreeShippingPromo | null;
  [key: string]: unknown;
}

export interface SearchResponse {
  hits: CatalogHit[];
  totalHits: number;
  estimatedTotalHits?: number;
  facetDistribution?: Record<string, Record<string, number>>;
  facetStats?: Record<string, { min: number; max: number }>;
  mode?: string;
  aiExpansion?: unknown;
}

export interface CategoryNode {
  id: number;
  name: string;
  level: number;
  is_active: boolean;
  product_count: number;
  children_data: CategoryNode[];
}

export interface CategoryWithPath {
  node: CategoryNode;
  parents: CategoryNode[];
  slug: string;
  slugPath: string[];
}

export interface BannerRecord {
  id: string;
  type: string;
  order?: number;
  active?: boolean;
  headline?: string;
  overline?: string;
  subtitle?: string;
  ctaText?: string;
  ctaLink?: string;
  searchLink?: string;
  bgColor?: string;
  bgImageSrc?: string;
  linkHref?: string;
  desktopImageSrc?: string;
  mobileImageSrc?: string;
  productName?: string;
  modelYear?: string;
  priceDe?: string;
  pricePor?: string;
  priceAVista?: string;
  installments?: string;
  accentColor?: string;
}

export interface SeoProduct {
  id?: number;
  sku: string;
  name: string;
  seo_title?: string;
  meta_description?: string;
  url_key?: string;
  price: number;
  special_price?: number | null;
  status?: number;
  in_stock?: boolean;
  weight?: number | null;
  description?: string;
  short_description?: string;
  image_url?: string;
  images?: string[];
  category_names?: { id: string; name: string; path?: string }[];
  modelo_label?: string | null;
  ano_labels?: string | null;
  compat_models?: Array<{
    codigo: string;
    modelo: string;
    motor: string;
    trim: string;
    cambio: string;
    anos: string[];
  }>;
  bullet_points?: string[];
  tags_seo?: string[];
  freeShippingPromo?: FreeShippingPromo | null;
}
