import React from 'react';
import { SITE_URL } from '../../seo-config';

// ─── Google Search Result Preview ────────────────────────────────────────────
// Shows how a page/product will appear in Google search results

interface GooglePreviewProps {
  title: string;
  url: string;
  description: string;
  className?: string;
}

export function GooglePreview({ title, url, description, className = '' }: GooglePreviewProps) {
  const displayTitle = title.length > 60 ? title.slice(0, 57) + '...' : title;
  const displayDesc = description.length > 155 ? description.slice(0, 152) + '...' : description;
  const displayUrl = `${SITE_URL}${url}`;

  return (
    <div className={`bg-white rounded-lg border border-border p-4 ${className}`}>
      <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wide">Preview do Google</p>
      <div className="space-y-0.5">
        {/* URL line */}
        <div className="flex items-center gap-1.5">
          <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
            <span className="text-[10px] font-bold text-muted-foreground">T</span>
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground truncate">{SITE_URL.replace('https://', '')}</p>
            <p className="text-xs text-muted-foreground/70 truncate">{displayUrl}</p>
          </div>
        </div>
        {/* Title */}
        <h3 className="text-[#1a0dab] text-lg leading-snug cursor-pointer hover:underline font-normal">
          {displayTitle}
        </h3>
        {/* Description */}
        <p className="text-sm text-[#4d5156] leading-relaxed">
          {displayDesc}
        </p>
      </div>
    </div>
  );
}

// ─── Character Counter ───────────────────────────────────────────────────────

interface CharCounterProps {
  value: string;
  min: number;
  max: number;
  label?: string;
}

export function CharCounter({ value, min, max, label }: CharCounterProps) {
  const len = value.length;
  const color = len === 0
    ? 'text-muted-foreground'
    : len >= min && len <= max
      ? 'text-green-600'
      : len > max
        ? 'text-red-500'
        : 'text-yellow-600';

  return (
    <span className={`text-xs ${color}`}>
      {label && <span className="text-muted-foreground">{label}: </span>}
      {len}/{max}
      {len > 0 && len < min && <span> (min {min})</span>}
      {len > max && <span> (excedido)</span>}
    </span>
  );
}
