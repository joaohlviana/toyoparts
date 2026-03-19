// ═══════════════════════════════════════════════════════════════════════════════
// TrendingSearches — UX Activation Component
// ═══════════════════════════════════════════════════════════════════════════════
// Shows trending/popular search terms based on real user behavior.
// Use cases:
//   - Below search bar on homepage/search page
//   - Zero-result fallback suggestions
//   - Search overlay suggestions
//
// Data source: /si/intelligence/trending (cached 2min server-side)
// Strategy:
//   1. Behavioral analytics (trending terms from real searches)
//   2. Fallback: hardcoded popular terms for cold-start

import React, { useEffect, useState } from 'react';
import { TrendingUp, Search, Loader2 } from 'lucide-react';
import { siActivation } from '../lib/search-intelligence-api';

interface TrendingSearchesProps {
  /** Called when user clicks a trending term */
  onSelect: (term: string) => void;
  /** Max number of terms to show */
  limit?: number;
  /** Visual variant */
  variant?: 'chips' | 'list' | 'inline';
  /** Optional title override */
  title?: string;
  /** Show as zero-result fallback (changes messaging) */
  isZeroResultFallback?: boolean;
  /** Additional class */
  className?: string;
}

// Cold-start terms (used when no analytics data yet)
const COLD_START_TERMS = [
  'amortecedor hilux',
  'pastilha freio corolla',
  'filtro oleo',
  'farol sw4',
  'correia dentada',
  'embreagem etios',
  'radiador rav4',
  'vela ignicao',
];

export function TrendingSearches({
  onSelect,
  limit = 8,
  variant = 'chips',
  title,
  isZeroResultFallback = false,
  className = '',
}: TrendingSearchesProps) {
  const [terms, setTerms] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await siActivation.getTrending(limit);
        if (!cancelled && data?.trending?.length > 0) {
          setTerms(data.trending.map((t: any) => t.term));
        } else if (!cancelled) {
          // Fallback to cold-start terms
          setTerms(COLD_START_TERMS.slice(0, limit));
        }
      } catch {
        if (!cancelled) setTerms(COLD_START_TERMS.slice(0, limit));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [limit]);

  if (loading) {
    return null; // Don't show loading state for this component — it's supplementary
  }

  if (terms.length === 0) return null;

  const displayTitle = title || (isZeroResultFallback
    ? 'Termos populares que podem ajudar:'
    : 'Buscas populares');

  // ─── Chips variant ────────────────────────────────────────────────────
  if (variant === 'chips') {
    return (
      <div className={`space-y-2.5 ${className}`}>
        <div className="flex items-center gap-1.5">
          <TrendingUp className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">{displayTitle}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {terms.map(term => (
            <button
              key={term}
              onClick={() => onSelect(term)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium
                bg-muted/60 text-muted-foreground hover:bg-primary/10 hover:text-primary
                border border-transparent hover:border-primary/20
                transition-all duration-200 cursor-pointer"
            >
              <Search className="w-3 h-3 opacity-50" />
              {term}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ─── List variant ─────────────────────────────────────────────────────
  if (variant === 'list') {
    return (
      <div className={`space-y-1.5 ${className}`}>
        <div className="flex items-center gap-1.5 mb-2">
          <TrendingUp className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{displayTitle}</span>
        </div>
        {terms.map((term, i) => (
          <button
            key={term}
            onClick={() => onSelect(term)}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left
              hover:bg-muted/60 transition-colors cursor-pointer group"
          >
            <span className="text-[10px] text-muted-foreground font-mono w-4">{i + 1}</span>
            <Search className="w-3.5 h-3.5 text-muted-foreground/50 group-hover:text-primary transition-colors" />
            <span className="text-sm text-foreground group-hover:text-primary transition-colors">{term}</span>
          </button>
        ))}
      </div>
    );
  }

  // ─── Inline variant ───────────────────────────────────────────────────
  return (
    <div className={`flex items-center gap-2 flex-wrap ${className}`}>
      <span className="text-xs text-muted-foreground flex items-center gap-1">
        <TrendingUp className="w-3 h-3" /> {displayTitle}
      </span>
      {terms.map((term, i) => (
        <React.Fragment key={term}>
          {i > 0 && <span className="text-muted-foreground/30">·</span>}
          <button
            onClick={() => onSelect(term)}
            className="text-xs text-muted-foreground hover:text-primary hover:underline transition-colors cursor-pointer"
          >
            {term}
          </button>
        </React.Fragment>
      ))}
    </div>
  );
}
