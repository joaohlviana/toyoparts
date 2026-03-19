import React, { useMemo, useState, useRef, useEffect } from 'react';
import {
  Plus, Search, ChevronDown, Check, X
} from 'lucide-react';
import { cn } from '../ui/utils';

import {
  FilterNode, FilterGroup as IFilterGroup, FilterRule as IFilterRule,
  FilterOperator, FilterFieldConfig, OPERATOR_LABELS
} from './types';
import { createRule, updateNode, removeNode } from './utils';
import { PRODUCT_FILTER_FIELDS } from './config';
import { NO_CATEGORY_SENTINEL } from './utils';

// ─── Inline Dropdown ─────────────────────────────────────────────────────────

interface InlineDropdownProps {
  value: string;
  options: { label: string; value: string }[];
  onChange: (value: string) => void;
  className?: string;
  triggerClassName?: string;
  placeholder?: string;
}

function InlineDropdown({ value, options, onChange, className, triggerClassName, placeholder }: InlineDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selectedLabel = options.find(o => o.value === value)?.label || placeholder || 'Selecione...';

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-input bg-input-background shadow-xs",
          "hover:bg-secondary transition-colors cursor-pointer select-none whitespace-nowrap",
          triggerClassName
        )}
      >
        <span className="truncate max-w-[160px]">{selectedLabel}</span>
        <ChevronDown className={cn("w-3 h-3 text-muted-foreground shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 min-w-[180px] bg-popover border border-border rounded-xl shadow-lg py-1 max-h-[240px] overflow-y-auto">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={cn(
                "w-full text-left px-3 py-1.5 text-xs hover:bg-secondary transition-colors flex items-center gap-2",
                opt.value === value && "bg-secondary font-medium text-foreground"
              )}
            >
              {opt.value === value && <Check className="w-3 h-3 text-foreground shrink-0" />}
              <span className={opt.value !== value ? "pl-5" : ""}>{opt.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Multi-Select Popover ────────────────────────────────────────────────────

interface MultiSelectPopoverProps {
  selected: string[];
  options: { label: string; value: string | number; count?: number }[];
  onChange: (value: string[]) => void;
  placeholder?: string;
}

function MultiSelectPopover({ selected, options, onChange, placeholder }: MultiSelectPopoverProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  const filteredOptions = useMemo(() => {
    if (!search.trim()) return options;
    const s = search.toLowerCase();
    return options.filter(o => String(o.label).toLowerCase().includes(s));
  }, [options, search]);

  const toggleItem = (val: string) => {
    const next = selected.includes(val)
      ? selected.filter(v => v !== val)
      : [...selected, val];
    onChange(next);
  };

  const clearAll = () => onChange([]);

  return (
    <div ref={ref} className="relative flex-1 min-w-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "w-full flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-lg border border-input bg-input-background shadow-xs",
          "hover:bg-secondary transition-colors cursor-pointer text-left h-8"
        )}
      >
        {selected.length === 0 ? (
          <span className="text-muted-foreground">{placeholder || 'Selecione...'}</span>
        ) : (
          <span className="flex items-center gap-1.5 min-w-0">
            <span className="inline-flex items-center justify-center w-4 h-4 text-[10px] font-semibold bg-muted text-muted-foreground rounded">
              {selected.length}
            </span>
            <span className="truncate text-foreground text-xs">
              {selected.length === 1
                ? options.find(o => String(o.value) === selected[0])?.label || selected[0]
                : `${selected.length} selecionados`
              }
            </span>
          </span>
        )}
        <ChevronDown className={cn("w-3 h-3 text-muted-foreground shrink-0 ml-auto transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 w-[300px] bg-popover border border-border rounded-xl shadow-lg overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-input-background border border-input rounded-lg shadow-xs focus:outline-none focus:ring-4 focus:ring-ring/10 focus:border-ring"
              />
            </div>
          </div>

          {/* Selected Summary */}
          {selected.length > 0 && (
            <div className="px-3 py-1.5 border-b border-border bg-secondary/50 flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">
                {selected.length} selecionado{selected.length > 1 ? 's' : ''}
              </span>
              <button
                type="button"
                onClick={clearAll}
                className="text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Limpar
              </button>
            </div>
          )}

          {/* Options List */}
          <div className="max-h-[220px] overflow-y-auto py-1">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                Nenhum resultado
              </div>
            ) : (
              filteredOptions.map((opt) => {
                const val = String(opt.value);
                const isSelected = selected.includes(val);
                return (
                  <button
                    key={val}
                    type="button"
                    onClick={() => toggleItem(val)}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-3 py-1.5 text-xs hover:bg-secondary transition-colors text-left",
                      isSelected && "bg-secondary/70"
                    )}
                  >
                    <div className={cn(
                      "w-3.5 h-3.5 rounded-[4px] border flex items-center justify-center shrink-0 transition-colors shadow-xs",
                      isSelected
                        ? "bg-primary border-primary"
                        : "border-input bg-input-background"
                    )}>
                      {isSelected && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                    </div>
                    <span className={cn("flex-1 truncate text-foreground", isSelected && "font-medium")}>
                      {opt.label}
                    </span>
                    {opt.count !== undefined && (
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        {opt.count.toLocaleString()}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Footer */}
          {options.length > 10 && (
            <div className="px-3 py-1.5 border-t border-border bg-secondary/30">
              <span className="text-[10px] text-muted-foreground">
                {filteredOptions.length} de {options.length}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Smart Filter Rule ───────────────────────────────────────────────────────

interface FilterRuleProps {
  node: IFilterRule;
  index: number;
  onUpdate: (updater: (n: FilterNode) => FilterNode) => void;
  onRemove: () => void;
  fields: FilterFieldConfig[];
  isOnly: boolean;
}

const FilterRule: React.FC<FilterRuleProps> = ({ node, index, onUpdate, onRemove, fields, isOnly }) => {
  const fieldConfig = fields.find(f => f.key === node.field);

  const handleFieldChange = (val: string) => {
    onUpdate((n) => {
      const newField = fields.find(f => f.key === val);
      const defaultOp = newField?.operators[0] || 'eq';
      const defaultValue = newField?.type === 'multi-select' ? []
        : newField?.type === 'boolean' ? undefined
        : '';
      return { ...n, field: val, operator: defaultOp, value: defaultValue } as IFilterRule;
    });
  };

  const handleOperatorChange = (val: string) => {
    onUpdate((n) => {
      const rule = n as IFilterRule;
      let newValue = rule.value;
      if (val === 'between' && !Array.isArray(rule.value)) {
        newValue = ['', ''];
      } else if (val !== 'between' && Array.isArray(rule.value)) {
        newValue = '';
      }
      return { ...rule, operator: val as FilterOperator, value: newValue };
    });
  };

  const handleValueChange = (val: any) => {
    onUpdate((n) => ({ ...n, value: val } as IFilterRule));
  };

  const fieldOptions = fields.map(f => ({ label: f.label, value: f.key }));

  const operatorOptions = (fieldConfig?.operators || []).map(op => ({
    label: OPERATOR_LABELS[op] || op,
    value: op,
  }));

  const needsNoValue = ['is_true', 'is_false', 'is_set', 'not_set'].includes(node.operator);

  const renderValueInput = () => {
    if (!fieldConfig) return null;

    if (needsNoValue) {
      return (
        <div className="flex-1 flex items-center px-2.5 py-1.5 text-xs text-muted-foreground italic bg-secondary rounded-lg h-8">
          Sem valor
        </div>
      );
    }

    if (fieldConfig.type === 'select') {
      return (
        <InlineDropdown
          className="flex-1"
          triggerClassName="w-full justify-between"
          value={String(node.value || '')}
          options={(fieldConfig.options || []).map(o => ({ label: o.label, value: String(o.value) }))}
          onChange={handleValueChange}
          placeholder="Selecione..."
        />
      );
    }

    if (fieldConfig.type === 'multi-select') {
      const selected = Array.isArray(node.value) ? node.value.map(String) : [];
      return (
        <MultiSelectPopover
          selected={selected}
          options={(fieldConfig.options || []).map(o => ({
            label: String(o.label),
            value: o.value,
            count: (o as any).count,
          }))}
          onChange={handleValueChange}
          placeholder={`Selecione ${fieldConfig.label.toLowerCase()}...`}
        />
      );
    }

    if (fieldConfig.type === 'number' && node.operator === 'between') {
      const [min, max] = Array.isArray(node.value) ? node.value : ['', ''];
      return (
        <div className="flex-1 flex items-center gap-1.5">
          <input
            type="number"
            className="w-full px-2.5 py-1.5 text-xs bg-input-background border border-input rounded-lg shadow-xs focus:outline-none focus:ring-4 focus:ring-ring/10 focus:border-ring h-8"
            placeholder="Min"
            value={min}
            onChange={e => handleValueChange([e.target.value, max])}
          />
          <span className="text-[10px] text-muted-foreground shrink-0">–</span>
          <input
            type="number"
            className="w-full px-2.5 py-1.5 text-xs bg-input-background border border-input rounded-lg shadow-xs focus:outline-none focus:ring-4 focus:ring-ring/10 focus:border-ring h-8"
            placeholder="Max"
            value={max}
            onChange={e => handleValueChange([min, e.target.value])}
          />
        </div>
      );
    }

    if (fieldConfig.type === 'number') {
      return (
        <input
          type="number"
          className="flex-1 px-2.5 py-1.5 text-xs bg-input-background border border-input rounded-lg shadow-xs focus:outline-none focus:ring-4 focus:ring-ring/10 focus:border-ring h-8 min-w-0"
          placeholder={fieldConfig.placeholder || 'Valor...'}
          value={node.value || ''}
          onChange={e => handleValueChange(e.target.value)}
        />
      );
    }

    // Text
    return (
      <input
        type="text"
        className="flex-1 px-2.5 py-1.5 text-xs bg-input-background border border-input rounded-lg shadow-xs focus:outline-none focus:ring-4 focus:ring-ring/10 focus:border-ring h-8 min-w-0"
        placeholder={fieldConfig.placeholder || 'Digite um valor...'}
        value={node.value || ''}
        onChange={e => handleValueChange(e.target.value)}
      />
    );
  };

  return (
    <div className="group flex items-center gap-2">
      {/* Rule Content */}
      <div className="flex-1 flex flex-wrap items-center gap-1.5 min-w-0">
        {/* Field */}
        <InlineDropdown
          value={node.field}
          options={fieldOptions}
          onChange={handleFieldChange}
          triggerClassName="font-medium text-foreground"
        />

        {/* Operator */}
        <InlineDropdown
          value={node.operator}
          options={operatorOptions}
          onChange={handleOperatorChange}
          triggerClassName="text-muted-foreground bg-secondary border-transparent hover:border-border"
        />

        {/* Value */}
        {renderValueInput()}
      </div>

      {/* Remove */}
      <button
        type="button"
        onClick={onRemove}
        disabled={isOnly}
        className={cn(
          "w-7 h-7 flex items-center justify-center rounded-lg shrink-0 transition-colors",
          isOnly
            ? "text-muted-foreground/20 cursor-not-allowed"
            : "text-muted-foreground/40 hover:text-destructive hover:bg-destructive/5 cursor-pointer"
        )}
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

// ─── Filter Group Component ──────────────────────────────────────────────────

interface FilterGroupProps {
  node: IFilterGroup;
  depth: number;
  onUpdate: (updater: (n: FilterNode) => FilterNode) => void;
  onRemove?: () => void;
  fields: FilterFieldConfig[];
}

const FilterGroup: React.FC<FilterGroupProps> = ({ node, depth, onUpdate, onRemove, fields }) => {
  const isRoot = depth === 0;

  const handleAddRule = () => {
    onUpdate((n) => ({
      ...n,
      children: [...(n as IFilterGroup).children, createRule()],
    }));
  };

  const setOperator = (op: 'and' | 'or') => {
    onUpdate((n) => ({ ...n, operator: op }));
  };

  return (
    <div className={cn(
      "flex flex-col gap-2",
      !isRoot && "p-3 border border-border rounded-lg bg-secondary/30"
    )}>
      {/* Children List */}
      <div className="space-y-2">
        {node.children.map((child, i) => (
          <div key={child.id}>
            {/* Connector */}
            {i > 0 && (
              <div className="flex items-center gap-2 pl-2">
                <div className="h-px flex-1 bg-border/60" />
                {i === 1 && (
                  <div className="flex items-center bg-secondary rounded-md border border-border p-px">
                    <button
                      type="button"
                      onClick={() => setOperator('and')}
                      className={cn(
                        "px-2 py-0.5 text-[10px] font-semibold rounded-sm transition-all leading-none",
                        node.operator === 'and'
                          ? "bg-foreground text-white shadow-xs"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      E
                    </button>
                    <button
                      type="button"
                      onClick={() => setOperator('or')}
                      className={cn(
                        "px-2 py-0.5 text-[10px] font-semibold rounded-sm transition-all leading-none",
                        node.operator === 'or'
                          ? "bg-foreground text-white shadow-xs"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      OU
                    </button>
                  </div>
                )}
                {i > 1 && (
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1.5">
                    {node.operator === 'and' ? 'E' : 'OU'}
                  </span>
                )}
                <div className="h-px flex-1 bg-border/60" />
              </div>
            )}

            {child.type === 'group' ? (
              <FilterGroup
                node={child}
                depth={depth + 1}
                fields={fields}
                onUpdate={(updater) => onUpdate((n) => updateNode(n as IFilterGroup, child.id, updater))}
                onRemove={() => onUpdate((n) => removeNode(n as IFilterGroup, child.id))}
              />
            ) : (
              <FilterRule
                node={child as IFilterRule}
                index={i}
                fields={fields}
                isOnly={node.children.length <= 1}
                onUpdate={(updater) => onUpdate((n) => updateNode(n as IFilterGroup, child.id, updater))}
                onRemove={() => onUpdate((n) => removeNode(n as IFilterGroup, child.id))}
              />
            )}
          </div>
        ))}
      </div>

      {/* Add Rule */}
      <button
        type="button"
        onClick={handleAddRule}
        className={cn(
          "inline-flex items-center gap-1.5 px-3 py-2 rounded-lg",
          "text-xs font-semibold text-muted-foreground",
          "hover:bg-secondary hover:text-foreground transition-colors cursor-pointer w-fit"
        )}
      >
        <Plus className="w-3.5 h-3.5" />
        Adicionar regra
      </button>
    </div>
  );
};

// ─── Main Builder Component ──────────────────────────────────────────────────

export interface CategoryOption {
  id: string;
  name: string;
  depth: number;
  path: string;
  productCount: number;
  isActive: boolean;
}

interface FilterBuilderProps {
  rootGroup: IFilterGroup;
  onChange: (value: IFilterGroup) => void;
  facets: {
    categories?: Record<string, number> | { id: string; count: number }[];
    modelos?: Record<string, number> | [string, number][];
    anos?: Record<string, number> | [string, number][];
  };
  /** Full list of categories from /admin/categories/full-tree */
  allCategories?: CategoryOption[];
}

export function FilterBuilder({ rootGroup, onChange, facets, allCategories }: FilterBuilderProps) {
  const fields = useMemo(() => {
    const safeFacets = facets || {};
    const safeModelos = safeFacets.modelos || {};
    const safeAnos = safeFacets.anos || {};

    // Build facet count map for categories (to overlay on full list)
    const facetCatCounts: Record<string, number> = {};
    const safeCats = safeFacets.categories || {};
    if (Array.isArray(safeCats)) {
      (safeCats as any[]).forEach((c: any) => { facetCatCounts[String(c.id)] = c.count; });
    } else {
      Object.entries(safeCats).forEach(([k, v]) => { facetCatCounts[k] = v as number; });
    }

    return PRODUCT_FILTER_FIELDS.map((f) => {
      if (f.key === 'categories') {
        let opts: { label: string; value: string | number; count?: number }[] = [];

        // Sentinel: "Sem categoria" always first
        opts.push({
          label: '(Sem categoria)',
          value: NO_CATEGORY_SENTINEL,
          count: undefined,
        });

        if (allCategories && allCategories.length > 0) {
          // Use full category tree — skip root (depth 0) and the Default Category (depth 1, id "2" typically)
          const filtered = allCategories.filter(c => c.depth >= 2 && c.isActive);
          for (const cat of filtered) {
            // Indent label based on depth for hierarchy hint
            const indent = cat.depth > 2 ? '\u00A0\u00A0'.repeat(cat.depth - 2) : '';
            opts.push({
              label: `${indent}${cat.name}`,
              value: cat.id,
              count: cat.productCount ?? facetCatCounts[cat.id] ?? 0,
            });
          }
        } else {
          // Fallback: facets only (when full tree hasn't loaded yet)
          const facetOpts = Object.entries(facetCatCounts).map(([k, v]) => ({
            label: k,
            value: k,
            count: v,
          }));
          opts.push(...facetOpts);
        }
        return { ...f, options: opts };
      }
      if (f.key === 'modelos') {
        const opts = Array.isArray(safeModelos)
          ? safeModelos.map((m: any) => ({
              label: m[0] || m.id,
              value: m[0] || m.id,
              count: m[1] || m.count,
            }))
          : Object.entries(safeModelos).map(([k, v]) => ({
              label: k,
              value: k,
              count: v as number,
            }));
        return { ...f, options: opts };
      }
      if (f.key === 'anos') {
        const opts = Array.isArray(safeAnos)
          ? safeAnos.map((a: any) => ({
              label: a[0] || a.id,
              value: a[0] || a.id,
              count: a[1] || a.count,
            }))
          : Object.entries(safeAnos).map(([k, v]) => ({
              label: k,
              value: k,
              count: v as number,
            }));
        opts.sort((a: any, b: any) => String(b.label).localeCompare(String(a.label)));
        return { ...f, options: opts };
      }
      return f;
    });
  }, [facets, allCategories]);

  const handleUpdate = (updater: (n: FilterNode) => FilterNode) => {
    onChange(updater(rootGroup) as IFilterGroup);
  };

  return (
    <FilterGroup
      node={rootGroup}
      depth={0}
      fields={fields}
      onUpdate={handleUpdate}
    />
  );
}