export type HomeSmallBannerTheme = 'dark' | 'light' | 'primary';

export type HomeMerchandisingSource =
  | 'manual_only'
  | 'catalog'
  | 'top_searched'
  | 'top_promotions'
  | 'newest';

export type HomeMerchandisingSort =
  | 'intelligence_rank'
  | 'newest_desc'
  | 'discount_desc'
  | 'price_desc'
  | 'price_asc';

export type HomeRuleConditionType =
  | 'in_stock'
  | 'has_promotion'
  | 'category_in'
  | 'category_not_in'
  | 'price_range'
  | 'sku_in'
  | 'sku_not_in';

export interface HomeScheduleWindow {
  startAt?: string | null;
  endAt?: string | null;
}

export interface HomeDepartmentsConfig {
  selectedCategoryIds: string[];
  limit: number;
}

export interface HomeSmallBannerConfig {
  id: string;
  active: boolean;
  overline: string;
  title: string;
  ctaText: string;
  href: string;
  ctaKind?: 'link' | 'whatsapp';
  trackingId?: string;
  linkedProductSku?: string | null;
  goalEnabled?: boolean;
  theme: HomeSmallBannerTheme;
  imageUrl?: string;
  schedule?: HomeScheduleWindow | null;
}

export interface HomeRuleCondition {
  id: string;
  type: HomeRuleConditionType;
  values?: string[];
  minPrice?: number | null;
  maxPrice?: number | null;
}

export interface HomeRuleGroup {
  id: string;
  conditions: HomeRuleCondition[];
}

export interface HomeMerchandisingSectionConfig {
  enabled: boolean;
  title: string;
  subtitle: string;
  limit: number;
  source: HomeMerchandisingSource;
  sort: HomeMerchandisingSort;
  lookbackDays: number;
  ruleGroups: HomeRuleGroup[];
  pinnedSkus: string[];
  excludedSkus: string[];
  schedule?: HomeScheduleWindow | null;
}

export interface HomePageConfig {
  departments: HomeDepartmentsConfig;
  smallBanners: HomeSmallBannerConfig[];
  offers: HomeMerchandisingSectionConfig;
  popular: HomeMerchandisingSectionConfig;
  newArrivals: HomeMerchandisingSectionConfig;
  updatedAt?: string | null;
  updatedBy?: string | null;
}

export interface HomeConfigPreviewProduct {
  sku: string;
  name: string;
  price: number;
  special_price?: number | null;
  image_url?: string | null;
  url_key?: string | null;
  in_stock?: boolean;
}

export interface HomeConfigResolvedProduct extends HomeConfigPreviewProduct {
  reason: 'pinned' | 'rule';
  reasonLabel: string;
}

export interface HomeConfigResolvedSection {
  active: boolean;
  matchedBeforeLimit: number;
  products: HomeConfigResolvedProduct[];
  missingPinnedSkus: string[];
  excludedSkus: string[];
}

export interface HomeConfigResolvedPayload {
  offers: HomeConfigResolvedSection;
  popular: HomeConfigResolvedSection;
  newArrivals: HomeConfigResolvedSection;
}

export interface HomeConfigResponse {
  config: HomePageConfig;
  resolved: HomeConfigResolvedPayload;
}

export interface HomeHeroBannerSnapshot {
  id: string;
  active: boolean;
  order: number;
  desktopImageSrc: string;
  mobileImageSrc?: string;
  linkHref?: string;
  altText?: string;
}

export interface HomeDepartmentSnapshot {
  id: string;
  name: string;
  imageUrl: string;
  productCount: number;
  href: string;
  source: 'admin' | 'automatic';
}

export interface HomePageSnapshot {
  version: 1;
  config: HomePageConfig;
  resolved: HomeConfigResolvedPayload;
  heroBanners: HomeHeroBannerSnapshot[];
  departments: HomeDepartmentSnapshot[];
  offers: HomeConfigResolvedSection;
  popularProducts: HomeConfigResolvedSection;
  newArrivals: HomeConfigResolvedSection;
  smallBanners: HomeSmallBannerConfig[];
  compatibilityBanner: {
    enabled: boolean;
  };
  newsletter: {
    enabled: boolean;
  };
  meta: {
    publishedAt?: string | null;
    generatedAt: string;
    snapshotGeneratedAt: string;
    sources?: Record<string, string>;
    warnings?: string[];
  };
}

export interface HomeAdminConfigMeta {
  draftUpdatedAt?: string | null;
  draftUpdatedBy?: string | null;
  publishedAt?: string | null;
  publishedBy?: string | null;
  hasDraftChanges: boolean;
  resolutionWarning?: string | null;
  resolutionDegraded?: boolean;
}

export interface HomeAdminConfigBundle {
  draft: HomePageConfig;
  published: HomePageConfig;
  resolvedDraft: HomeConfigResolvedPayload;
  resolvedPublished: HomeConfigResolvedPayload;
  meta: HomeAdminConfigMeta;
  legacyBackend?: boolean;
}

export interface HomePickerProduct {
  sku: string;
  name: string;
  image_url?: string | null;
  price?: number | null;
  special_price?: number | null;
  in_stock?: boolean;
}
