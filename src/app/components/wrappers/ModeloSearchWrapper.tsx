// Converts /pecas/:modelo/:categoriaSlug -> SearchPage with modelo + category filters.

import React from 'react';
import { useMemo } from 'react';
import { useParams } from 'react-router';
import { SearchPage } from '../../pages/SearchPage';
import { NotFoundPage } from '../../pages/NotFoundPage';
import { getModelBySlug } from '../../seo-config';

export function ModeloSearchWrapper() {
  const { modelo, categoriaSlug } = useParams<{ modelo: string; categoriaSlug?: string }>();
  const modelData = getModelBySlug(modelo || '');
  const normalizedCategorySlug = useMemo(() => (categoriaSlug || '').trim().toLowerCase(), [categoriaSlug]);

  if (!modelData) {
    return <NotFoundPage />;
  }

  return (
    <SearchPage
      key={`modelo-${modelo}-${categoriaSlug || 'all'}`}
      initialQuery={null}
      initialCategory={null}
      initialCategoryName={normalizedCategorySlug || null}
      initialModeloSlug={modelData.slug}
    />
  );
}
