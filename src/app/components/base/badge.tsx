import React from 'react';
import { cn } from '../ui/utils';

// ─── Untitled UI Badge ───────────────────────────────────────────────────────
// Pill and modern variants with semantic colors using design tokens

export type BadgeVariant = 'pill-color' | 'pill-outline' | 'modern' | 'secondary' | 'destructive' | 'outline';
export type BadgeColor = 'gray' | 'brand' | 'error' | 'warning' | 'success';
export type BadgeSize = 'xs' | 'sm' | 'md' | 'lg';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  color?: BadgeColor;
  size?: BadgeSize;
  dot?: boolean;
}

const PILL_COLORS: Record<BadgeColor, string> = {
  gray:    "bg-secondary text-muted-foreground ring-1 ring-inset ring-border",
  brand:   "bg-primary/10 text-primary ring-1 ring-inset ring-primary/20",
  error:   "bg-destructive/10 text-destructive ring-1 ring-inset ring-destructive/20",
  warning: "bg-warning/10 text-warning ring-1 ring-inset ring-warning/20",
  success: "bg-success/10 text-success ring-1 ring-inset ring-success/20",
};

const OUTLINE_COLORS: Record<BadgeColor, string> = {
  gray:    "bg-transparent text-muted-foreground ring-1 ring-inset ring-border",
  brand:   "bg-transparent text-primary ring-1 ring-inset ring-primary/30",
  error:   "bg-transparent text-destructive ring-1 ring-inset ring-destructive/30",
  warning: "bg-transparent text-warning ring-1 ring-inset ring-warning/30",
  success: "bg-transparent text-success ring-1 ring-inset ring-success/30",
};

const MODERN_COLORS: Record<BadgeColor, string> = {
  gray:    "bg-muted text-muted-foreground",
  brand:   "bg-primary/10 text-primary",
  error:   "bg-destructive/10 text-destructive",
  warning: "bg-warning/10 text-warning",
  success: "bg-success/10 text-success",
};

// Mappings for shadcn/ui variants to prevent crashes
const SECONDARY_COLORS: Record<BadgeColor, string> = {
  gray:    "bg-secondary text-secondary-foreground border-transparent",
  brand:   "bg-secondary text-secondary-foreground border-transparent",
  error:   "bg-secondary text-secondary-foreground border-transparent",
  warning: "bg-secondary text-secondary-foreground border-transparent",
  success: "bg-secondary text-secondary-foreground border-transparent",
};

const DESTRUCTIVE_COLORS: Record<BadgeColor, string> = {
  gray:    "bg-destructive text-destructive-foreground border-transparent shadow",
  brand:   "bg-destructive text-destructive-foreground border-transparent shadow",
  error:   "bg-destructive text-destructive-foreground border-transparent shadow",
  warning: "bg-destructive text-destructive-foreground border-transparent shadow",
  success: "bg-destructive text-destructive-foreground border-transparent shadow",
};

const DOT_COLORS: Record<BadgeColor, string> = {
  gray:    "bg-muted-foreground",
  brand:   "bg-primary",
  error:   "bg-destructive",
  warning: "bg-warning",
  success: "bg-success",
};

export function Badge({ 
  className, 
  variant = 'pill-color', 
  color = 'gray', 
  size = 'sm', 
  dot = false,
  children, 
  ...props 
}: BadgeProps) {

  const base = "inline-flex items-center font-medium transition-colors shrink-0 whitespace-nowrap";
  
  const shapes: Record<BadgeVariant, string> = {
    'pill-color': "rounded-full",
    'pill-outline': "rounded-full",
    'modern': "rounded-md",
    'secondary': "rounded-md",
    'destructive': "rounded-md",
    'outline': "rounded-md",
  };

  const colorMap: Record<BadgeVariant, Record<BadgeColor, string>> = {
    'pill-color': PILL_COLORS,
    'pill-outline': OUTLINE_COLORS,
    'modern': MODERN_COLORS,
    'secondary': SECONDARY_COLORS,
    'destructive': DESTRUCTIVE_COLORS,
    'outline': OUTLINE_COLORS,
  };

  const sizes: Record<BadgeSize, string> = {
    xs: "px-1.5 py-0.5 text-[10px] gap-1",
    sm: "px-2 py-0.5 text-xs gap-1.5",
    md: "px-2.5 py-1 text-xs gap-1.5",
    lg: "px-3 py-1.5 text-sm gap-2",
  };

  return (
    <span className={cn(base, shapes[variant], colorMap[variant][color], sizes[size], className)} {...props}>
      {dot && (
        <span className={cn(
          "rounded-full shrink-0",
          size === 'xs' ? 'w-1 h-1' : 'w-1.5 h-1.5',
          DOT_COLORS[color]
        )} />
      )}
      {children}
    </span>
  );
}
