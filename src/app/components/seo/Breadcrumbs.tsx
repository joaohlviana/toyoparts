import React from 'react';
import { Link } from 'react-router';
import { ChevronRight, Home } from 'lucide-react';
import { generateBreadcrumbJsonLd } from '../../seo-config';

// ─── SEO Breadcrumbs ─────────────────────────────────────────────────────────
// Renders breadcrumbs with JSON-LD structured data

export interface BreadcrumbItem {
  label: string;
  href: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
}

export function Breadcrumbs({ items, className = '' }: BreadcrumbsProps) {
  const allItems = [{ label: 'Inicio', href: '/' }, ...items];
  const jsonLd = generateBreadcrumbJsonLd(
    allItems.map(i => ({ name: i.label, url: i.href }))
  );

  return (
    <div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <nav aria-label="Breadcrumb" className={`flex items-center text-sm text-muted-foreground ${className}`}>
        {allItems.map((item, idx) => {
          const isLast = idx === allItems.length - 1;
          return (
            <span key={item.href} className="contents">
              {idx === 0 ? (
                <Link
                  to={item.href}
                  className="flex items-center gap-1 hover:text-foreground transition-colors"
                >
                  <Home className="w-3.5 h-3.5" />
                  <span className="sr-only">{item.label}</span>
                </Link>
              ) : isLast ? (
                <span className="text-foreground font-medium truncate max-w-[200px]">
                  {item.label}
                </span>
              ) : (
                <Link
                  to={item.href}
                  className="hover:text-foreground transition-colors truncate max-w-[160px]"
                >
                  {item.label}
                </Link>
              )}
              {!isLast && (
                <ChevronRight className="w-3.5 h-3.5 mx-1.5 flex-shrink-0 text-muted-foreground/50" />
              )}
            </span>
          );
        })}
      </nav>
    </div>
  );
}