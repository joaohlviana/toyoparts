// ─── SearchPage Wrapper ──────────────────────────────────────────────────────
// Bridges React Router query params to SearchPage's props.

import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router';
import { SearchPage } from '../../pages/SearchPage';

export function SearchPageWrapper() {
  const [searchParams] = useSearchParams();
  const [clearedQuery, setClearedQuery] = useState(false);
  const [clearedFilters, setClearedFilters] = useState(false);

  // Reset cleared states when URL params change (e.g. MegaMenu navigation)
  const paramsKey = searchParams.toString();
  const prevParamsRef = useRef(paramsKey);
  useEffect(() => {
    if (prevParamsRef.current !== paramsKey) {
      prevParamsRef.current = paramsKey;
      setClearedQuery(false);
      setClearedFilters(false);
    }
  }, [paramsKey]);

  const q = searchParams.get('q');
  const category = searchParams.get('category');
  const categoryName = searchParams.get('category_name');
  const modelo = searchParams.get('modelos') || searchParams.get('modelo');

  return (
    <SearchPage
      key={paramsKey}
      initialQuery={clearedQuery ? null : q}
      onClearInitialQuery={() => setClearedQuery(true)}
      initialCategory={clearedFilters ? null : category}
      initialCategoryName={clearedFilters ? null : categoryName}
      initialModelo={clearedFilters ? null : modelo}
      onClearInitialFilters={() => setClearedFilters(true)}
    />
  );
}
