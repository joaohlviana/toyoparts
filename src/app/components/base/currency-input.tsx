import React from 'react';
import { NumericFormat, NumericFormatProps } from 'react-number-format';
import { cn } from '../ui/utils';

interface CurrencyInputProps extends Omit<NumericFormatProps, 'onChange'> {
  label?: string;
  error?: string;
  onChange?: (value: number | null) => void;
  containerClassName?: string;
}

export function CurrencyInput({ 
  label, 
  error, 
  onChange, 
  className, 
  containerClassName,
  value,
  ...props 
}: CurrencyInputProps) {
  return (
    <div className={cn("space-y-1.5 flex-1", containerClassName)}>
      {label && (
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {label}
        </label>
      )}
      <div className="relative group">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium pointer-events-none group-focus-within:text-primary transition-colors">
          R$
        </span>
        <NumericFormat
          value={value}
          onValueChange={(values) => {
            onChange?.(values.floatValue ?? null);
          }}
          thousandSeparator="."
          decimalSeparator=","
          decimalScale={2}
          fixedDecimalScale
          allowNegative={false}
          className={cn(
            "flex h-10 w-full rounded-lg border border-input bg-input-background pl-9 pr-3 py-2 text-sm text-foreground shadow-xs transition-all",
            "placeholder:text-muted-foreground",
            "focus:outline-none focus:ring-4 focus:ring-ring/10 focus:border-ring",
            "disabled:cursor-not-allowed disabled:opacity-50",
            error && "border-destructive focus:border-destructive focus:ring-destructive/10",
            className
          )}
          placeholder="0,00"
          {...props}
        />
      </div>
      {error && <p className="text-[10px] text-destructive font-medium">{error}</p>}
    </div>
  );
}
