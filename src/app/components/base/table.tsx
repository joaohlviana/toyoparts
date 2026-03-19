import React from 'react';
import { cn } from '../ui/utils';

// ─── Untitled UI Table (Compound) ────────────────────────────────────────────
// Uses design tokens: --border, --muted, --foreground, --muted-foreground

const Root = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => (
    <div 
      className={cn("w-full overflow-hidden border border-border rounded-xl bg-card shadow-xs", className)} 
      ref={ref} 
      {...props}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          {children}
        </table>
      </div>
    </div>
  )
);
Root.displayName = "Table.Root";

const Header = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <thead ref={ref} className={cn("bg-secondary border-b border-border", className)} {...props} />
  )
);
Header.displayName = "Table.Header";

const Body = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tbody ref={ref} className={cn("divide-y divide-border/50 bg-card", className)} {...props} />
  )
);
Body.displayName = "Table.Body";

const Row = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr ref={ref} className={cn("transition-colors hover:bg-secondary/50 group", className)} {...props} />
  )
);
Row.displayName = "Table.Row";

const HeaderCell = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <th 
      ref={ref} 
      className={cn(
        "px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap", 
        className
      )} 
      {...props} 
    />
  )
);
HeaderCell.displayName = "Table.HeaderCell";

const Cell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <td 
      ref={ref} 
      className={cn("px-6 py-4 text-sm text-foreground whitespace-nowrap", className)} 
      {...props} 
    />
  )
);
Cell.displayName = "Table.Cell";

export const Table = {
  Root,
  Header,
  Body,
  Row,
  HeaderCell,
  Cell,
};
