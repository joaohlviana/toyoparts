import React from 'react';
import { useSearchParams } from 'react-router';
import { SearchPage } from '../../pages/SearchPage';
import { getModelById } from '../../seo-config';

export function SearchPageWrapper() {
  const [searchParams] = useSearchParams();
  const paramsKey = searchParams.toString();

  const q = searchParams.get('q');
  const category = searchParams.get('category');
  const categoryName = searchParams.get('category_name');
  const modeloSlug = searchParams.get('modelo_slug');
  const legacyModelo = searchParams.get('modelos') || searchParams.get('modelo');
  const resolvedLegacyModeloSlug = legacyModelo ? getModelById(legacyModelo)?.slug || null : null;

  return (
    <SearchPage
      key={paramsKey}
      initialQuery={q}
      initialCategory={category}
      initialCategoryName={categoryName}
      initialModeloSlug={modeloSlug || resolvedLegacyModeloSlug}
      initialModelo={!modeloSlug && !resolvedLegacyModeloSlug ? legacyModelo : null}
    />
  );
}
