export interface CanonicalVehicleModel {
  slug: string;
  displayName: string;
  aliases: string[];
}

export const CANONICAL_VEHICLE_MODELS: CanonicalVehicleModel[] = [
  { slug: 'hilux', displayName: 'Hilux', aliases: ['hilux', 'toyota hilux', '38', '204'] },
  { slug: 'corolla', displayName: 'Corolla', aliases: ['corolla', 'toyota corolla', '35'] },
  {
    slug: 'corolla-cross',
    displayName: 'Corolla Cross',
    aliases: ['corolla cross', 'corolla-cross', 'toyota corolla cross', '5646', '206'],
  },
  { slug: 'yaris', displayName: 'Yaris', aliases: ['yaris', 'toyota yaris', '37', '205'] },
  { slug: 'sw4', displayName: 'SW4', aliases: ['sw4', 'sw 4', 'toyota sw4', '40'] },
  { slug: 'etios', displayName: 'Etios', aliases: ['etios', 'toyota etios', '36', '207'] },
  { slug: 'rav4', displayName: 'RAV4', aliases: ['rav4', 'rav 4', 'rav-4', 'toyota rav4', '39'] },
  { slug: 'prius', displayName: 'Prius', aliases: ['prius', 'toyota prius', '42'] },
];

export function normalizeVehicleValue(value: string | number | null | undefined): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

export function getCanonicalVehicleModelBySlug(slug: string | null | undefined) {
  const normalizedSlug = String(slug || '').trim().toLowerCase();
  if (!normalizedSlug) return undefined;
  return CANONICAL_VEHICLE_MODELS.find((model) => model.slug === normalizedSlug);
}

export function resolveCanonicalVehicleSlugs(values: Array<string | number | null | undefined>) {
  const slugs = new Set<string>();

  for (const value of values) {
    const normalizedValue = normalizeVehicleValue(value);
    if (!normalizedValue) continue;

    const match = CANONICAL_VEHICLE_MODELS.find((model) => {
      if (normalizeVehicleValue(model.displayName) === normalizedValue) return true;
      return model.aliases.some((alias) => normalizeVehicleValue(alias) === normalizedValue);
    });

    if (match) {
      slugs.add(match.slug);
    }
  }

  return Array.from(slugs);
}

export function buildCanonicalVehicleFacetTargets(facetCounts: Record<string, number>) {
  return CANONICAL_VEHICLE_MODELS.map((model) => ({
    ...model,
    productCount: Number(facetCounts[model.slug] || 0),
  })).filter((model) => model.productCount > 0);
}
