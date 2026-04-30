import {
  CANONICAL_VEHICLE_MODELS,
  getCanonicalVehicleModelBySlug,
  normalizeVehicleValue,
  resolveCanonicalVehicleSlugs,
} from './canonical-vehicle-models.ts';

export type CompatibilitySourceType = 'manual' | 'legacy_text' | 'toyota' | 'migrated';

export interface ProductCompatibilityEntry {
  model_slug: string;
  model_id: string;
  model_label: string;
  year_ids: string[];
  year_labels: string[];
  version_ids: string[];
  version_labels: string[];
  raw_source: string;
  source_type: CompatibilitySourceType;
  confidence: number;
}

export interface ProductCompatibilitySummary {
  models: string[];
  years: string[];
  versions: string[];
}

export interface CompatibilityMetaContext {
  modelIdToLabel?: Record<string, string> | Map<string, string> | null;
  yearIdToLabel?: Record<string, string> | Map<string, string> | null;
  versionIdToLabel?: Record<string, string> | Map<string, string> | null;
}

export interface ProductCompatibilityResolution {
  entries: ProductCompatibilityEntry[];
  summary: ProductCompatibilitySummary;
  reviewRequired: boolean;
  auditBucket: 'ok_structured' | 'legacy_only' | 'toyota_only' | 'ambiguous' | 'empty';
  compatibilityDisplay: string[];
  compatibilityLegacyText: string;
  compatModels: Array<{
    codigo: string;
    modelo: string;
    motor: string;
    trim: string;
    cambio: string;
    anos: string[];
  }>;
  modelLabels: string[];
  yearLabels: string[];
  versionLabels: string[];
  modelSlugs: string[];
  compatYears: string[];
  compatVersions: string[];
  legacyFields: {
    modelo: string[];
    ano: string[];
    versao: string[];
    compatibilidade: string;
  };
}

type LabelRecord = Record<string, string>;

function mapLikeToRecord(value: CompatibilityMetaContext[keyof CompatibilityMetaContext]): LabelRecord {
  if (!value) return {};
  if (value instanceof Map) return Object.fromEntries(value.entries());
  if (typeof value === 'object') return { ...value };
  return {};
}

function uniqueStrings(values: Array<string | null | undefined>) {
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

function toCsvList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return uniqueStrings(value.map((item) => String(item ?? '').trim()));
  }
  return uniqueStrings(
    String(value ?? '')
      .split(',')
      .map((item) => item.trim()),
  );
}

function toTextLines(value: unknown): string[] {
  return uniqueStrings(
    String(value ?? '')
      .replace(/\r/g, '\n')
      .split(/\n|;/g)
      .map((item) => item.trim()),
  );
}

function extractYearLabelsFromText(value: unknown): string[] {
  const source = String(value ?? '');
  if (!source) return [];

  const years = new Set<string>();
  const rangePattern = /\b((?:19|20)\d{2})\s*(?:-|\/|\ba\b|\bà\b|\bate\b|\baté\b)\s*((?:19|20)\d{2})\b/gi;
  let match: RegExpExecArray | null = null;

  while ((match = rangePattern.exec(source)) !== null) {
    const start = Number(match[1]);
    const end = Number(match[2]);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start || end - start > 20) continue;
    for (let year = start; year <= end; year += 1) {
      years.add(String(year));
    }
  }

  const singleYears = source.match(/\b(?:19|20)\d{2}\b/g) || [];
  for (const year of singleYears) years.add(year);

  return Array.from(years).sort();
}

function buildModelYearConstraints(entries: ProductCompatibilityEntry[]) {
  const constraints = new Map<string, { years: Set<string>; versions: Set<string> }>();

  for (const entry of entries) {
    const key = entry.model_slug || entry.model_id || entry.model_label;
    if (!key) continue;
    const current = constraints.get(key) || { years: new Set<string>(), versions: new Set<string>() };
    for (const year of entry.year_labels) current.years.add(year);
    for (const version of entry.version_labels) current.versions.add(version);
    constraints.set(key, current);
  }

  return constraints;
}

