// ─── Modelo Search Wrapper ───────────────────────────────────────────────────
// Converts /pecas/:modelo/:categoriaSlug -> SearchPage with modelo + query filters.

import React from 'react';
import { useParams } from 'react-router';
import { SearchPage } from '../../pages/SearchPage';
import { SearchPageWrapper } from './SearchPageWrapper';
import { getModelBySlug } from '../../seo-config';

export function ModeloSearchWrapper() {
  const { modelo, categoriaSlug } = useParams<{ modelo: string; categoriaSlug?: string }>();
  const modelData = getModelBySlug(modelo || '');

  // If model not found, fall back to regular SearchPage
  if (!modelData) {
    return <SearchPageWrapper />;
  }

  // Use the first modeloId (e.g. "Hilux", "Corolla") as the facet value
  const modeloId = modelData.modeloIds[0];

  // Convert department slug to a human-readable search query
  // e.g. "acessorios-externos" -> "acessorios externos"
  const deptQuery = categoriaSlug ? categoriaSlug.replace(/-/g, ' ') : '';

  return (
    <SearchPage
      key={`modelo-${modelo}-${categoriaSlug || 'all'}`}
      initialQuery={deptQuery || null}
      initialModelo={modeloId}
    />
  );
}
