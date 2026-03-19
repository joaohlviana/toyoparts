import React from 'react';
import { cn } from '../ui/utils';
import { LucideIcon } from 'lucide-react';

// ─── Untitled UI Input ───────────────────────────────────────────────────────
// Uses design tokens: --input, --border, --ring, --background

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  iconLeading?: LucideIcon;
  iconTrailing?: LucideIcon;
  error?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, iconLeading: IconLeading, iconTrailing: IconTrailing, error, ...props }, ref) => {
    return (
      <div className="relative w-full">
        {IconLeading && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
            <IconLeading className="h-4 w-4" />
          </div>
        )}
        <input
          className={cn(
            "flex h-10 w-full rounded-lg border border-input bg-input-background px-3 py-2 text-sm text-foreground shadow-xs transition-all",
            "file:border-0 file:bg-transparent file:text-sm file:font-medium",
            "placeholder:text-muted-foreground",
            "focus:outline-none focus:ring-4 focus:ring-ring/10 focus:border-ring",
            "disabled:cursor-not-allowed disabled:opacity-50",
            IconLeading && "pl-10",
            IconTrailing && "pr-10",
            error && "border-destructive focus:border-destructive focus:ring-destructive/10",
            className
          )}
          ref={ref}
          {...props}
        />
        {IconTrailing && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
            <IconTrailing className="h-4 w-4" />
          </div>
        )}
      </div>
    );
  }
);
Input.displayName = "Input";

export { Input };