function constrainEntriesByModelText(
  entries: ProductCompatibilityEntry[],
  constraints: Map<string, { years: Set<string>; versions: Set<string> }>,
  meta: CompatibilityMetaContext,
) {
  return entries.map((entry) => {
    const key = entry.model_slug || entry.model_id || entry.model_label;
    const constraint = constraints.get(key);
    if (!constraint) return entry;

    const constrainedYears = entry.year_labels.filter((year) => constraint.years.has(year));
    const nextYearLabels = constrainedYears.length > 0 ? constrainedYears : entry.year_labels;
    const nextYearIds = constrainedYears.length > 0
      ? resolveYearIdsFromLabels(nextYearLabels, meta)
      : entry.year_ids;

    const nextVersionLabels = entry.version_labels.length > 0
      ? entry.version_labels
      : uniqueStrings(Array.from(constraint.versions));
    const nextVersionIds = nextVersionLabels.length > 0
      ? resolveVersionIdsFromLabels(nextVersionLabels, meta)
      : entry.version_ids;

    return {
      ...entry,
      year_labels: nextYearLabels,
      year_ids: nextYearIds,
      version_labels: nextVersionLabels,
      version_ids: nextVersionIds,
    };
  });
}

function detectVersionLabelsFromText(value: unknown): string[] {
  const source = String(value ?? '').trim();
  if (!source) return [];

  const explicitMatch = source.match(/=\s*([^:]+?)(?::|$)/);
  if (explicitMatch?.[1]) {
    return uniqueStrings(
      explicitMatch[1]
        .split(',')
        .map((item) => item.trim()),
    );
  }

  return [];
}

function resolveMetaModelEntries(meta: CompatibilityMetaContext) {
  const modelIdToLabel = mapLikeToRecord(meta.modelIdToLabel);
  return Object.entries(modelIdToLabel)
    .map(([id, label]) => {
      const canonicalSlug = resolveCanonicalVehicleSlugs([label])[0] || '';
      return {
        id: String(id),
        label: String(label || '').trim(),
        normalizedLabel: normalizeVehicleValue(label),
        canonicalSlug,
      };
    })
    .filter((entry) => entry.label);
}

function resolveModelFromToken(
  token: unknown,
  meta: CompatibilityMetaContext,
): { model_slug: string; model_id: string; model_label: string } | null {
  const raw = String(token ?? '').trim();
  if (!raw) return null;

  const normalized = normalizeVehicleValue(raw);
  if (!normalized) return null;

  const metaModels = resolveMetaModelEntries(meta);
  const directById = metaModels.find((entry) => entry.id === raw);
  if (directById) {
    return {
      model_slug: directById.canonicalSlug,
      model_id: directById.id,
      model_label: directById.label,
    };
  }

  const directByLabel = metaModels.find((entry) => entry.normalizedLabel === normalized);
  if (directByLabel) {
    return {
      model_slug: directByLabel.canonicalSlug,
      model_id: directByLabel.id,
      model_label: directByLabel.label,
    };
  }

  const canonicalSlug = resolveCanonicalVehicleSlugs([raw])[0] || '';
  if (canonicalSlug) {
    const canonicalModel = getCanonicalVehicleModelBySlug(canonicalSlug);
    const matchedMeta = metaModels.find((entry) => entry.canonicalSlug === canonicalSlug);
    return {
      model_slug: canonicalSlug,
      model_id: matchedMeta?.id || '',
      model_label: matchedMeta?.label || canonicalModel?.displayName || raw,
    };
  }

  return {
    model_slug: '',
    model_id: '',
    model_label: raw,
  };
}

