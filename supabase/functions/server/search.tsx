import { Hono } from 'npm:hono';
import * as meili from './meilisearch.tsx';
import * as kv from './kv_store.tsx';
import * as aiSearch from './ai-search.tsx';
import { resolveProductMedia } from './media-utils.tsx';
import {
  buildCanonicalVehicleFacetTargets,
  getCanonicalVehicleModelBySlug,
  normalizeVehicleValue,
  resolveCanonicalVehicleSlugs,
} from '../../../shared/canonical-vehicle-models.ts';
import { resolveProductCompatibility } from '../../../shared/product-compatibility.ts';
import {
  buildCategoryFilterTree,
  getCanonicalCategoryTreeContext,
  resolveCategoryTreeSelections,
} from './categories.tsx';

const app = new Hono();

const SKU_QUERY_PATTERN = /^[A-Z0-9\-_.\/]+$/i;
const EMPTY_SEARCH_META = {
  anos: {},
  colors: {},
  modelos: {},
  categories: {},
};

function normalizeSkuQuery(value: string) {
  return String(value || '').trim().toUpperCase();
}

function isLikelySkuQuery(value: string) {
  const trimmed = String(value || '').trim();
  if (!trimmed || trimmed.length < 5) return false;
  if (/\s/.test(trimmed)) return false;
  if (!/\d/.test(trimmed)) return false;
  return SKU_QUERY_PATTERN.test(trimmed);
}

