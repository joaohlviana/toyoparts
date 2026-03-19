import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../ui/utils';

// ─── Untitled UI Button ──────────────────────────────────────────────────────
// Uses design tokens from theme.css (--primary, --destructive, etc.)

export type ButtonColor = 'primary' | 'secondary' | 'tertiary' | 'error';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  color?: ButtonColor;
  size?: ButtonSize;
  iconLeading?: React.ReactNode;
  iconTrailing?: React.ReactNode;
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, color = 'primary', size = 'md', iconLeading, iconTrailing, isLoading, children, disabled, ...props }, ref) => {
    
    const base = "inline-flex items-center justify-center font-semibold transition-all duration-150 focus-visible:outline-none focus:ring-4 disabled:opacity-50 disabled:pointer-events-none rounded-lg cursor-pointer";
    
    const colors: Record<ButtonColor, string> = {
      primary: "bg-primary text-primary-foreground hover:bg-primary/90 focus:ring-primary/20 shadow-xs border border-primary",
      secondary: "bg-white text-foreground border border-border hover:bg-secondary focus:ring-border/30 shadow-xs",
      tertiary: "text-muted-foreground hover:bg-secondary hover:text-foreground border border-transparent focus:ring-border/20",
      error: "bg-destructive text-destructive-foreground hover:bg-destructive/90 focus:ring-destructive/20 shadow-xs border border-destructive",
    };

    const sizes: Record<ButtonSize, string> = {
      xs: "px-2.5 py-1.5 text-xs gap-1",
      sm: "px-3 py-2 text-sm gap-1.5",
      md: "px-4 py-2.5 text-sm gap-2",
      lg: "px-5 py-3 text-base gap-2.5",
    };

    return (
      <button
        ref={ref}
        className={cn(base, colors[color], sizes[size], className)}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
        {!isLoading && iconLeading && <span className="shrink-0 flex items-center">{iconLeading}</span>}
        {children && <span className="truncate">{children}</span>}
        {!isLoading && iconTrailing && <span className="shrink-0 flex items-center">{iconTrailing}</span>}
      </button>
    );
  }
);

Button.displayName = "Button";