function detectModelsFromText(
  value: unknown,
  meta: CompatibilityMetaContext,
): Array<{ model_slug: string; model_id: string; model_label: string }> {
  const source = String(value ?? '').trim();
  if (!source) return [];
  const normalizedSource = normalizeVehicleValue(source);
  if (!normalizedSource) return [];

  const found = new Map<string, { model_slug: string; model_id: string; model_label: string }>();
  const metaModels = resolveMetaModelEntries(meta);

  for (const metaModel of metaModels) {
    if (!metaModel.normalizedLabel) continue;
    if (normalizedSource.includes(metaModel.normalizedLabel)) {
      const key = metaModel.canonicalSlug || metaModel.id || metaModel.label;
      found.set(key, {
        model_slug: metaModel.canonicalSlug,
        model_id: metaModel.id,
        model_label: metaModel.label,
      });
    }
  }

  for (const model of CANONICAL_VEHICLE_MODELS) {
    const aliases = [model.displayName, ...model.aliases].map((item) => normalizeVehicleValue(item));
    if (aliases.some((alias) => alias && normalizedSource.includes(alias))) {
      const matchedMeta = metaModels.find((entry) => entry.canonicalSlug === model.slug);
      found.set(model.slug, {
        model_slug: model.slug,
        model_id: matchedMeta?.id || '',
        model_label: matchedMeta?.label || model.displayName,
      });
    }
  }

  return Array.from(found.values());
}

function resolveYearLabelsFromIds(yearIds: string[], meta: CompatibilityMetaContext) {
  const yearIdToLabel = mapLikeToRecord(meta.yearIdToLabel);
  return uniqueStrings(
    yearIds.map((yearId) => yearIdToLabel[yearId] || yearId),
  );
}

function resolveYearIdsFromLabels(yearLabels: string[], meta: CompatibilityMetaContext) {
  const yearIdToLabel = mapLikeToRecord(meta.yearIdToLabel);
  const entries = Object.entries(yearIdToLabel);
  return uniqueStrings(
    yearLabels.map((label) => {
      const normalized = String(label || '').trim();
      if (!normalized) return '';
      const found = entries.find(([, candidate]) => String(candidate || '').trim() === normalized);
      return found?.[0] || '';
    }),
  );
}

function resolveVersionLabelsFromIds(versionIds: string[], meta: CompatibilityMetaContext) {
  const versionIdToLabel = mapLikeToRecord(meta.versionIdToLabel);
  return uniqueStrings(
    versionIds.map((versionId) => versionIdToLabel[versionId] || ''),
  );
}

function resolveVersionIdsFromLabels(versionLabels: string[], meta: CompatibilityMetaContext) {
  const versionIdToLabel = mapLikeToRecord(meta.versionIdToLabel);
  const entries = Object.entries(versionIdToLabel);
  return uniqueStrings(
    versionLabels.map((label) => {
      const normalized = String(label || '').trim();
      if (!normalized) return '';
      const found = entries.find(([, candidate]) => String(candidate || '').trim() === normalized);
      return found?.[0] || '';
    }),
  );
}

function normalizeEntry(
  entry: Partial<ProductCompatibilityEntry>,
  meta: CompatibilityMetaContext,
  fallbackSourceType: CompatibilitySourceType,
  fallbackConfidence: number,
): ProductCompatibilityEntry | null {
  const resolvedModel = resolveModelFromToken(entry.model_id || entry.model_label || entry.model_slug, meta);
  const modelSlug = String(entry.model_slug || resolvedModel?.model_slug || '').trim();
  const modelId = String(entry.model_id || resolvedModel?.model_id || '').trim();
  const modelLabel = String(entry.model_label || resolvedModel?.model_label || '').trim();

  const yearIds = uniqueStrings(toCsvList(entry.year_ids));
  const yearLabels = uniqueStrings([
    ...toCsvList(entry.year_labels),
    ...resolveYearLabelsFromIds(yearIds, meta),
  ]);
  const normalizedYearIds = yearIds.length > 0 ? yearIds : resolveYearIdsFromLabels(yearLabels, meta);
  const normalizedYearLabels = yearLabels.length > 0 ? yearLabels : resolveYearLabelsFromIds(normalizedYearIds, meta);

  const versionIds = uniqueStrings(toCsvList(entry.version_ids));
  const versionLabels = uniqueStrings([
    ...toCsvList(entry.version_labels),
    ...resolveVersionLabelsFromIds(versionIds, meta),
  ]);
  const normalizedVersionIds = versionIds.length > 0 ? versionIds : resolveVersionIdsFromLabels(versionLabels, meta);
  const normalizedVersionLabels = versionLabels.length > 0 ? versionLabels : resolveVersionLabelsFromIds(normalizedVersionIds, meta);

  if (!modelSlug && !modelId && !modelLabel) return null;

  return {
    model_slug: modelSlug,
    model_id: modelId,
    model_label: modelLabel,
    year_ids: normalizedYearIds,
    year_labels: normalizedYearLabels,
    version_ids: normalizedVersionIds,
    version_labels: normalizedVersionLabels,
    raw_source: String(entry.raw_source || '').trim(),
    source_type: entry.source_type || fallbackSourceType,
    confidence: Math.max(0, Math.min(1, Number(entry.confidence ?? fallbackConfidence) || fallbackConfidence)),
  };
}