function normalizeText(value: any) {
  return String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseNumber(value: any): number | null {
  if (value == null || value === '') return null;
  const normalized = String(value).replace(',', '.').trim();
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

function uniqueStrings(values: any[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = String(value ?? '').trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function toStringArray(value: any): string[] {
  if (Array.isArray(value)) {
    return uniqueStrings(
      value.flatMap((entry: any) => {
        if (entry == null) return [];
        if (typeof entry === 'string' || typeof entry === 'number') return [String(entry)];
        if (typeof entry === 'object') {
          const candidate = entry.name ?? entry.label ?? entry.value ?? entry.id;
          return candidate == null ? [] : [String(candidate)];
        }
        return [];
      }),
    );
  }
  if (value == null || value === '') return [];
  return uniqueStrings(
    String(value)
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean),
  );
}

function resolveLegacyModelFilters(
  rawValues: string[],
) {
  const resolved: string[] = [];

  for (const rawValue of rawValues) {
    const trimmed = String(rawValue || '').trim();
    if (!trimmed) continue;

    const canonicalSlugs = resolveCanonicalVehicleSlugs([trimmed]);
    if (canonicalSlugs.length > 0) {
      resolved.push(...canonicalSlugs);
      continue;
    }

    const normalized = normalizeVehicleValue(trimmed);
    if (!normalized) continue;

    const canonicalModel = getCanonicalVehicleModelBySlug(normalized);
    if (canonicalModel) {
      resolved.push(canonicalModel.slug);
      continue;
    }
  }

  return uniqueStrings(resolved);
}

function resolveInStock(product: any): boolean {
  if (typeof product?.in_stock === 'boolean') return product.in_stock;
  const stockData = product?.extension_attributes?.stock;
  if (!stockData) return false;
  try {
    const stock = typeof stockData === 'string' ? JSON.parse(stockData) : stockData;
    const value = stock?.is_in_stock;
    return value === true || value === 1 || value === '1';
  } catch {
    return false;
  }
}

function normalizeExactHitFromCanonical(product: any) {
  const sku = String(product?.sku || '').trim();
  const sanitizedSku = meili.sanitizeSku(sku) || sku;
  const price = parseNumber(product?.price) || 0;
  const specialCandidate = parseNumber(product?.special_price);
  const specialPrice = specialCandidate != null && specialCandidate > 0 && specialCandidate < price
    ? specialCandidate
    : null;
  const categoryIds = toStringArray(product?.category_ids);
  const categoryPathIds = toStringArray(product?.category_path_ids ?? categoryIds);
  const categoryNames = toStringArray(product?.category_names);
  const modelos = toStringArray(
    product?.modelo_labels
    ?? product?.compatibility_summary?.models
    ?? product?.modelos
    ?? product?.modelo_label,
  );
  const modeloSlugs = toStringArray(product?.modelo_slugs);
  const canonicalModelSlugs = modeloSlugs.length > 0
    ? modeloSlugs
    : resolveCanonicalVehicleSlugs([...modelos, product?.modelo_label, product?.modelo]);
  const anos = toStringArray(
    product?.ano_labels
    ?? product?.compatibility_summary?.years
    ?? product?.anos
    ?? product?.ano_labels,
  );
  const color = product?.color_label ?? product?.color ?? null;
  const media = resolveProductMedia(product, { allowLegacy: false });
  const compatibility = resolveProductCompatibility(product);

  return {
    id: sanitizedSku,
    sku,
    _sku_sanitized: sanitizedSku !== sku,
    name: String(product?.name || ''),
    price,
    special_price: specialPrice,
    status: Number(product?.status || 0),
    type_id: String(product?.type_id || 'simple'),
    in_stock: resolveInStock(product),
    category_ids: categoryIds,
    category_path_ids: categoryPathIds.length > 0 ? categoryPathIds : categoryIds,
    category_names: categoryNames,
    modelos,
    modelo_slugs: canonicalModelSlugs,
    anos,
    compat_years: toStringArray(product?.compat_years ?? product?.compatibility_summary?.years),
    compat_versions: toStringArray(product?.compat_versions ?? product?.compatibility_summary?.versions),
    compatibility_display: compatibility.compatibilityDisplay,
    color: color == null || color === '' ? null : String(color),
    image_url: media.image_url,
    images: media.images,
    description: normalizeText(product?.description),
    short_description: normalizeText(product?.short_description),
    created_at: product?.created_at || '',
    updated_at: product?.updated_at || '',
    has_image: media.has_image,
    _image_source: media._image_source,
    _image_sync_status: media._image_sync_status,
    has_promotion: specialPrice != null,
  };
}

function applyResolvedMedia(hit: any, allowLegacy = false) {
  const media = resolveProductMedia(hit, { allowLegacy });
  const nextHit: Record<string, any> = {
    ...hit,
    image_url: media.image_url,
    images: media.images,
    has_image: media.has_image,
    _image_source: media._image_source,
    _image_sync_status: media._image_sync_status,
  };

  if (hit?._formatted && typeof hit._formatted === 'object') {
    nextHit._formatted = {
      ...hit._formatted,
      image_url: media.image_url,
    };
  }

  return nextHit;
}

function createFacetCount(values: Array<string | null | undefined>) {
  const counts: Record<string, number> = {};
  for (const value of values) {
    const normalized = String(value ?? '').trim();
    if (!normalized) continue;
    counts[normalized] = (counts[normalized] || 0) + 1;
  }
  return counts;
}

function buildSyntheticFacets(hit: any) {
  const priceValue = parseNumber(hit?.price);
  const priceFacet = priceValue != null && priceValue > 0
    ? { [String(priceValue)]: 1 }
    : {};

  return {
    category_ids: createFacetCount(Array.isArray(hit?.category_ids) ? hit.category_ids : []),
    category_path_ids: createFacetCount(Array.isArray(hit?.category_path_ids) ? hit.category_path_ids : []),
    category_names: createFacetCount(Array.isArray(hit?.category_names) ? hit.category_names : []),
    modelos: createFacetCount(Array.isArray(hit?.modelos) ? hit.modelos : []),
    modelo_slugs: createFacetCount(Array.isArray(hit?.modelo_slugs) ? hit.modelo_slugs : []),
    anos: createFacetCount(Array.isArray(hit?.anos) ? hit.anos : []),
    compat_years: createFacetCount(Array.isArray(hit?.compat_years) ? hit.compat_years : (Array.isArray(hit?.anos) ? hit.anos : [])),
    color: createFacetCount(hit?.color ? [hit.color] : []),
    in_stock: createFacetCount([hit?.in_stock === false ? 'false' : 'true']),
    price: priceFacet,
  };
}

function buildSyntheticFacetStats(hit: any) {
  const priceValue = parseNumber(hit?.price);
  if (priceValue == null || priceValue <= 0) return {};
  return {
    price: {
      min: priceValue,
      max: priceValue,
    },
  };
}

function resolveCategoryTreeStatus(
  treeStatus: 'live' | 'cached' | 'degraded',
  facetStatus: 'live' | 'cached',
): 'live' | 'cached' | 'degraded' {
  if (treeStatus === 'degraded') return 'degraded';
  if (facetStatus === 'live') return 'live';
  return 'cached';
}

function buildVehicleFacetsFromDistribution(distribution: Record<string, number>) {
  return buildCanonicalVehicleFacetTargets(distribution).map((entry) => ({
    slug: entry.slug,
    label: entry.displayName,
    count: entry.productCount,
  }));
}

function buildYearFacetsFromDistribution(distribution: Record<string, number>) {
  return Object.entries(distribution || {})
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([value, count]) => ({
      value,
      count: Number(count || 0),
    }))
    .filter((entry) => entry.count > 0);
}

function matchesAnyValue(candidates: string[], expected: string[]) {
  if (!expected.length) return true;
  if (!candidates.length) return false;
  const candidateSet = new Set(candidates.map((value) => String(value).trim()));
  return expected.some((value) => candidateSet.has(String(value).trim()));
}

function matchesExactFilters(
  hit: any,
  options: {
    inStock?: string | null;
    categories?: string[];
    categoryNames?: string[];
    modelos?: string[];
    modeloSlugs?: string[];
    anos?: string[];
    color?: string[];
    minPrice?: number | null;
    maxPrice?: number | null;
  },
) {
  const price = parseNumber(hit?.price) || 0;
  const inStock = hit?.in_stock === true;

  if (options.inStock === 'true' && !inStock) return false;
  if (options.inStock === 'false' && inStock) return false;
  if (!matchesAnyValue(toStringArray(hit?.category_ids), options.categories || [])) return false;
  if (!matchesAnyValue(toStringArray(hit?.category_names), options.categoryNames || [])) return false;
  if (!matchesAnyValue(toStringArray(hit?.modelos), options.modelos || [])) return false;
  if (!matchesAnyValue(toStringArray(hit?.modelo_slugs), options.modeloSlugs || [])) return false;
  if (!matchesAnyValue(toStringArray(hit?.compat_years ?? hit?.anos), options.anos || [])) return false;
  if (!matchesAnyValue(hit?.color ? [String(hit.color)] : [], options.color || [])) return false;
  if (options.minPrice != null && price < options.minPrice) return false;
  if (options.maxPrice != null && price > options.maxPrice) return false;

  return true;
}

async function findExactSkuHit(
  rawQuery: string,
  options: {
    filters: string[];
    inStock?: string | null;
    categories?: string[];
    categoryNames?: string[];
    modelos?: string[];
    modeloSlugs?: string[];
    anos?: string[];
    color?: string[];
    minPrice?: number | null;
    maxPrice?: number | null;
    allowLocalShortcut: boolean;
  },
) {
  const normalizedQuery = normalizeSkuQuery(rawQuery);
  if (!normalizedQuery) return null;
  if (!options.allowLocalShortcut) return null;

  const candidateKeys = Array.from(
    new Set(
      [String(rawQuery || '').trim(), normalizedQuery]
        .map((value) => String(value || '').trim())
        .filter(Boolean),
    ),
  );

  for (const candidate of candidateKeys) {
    try {
      const product = await kv.get(`product:${candidate}`) as any;
      if (!product) continue;
      const exactHit = normalizeExactHitFromCanonical(product);
      const productSku = normalizeSkuQuery(exactHit?.sku || '');
      if (productSku !== normalizedQuery) continue;
      if (Number(exactHit?.status || 0) !== 1) continue;
      if (!matchesExactFilters(exactHit, options)) continue;
      return {
        exactHit: {
          ...exactHit,
          skuMatchType: 'exact',
        },
        facetDistribution: buildSyntheticFacets(exactHit),
        facetStats: buildSyntheticFacetStats(exactHit),
      };
    } catch (error) {
      console.warn(`[search] exact SKU lookup failed for ${candidate}:`, error);
    }
  }

  try {
    const fallback = await meili.search(normalizedQuery, {
      limit: 20,
      offset: 0,
      filter: options.filters,
      facets: [],
    });
    const exactHit = Array.isArray(fallback?.hits)
      ? fallback.hits.find((hit: any) => normalizeSkuQuery(hit?.sku || '') === normalizedQuery)
      : null;
    if (exactHit) {
      const normalizedHit = applyResolvedMedia(exactHit, false);
      return {
        exactHit: {
          ...normalizedHit,
          skuMatchType: 'exact',
        },
        facetDistribution: buildSyntheticFacets(normalizedHit),
        facetStats: buildSyntheticFacetStats(normalizedHit),
      };
    }
  } catch (error) {
    console.warn(`[search] exact SKU Meili fallback failed for ${normalizedQuery}:`, error);
  }

  return null;
}

app.get('/meta', async (c) => {
  try {
    const meta = await kv.get('meili:sync:meta');
    return c.json(meta || EMPTY_SEARCH_META);
  } catch (_err: any) {
    return c.json(EMPTY_SEARCH_META);
  }
});

app.get('/', async (c) => {
  try {
    const startedAt = Date.now();
    const q = c.req.query('q') || '';
    const limit = parseInt(c.req.query('limit') || '24');
    const offset = parseInt(c.req.query('offset') || '0');
    const mode = c.req.query('mode') || 'instant';
    const normalizedSkuQuery = normalizeSkuQuery(q);
    const skuIntent = isLikelySkuQuery(q);
    
    const sortParam = c.req.query('sort');
    const sort = sortParam ? [sortParam] : undefined;
    const categoryTreeContext = await getCanonicalCategoryTreeContext();
    
    // Filters — status = 1 (apenas ativos) sempre aplicado na busca pública
    const filters: string[] = ['status = 1'];
    
    // ─── Manual Filters from Query Params ────────────────────────────────────
    const manualFilters: Record<string, string[]> = {};

    const inStock = c.req.query('inStock');
    if (inStock === 'true') {
      filters.push('in_stock = true');
      manualFilters.in_stock = ['true'];
    } else if (inStock === 'false') {
      filters.push('in_stock = false');
      manualFilters.in_stock = ['false'];
    }

    const categories = c.req.query('category') || c.req.query('categories');
    const categoryIds = categories ? categories.split(',').map(s => s.trim()).filter(Boolean) : [];
    if (categories) {
      manualFilters.categories = categoryIds;
      if (categoryIds.length === 1) {
        filters.push(`category_ids = "${categoryIds[0]}"`);
      } else if (categoryIds.length > 1) {
        filters.push(`category_ids IN [${categoryIds.map(id => `"${id}"`).join(',')}]`);
      }
    }

    const categoryNames = c.req.query('category_name') || c.req.query('category_names');
    const rawCategoryNameValues = categoryNames ? categoryNames.split(',').map(s => s.trim()).filter(Boolean) : [];
    const resolvedCategorySelection = resolveCategoryTreeSelections(categoryTreeContext.tree, rawCategoryNameValues);
    const categoryNameValues = resolvedCategorySelection.names.length > 0
      ? resolvedCategorySelection.names
      : rawCategoryNameValues;
    if (categoryNames) {
      manualFilters.category_names = categoryNameValues;
      if (!categoryIds.length && resolvedCategorySelection.ids.length > 0) {
        manualFilters.categories = resolvedCategorySelection.ids;
        if (resolvedCategorySelection.ids.length === 1) {
          filters.push(`category_ids = "${resolvedCategorySelection.ids[0]}"`);
        } else {
          filters.push(`category_ids IN [${resolvedCategorySelection.ids.map(id => `"${id}"`).join(',')}]`);
        }
      } else if (categoryNameValues.length === 1) {
        filters.push(`category_names = "${categoryNameValues[0]}"`);
      } else if (categoryNameValues.length > 1) {
        filters.push(`category_names IN [${categoryNameValues.map(n => `"${n}"`).join(',')}]`);
      }
    }

    const modelos = c.req.query('modelos');
    const rawModeloValues = modelos ? modelos.split(',').map(s => s.trim()).filter(Boolean) : [];
    const legacyModeloSlugValues = resolveLegacyModelFilters(rawModeloValues);

    const modeloSlug = c.req.query('modelo_slug');
    const rawModeloSlugValues = modeloSlug ? modeloSlug.split(',').map(s => s.trim().toLowerCase()).filter(Boolean) : [];
    const modeloSlugValues = uniqueStrings([...rawModeloSlugValues, ...legacyModeloSlugValues]);
    if (modeloSlugValues.length > 0) {
      manualFilters.modelo_slugs = modeloSlugValues;
      if (modeloSlugValues.length === 1) {
        filters.push(`modelo_slugs = "${modeloSlugValues[0]}"`);
      } else {
        filters.push(`modelo_slugs IN [${modeloSlugValues.map(v => `"${v}"`).join(',')}]`);
      }
    }

    const anos = c.req.query('anos');
    const anoValues = anos ? anos.split(',').map(s => s.trim()).filter(Boolean) : [];
    if (anos) {
      manualFilters.anos = anoValues;
      if (anoValues.length === 1) {
        filters.push(`compat_years = "${anoValues[0]}"`);
      } else if (anoValues.length > 1) {
        filters.push(`compat_years IN [${anoValues.map(v => `"${v}"`).join(',')}]`);
      }
    }

    const color = c.req.query('color');
    const colorValues = color ? color.split(',').map(s => s.trim()).filter(Boolean) : [];
    if (color) {
      manualFilters.color = colorValues;
      if (colorValues.length === 1) {
        filters.push(`color = "${colorValues[0]}"`);
      } else if (colorValues.length > 1) {
        filters.push(`color IN [${colorValues.map(v => `"${v}"`).join(',')}]`);
      }
    }

    const minPrice = c.req.query('minPrice');
    const minPriceValue = minPrice ? parseFloat(minPrice) : null;
    if (minPriceValue != null && Number.isFinite(minPriceValue)) filters.push(`price >= ${minPriceValue}`);
    const maxPrice = c.req.query('maxPrice');
    const maxPriceValue = maxPrice ? parseFloat(maxPrice) : null;
    if (maxPriceValue != null && Number.isFinite(maxPriceValue)) filters.push(`price <= ${maxPriceValue}`);

    const rawFilter = c.req.query('filter');
    if (rawFilter) filters.push(rawFilter);

    // ─── AI SEARCH MODE ──────────────────────────────────────────────────────
    let aiExpansion: any = null;
    let appliedAiCategories: string[] = [];

    if (!skuIntent && mode === 'ai' && q.trim().length >= 3) {
      try {
        // 1. Get Meta from KV for grounding
        const meta = await kv.get('meili:sync:meta') || {};
        const context: aiSearch.SearchSchemaContext = {
          allowedModels: Object.values(meta.modelos || {}),
          allowedYears: Object.values(meta.anos || {}),
          allowedCategories: Object.values(meta.categories || {}),
          filterableAttributes: ['category_ids', 'category_names', 'modelo_slugs', 'compat_years', 'color', 'price', 'in_stock'],
        };

        // 2. Expand Query
        const aiResult = await aiSearch.expandQueryToFilters(q, context);
        
        // 3. Inject AI filters IF they don't conflict with manual ones
        // Manual filters always win (Sovereign)
        const applied: Record<string, string[]> = {};
        const conflicts: Record<string, { ai: string[]; manual: string[] }> = {};
        const ignored: string[] = [];

        if (aiResult.confidence >= 0.65) {
          // Categories
          if (aiResult.filters.categories?.length) {
            const manualCats = manualFilters.category_names || manualFilters.categories || [];
            if (manualCats.length > 0) {
              conflicts.categories = { ai: aiResult.filters.categories, manual: manualCats };
            } else {
              const vals = aiResult.filters.categories;
              const resolvedAiSelection = resolveCategoryTreeSelections(categoryTreeContext.tree, vals);
              applied.categories = resolvedAiSelection.names.length > 0 ? resolvedAiSelection.names : vals;
              appliedAiCategories = resolvedAiSelection.names.length > 0 ? resolvedAiSelection.names : vals;
              if (resolvedAiSelection.ids.length === 1) filters.push(`category_ids = "${resolvedAiSelection.ids[0]}"`);
              else if (resolvedAiSelection.ids.length > 1) filters.push(`category_ids IN [${resolvedAiSelection.ids.map(v => `"${v}"`).join(',')}]`);
              else if (vals.length === 1) filters.push(`category_names = "${vals[0]}"`);
              else filters.push(`category_names IN [${vals.map(v => `"${v}"`).join(',')}]`);
            }
          }

          // Modelos
          if (aiResult.filters.modelos?.length) {
            if (manualFilters.modelo_slugs?.length) {
              conflicts.modelos = { ai: aiResult.filters.modelos, manual: manualFilters.modelo_slugs };
            } else {
              const vals = resolveLegacyModelFilters(aiResult.filters.modelos);
              applied.modelo_slugs = vals;
              if (vals.length === 1) filters.push(`modelo_slugs = "${vals[0]}"`);
              else if (vals.length > 1) filters.push(`modelo_slugs IN [${vals.map(v => `"${v}"`).join(',')}]`);
            }
          }

          // Anos
          if (aiResult.filters.anos?.length) {
            if (manualFilters.anos?.length) {
              conflicts.anos = { ai: aiResult.filters.anos, manual: manualFilters.anos };
            } else {
              applied.anos = aiResult.filters.anos;
              const vals = aiResult.filters.anos;
              if (vals.length === 1) filters.push(`compat_years = "${vals[0]}"`);
              else filters.push(`compat_years IN [${vals.map(v => `"${v}"`).join(',')}]`);
            }
          }
        }

        aiExpansion = {
          ...aiResult,
          meta: {
            applied,
            conflicts,
            ignored
          }
        };
      } catch (err) {
        console.warn('[AI Search] Failed to expand query:', err);
      }
    }

    console.log(`[search] q="${q}" filters=${JSON.stringify(filters)} sort=${sortParam || '(none)'} limit=${limit} offset=${offset} skuIntent=${skuIntent}`);

    const selectedCategoryNames = [...categoryNameValues, ...appliedAiCategories];

    if (skuIntent) {
      const exactResult = await findExactSkuHit(q, {
        filters,
        inStock,
        categories: categoryIds,
        categoryNames: categoryNameValues,
        modelos: [],
        modeloSlugs: modeloSlugValues,
        anos: anoValues,
        color: colorValues,
        minPrice: minPriceValue,
        maxPrice: maxPriceValue,
        allowLocalShortcut: !rawFilter,
      });
      if (exactResult?.exactHit) {
        const categoryTree = buildCategoryFilterTree(
          categoryTreeContext.tree,
          exactResult.facetDistribution?.category_ids || {},
          categoryIds,
          selectedCategoryNames,
        );
        const categoryTreeStatus = resolveCategoryTreeStatus(
          categoryTreeContext.status,
          Object.keys(exactResult.facetDistribution?.category_ids || {}).length > 0 ? 'live' : 'cached',
        );
        return c.json({
          engine: 'kv_exact',
          mode,
          query: q,
          originalQuery: q,
          aiExpansion: null,
          hits: [exactResult.exactHit],
          totalHits: 1,
          facetDistribution: exactResult.facetDistribution,
          facetStats: exactResult.facetStats,
          processingTimeMs: Date.now() - startedAt,
          totalTimeMs: Date.now() - startedAt,
          limit,
          offset,
          queryIntent: 'sku_exact',
          exactSkuQuery: normalizedSkuQuery,
          exactSkuMatched: true,
          vehicleFacets: buildVehicleFacetsFromDistribution(exactResult.facetDistribution?.modelo_slugs || {}),
          yearFacets: buildYearFacetsFromDistribution(exactResult.facetDistribution?.compat_years || exactResult.facetDistribution?.anos || {}),
          appliedFilters: {
            q,
            category: categoryIds,
            category_name: categoryNameValues,
            modelo_slug: modeloSlugValues,
            anos: anoValues,
            inStock,
            minPrice: minPriceValue,
            maxPrice: maxPriceValue,
          },
          categoryTree,
          categoryTreeStatus,
          categoryTreeVersion: categoryTreeContext.version,
          catalogVersion: categoryTreeContext.version,
        });
      }
    }

    const result = await meili.search(q, {
      limit,
      offset,
      sort,
      filter: filters,
      facets: ['category_ids', 'category_names', 'modelo_slugs', 'compat_years', 'color', 'in_stock', 'price'] 
    });

    // Normalize Meilisearch response
    const hits = Array.isArray(result?.hits)
      ? result.hits.map((hit: any) => ({
          ...applyResolvedMedia(hit, false),
          ...(skuIntent
            ? {
                skuMatchType: 'similar',
                searchedSku: normalizedSkuQuery,
              }
            : {}),
        }))
      : [];

    const normalized = {
      ...result,
      hits,
      totalHits: result.totalHits ?? result.estimatedTotalHits ?? 0,
      mode,
      aiExpansion,
      queryIntent: skuIntent ? 'sku_similar' : 'general',
      exactSkuQuery: skuIntent ? normalizedSkuQuery : undefined,
      exactSkuMatched: skuIntent ? false : undefined,
      vehicleFacets: buildVehicleFacetsFromDistribution(result.facetDistribution?.modelo_slugs || {}),
      yearFacets: buildYearFacetsFromDistribution(result.facetDistribution?.compat_years || {}),
      appliedFilters: {
        q,
        category: categoryIds,
        category_name: categoryNameValues,
        modelo_slug: modeloSlugValues,
        anos: anoValues,
        inStock,
        minPrice: minPriceValue,
        maxPrice: maxPriceValue,
      },
      totalTimeMs: Date.now() - startedAt,
      catalogVersion: categoryTreeContext.version,
    };

    const categoryTree = buildCategoryFilterTree(
      categoryTreeContext.tree,
      normalized.facetDistribution?.category_ids || {},
      categoryIds,
      selectedCategoryNames,
    );
    const categoryTreeStatus = resolveCategoryTreeStatus(
      categoryTreeContext.status,
      Object.keys(normalized.facetDistribution?.category_ids || {}).length > 0 ? 'live' : 'cached',
    );

    return c.json({
      ...normalized,
      categoryTree,
      categoryTreeStatus,
      categoryTreeVersion: categoryTreeContext.version,
    });
  } catch (err: any) {
    console.error('Search API error:', err);
    return c.json({ error: err.message }, 500);
  }
});

export const search = app;
