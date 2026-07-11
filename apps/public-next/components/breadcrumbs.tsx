import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

export interface Crumb {
  href?: string;
  label: string;
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      {items.map((item, index) => {
        const last = index === items.length - 1;
        return (
          <div key={`${item.label}-${index}`} className="flex items-center gap-2">
            {item.href && !last ? (
              <Link href={item.href} className="transition-colors hover:text-foreground">
                {item.label}
              </Link>
            ) : (
              <span className={last ? 'font-semibold text-foreground' : ''}>{item.label}</span>
            )}
            {!last ? <ChevronRight className="h-3 w-3" /> : null}
          </div>
        );
      })}
    </nav>
  );
}