function mergeEntries(entries: ProductCompatibilityEntry[]) {
  const grouped = new Map<string, ProductCompatibilityEntry>();

  for (const entry of entries) {
    const key = [
      entry.model_slug || entry.model_id || entry.model_label,
      [...entry.version_labels].sort().join('|'),
      [...entry.version_ids].sort().join('|'),
    ].join('::');

    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, {
        ...entry,
        year_ids: [...entry.year_ids],
        year_labels: [...entry.year_labels],
        version_ids: [...entry.version_ids],
        version_labels: [...entry.version_labels],
      });
      continue;
    }

    existing.model_slug = existing.model_slug || entry.model_slug;
    existing.model_id = existing.model_id || entry.model_id;
    existing.model_label = existing.model_label || entry.model_label;
    existing.year_ids = uniqueStrings([...existing.year_ids, ...entry.year_ids]);
    existing.year_labels = uniqueStrings([...existing.year_labels, ...entry.year_labels]);
    existing.version_ids = uniqueStrings([...existing.version_ids, ...entry.version_ids]);
    existing.version_labels = uniqueStrings([...existing.version_labels, ...entry.version_labels]);
    existing.raw_source = existing.raw_source || entry.raw_source;
    existing.confidence = Math.max(existing.confidence, entry.confidence);
    if (existing.source_type !== 'manual' && entry.source_type === 'manual') {
      existing.source_type = 'manual';
    }
  }

  return Array.from(grouped.values());
}

function buildEntriesFromLegacyModelData(
  legacyModelValues: string[],
  legacyYearValues: string[],
  legacyVersionValues: string[],
  meta: CompatibilityMetaContext,
): ProductCompatibilityEntry[] {
  const yearIds = legacyYearValues.filter((value) => /^\d+$/.test(value));
  const yearLabels = uniqueStrings([
    ...resolveYearLabelsFromIds(yearIds, meta),
    ...legacyYearValues.filter((value) => !/^\d+$/.test(value)),
  ]);
  const normalizedYearIds = yearIds.length > 0 ? yearIds : resolveYearIdsFromLabels(yearLabels, meta);

  const versionIds = legacyVersionValues.filter((value) => /^\d+$/.test(value));
  const versionLabels = uniqueStrings([
    ...resolveVersionLabelsFromIds(versionIds, meta),
    ...legacyVersionValues.filter((value) => !/^\d+$/.test(value)),
  ]);
  const normalizedVersionIds = versionIds.length > 0 ? versionIds : resolveVersionIdsFromLabels(versionLabels, meta);

  return legacyModelValues
    .map((value) => normalizeEntry({
      ...resolveModelFromToken(value, meta),
      year_ids: normalizedYearIds,
      year_labels: yearLabels,
      version_ids: normalizedVersionIds,
      version_labels: versionLabels,
      raw_source: '',
      source_type: 'migrated',
      confidence: 0.82,
    }, meta, 'migrated', 0.82))
    .filter((entry): entry is ProductCompatibilityEntry => !!entry);
}

function buildEntriesFromLegacyText(
  rawText: string,
  meta: CompatibilityMetaContext,
): ProductCompatibilityEntry[] {
  const lines = toTextLines(rawText);
  const result: ProductCompatibilityEntry[] = [];

  for (const line of lines) {
    const segments = uniqueStrings(
      line
        .split('+')
        .map((segment) => segment.trim())
        .filter(Boolean),
    );

    for (const segment of (segments.length > 0 ? segments : [line])) {
      const models = detectModelsFromText(segment, meta);
      const yearLabels = extractYearLabelsFromText(segment);
      const yearIds = resolveYearIdsFromLabels(yearLabels, meta);
      const versionLabels = detectVersionLabelsFromText(segment);
      const versionIds = resolveVersionIdsFromLabels(versionLabels, meta);

      if (models.length === 0) {
        continue;
      }

      for (const model of models) {
        const entry = normalizeEntry({
          ...model,
          year_ids: yearIds,
          year_labels: yearLabels,
          version_ids: versionIds,
          version_labels: versionLabels,
          raw_source: segment,
          source_type: 'legacy_text',
          confidence: 0.6,
        }, meta, 'legacy_text', 0.6);
        if (entry) result.push(entry);
      }
    }
  }

  return result;
}

function buildCompatibilityDisplay(entries: ProductCompatibilityEntry[]) {
  return uniqueStrings(entries.map((entry) => {
    const model = entry.model_label || entry.model_slug || entry.model_id;
    const versions = entry.version_labels.length > 0 ? ` - ${entry.version_labels.join(', ')}` : '';
    const years = entry.year_labels.length > 0 ? ` (${entry.year_labels.join(', ')})` : '';
    return `${model}${versions}${years}`.trim();
  }));
}

function buildAuditBucket(entries: ProductCompatibilityEntry[], reviewRequired: boolean): ProductCompatibilityResolution['auditBucket'] {
  if (entries.length === 0) return 'empty';
  if (reviewRequired) return 'ambiguous';
  if (entries.every((entry) => entry.source_type === 'toyota')) return 'toyota_only';
  if (entries.every((entry) => entry.source_type === 'legacy_text')) return 'legacy_only';
  return 'ok_structured';
}

function getCustomAttributeMap(product: any): Record<string, any> {
  const map: Record<string, any> = {};
  if (Array.isArray(product?.custom_attributes)) {
    for (const attr of product.custom_attributes) {
      if (!attr?.attribute_code) continue;
      map[String(attr.attribute_code)] = attr.value;
    }
  }
  if (product?.custom_attributes_map && typeof product.custom_attributes_map === 'object') {
    Object.assign(map, product.custom_attributes_map);
  }
  return map;
}

export function resolveProductCompatibility(product: any, meta: CompatibilityMetaContext = {}): ProductCompatibilityResolution {
  const customMap = getCustomAttributeMap(product);
  const legacyModelValues = uniqueStrings([
    ...toCsvList(customMap.modelo),
    ...toCsvList(product?.modelo),
    ...toCsvList(product?.modelos),
  ]);
  const legacyYearValues = uniqueStrings([
    ...toCsvList(customMap.ano),
    ...toCsvList(product?.ano),
    ...toCsvList(product?.anos),
  ]);
  const legacyVersionValues = uniqueStrings([
    ...toCsvList(customMap.versao),
    ...toCsvList(product?.versao),
    ...toCsvList(product?.versoes),
  ]);
  const legacyText = [
    String(customMap.compatibilidade || '').trim(),
    String(product?.compatibilidade || '').trim(),
  ].find(Boolean) || '';
  const titleText = uniqueStrings([
    String(product?.name || '').trim(),
    String(product?.short_description || '').trim(),
  ]).join('\n');

  const incomingStructured = Array.isArray(product?.compatibility_entries)
    ? product.compatibility_entries
    : [];
  const hasAuthoritativeStructuredEntries = incomingStructured.some((entry: any) => {
    const sourceType = String(entry?.source_type || '').trim().toLowerCase();
    return sourceType === 'manual' || sourceType === 'toyota';
  });

  const normalizedStructured = hasAuthoritativeStructuredEntries
    ? incomingStructured
        .map((entry: any) => normalizeEntry(entry, meta, 'manual', 1))
        .filter((entry: ProductCompatibilityEntry | null): entry is ProductCompatibilityEntry => !!entry)
    : [];
  const legacyStructured = buildEntriesFromLegacyModelData(legacyModelValues, legacyYearValues, legacyVersionValues, meta);
  const titleStructured = buildEntriesFromLegacyText(titleText, meta);
  const titleConstraints = buildModelYearConstraints(titleStructured);
  const lockedModelKeys = new Set(
    [...normalizedStructured, ...legacyStructured]
      .map((entry) => entry.model_slug || entry.model_id || entry.model_label)
      .filter(Boolean),
  );
  const textStructured = buildEntriesFromLegacyText(legacyText, meta)
    .filter((entry) => {
      if (lockedModelKeys.size === 0) return true;
      const modelKey = entry.model_slug || entry.model_id || entry.model_label;
      return lockedModelKeys.has(modelKey);
    });

  const constrainNonManualEntries = (entries: ProductCompatibilityEntry[]) =>
    entries.map((entry) => {
      if (entry.source_type === 'manual') return entry;
      const constrained = constrainEntriesByModelText([entry], titleConstraints, meta);
      return constrained[0] || entry;
    });

  const constrainedStructured = constrainNonManualEntries(normalizedStructured);
  const constrainedLegacyStructured = constrainNonManualEntries(legacyStructured);
  const constrainedTextStructured = constrainNonManualEntries(textStructured);
  const fallbackTitleStructured = constrainNonManualEntries(titleStructured);

  const authoritativeEntries = constrainedStructured.filter((entry) => {
    const sourceType = String(entry.source_type || '').trim().toLowerCase();
    return sourceType === 'manual' || sourceType === 'toyota';
  });

  const derivedEntries = authoritativeEntries.length > 0
    ? []
    : constrainedLegacyStructured.length > 0 || constrainedTextStructured.length > 0
      ? [...constrainedLegacyStructured, ...constrainedTextStructured]
      : fallbackTitleStructured;

  const entries = mergeEntries([
    ...authoritativeEntries,
    ...derivedEntries,
  ]);

  const compatibilityDisplay = buildCompatibilityDisplay(entries);
  const modelLabels = uniqueStrings(entries.map((entry) => entry.model_label));
  const yearLabels = uniqueStrings(entries.flatMap((entry) => entry.year_labels));
  const versionLabels = uniqueStrings(entries.flatMap((entry) => entry.version_labels));
  const modelSlugs = uniqueStrings(entries.flatMap((entry) => entry.model_slug ? [entry.model_slug] : resolveCanonicalVehicleSlugs([entry.model_label])));
  const compatYears = yearLabels;
  const compatVersions = versionLabels;

  const reviewRequired = entries.some((entry) => {
    if (!entry.model_slug && !entry.model_label) return true;
    if (entry.source_type === 'legacy_text' && entry.year_labels.length === 0) return true;
    return false;
  });

  const summary: ProductCompatibilitySummary = {
    models: modelLabels,
    years: yearLabels,
    versions: versionLabels,
  };

  const compatModels = entries.map((entry) => ({
    codigo: '',
    modelo: entry.model_label || entry.model_slug || entry.model_id,
    motor: '',
    trim: entry.version_labels.join(', '),
    cambio: '',
    anos: entry.year_labels,
  }));

  const compatibilityLegacyText = uniqueStrings([
    ...entries.map((entry) => entry.raw_source),
    ...compatibilityDisplay,
  ]).join('\n');

  const legacyFields = {
    modelo: uniqueStrings(entries.map((entry) => entry.model_id || entry.model_label)),
    ano: uniqueStrings(entries.flatMap((entry) => entry.year_ids.length > 0 ? entry.year_ids : entry.year_labels)),
    versao: uniqueStrings(entries.flatMap((entry) => entry.version_ids.length > 0 ? entry.version_ids : entry.version_labels)),
    compatibilidade: compatibilityLegacyText,
  };

  return {
    entries,
    summary,
    reviewRequired,
    auditBucket: buildAuditBucket(entries, reviewRequired),
    compatibilityDisplay,
    compatibilityLegacyText,
    compatModels,
    modelLabels,
    yearLabels,
    versionLabels,
    modelSlugs,
    compatYears,
    compatVersions,
    legacyFields,
  };
}
