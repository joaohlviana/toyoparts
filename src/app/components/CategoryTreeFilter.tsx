import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';

export interface CategoryFilterTreeNode {
  id: string;
  label: string;
  level: number;
  resultCount: number;
  selectable: boolean;
  selected: boolean;
  children: CategoryFilterTreeNode[];
}

interface CategoryTreeFilterProps {
  nodes: CategoryFilterTreeNode[];
  onToggle: (id: string) => void;
  isLoading?: boolean;
}

function collectSelectedAncestorIds(nodes: CategoryFilterTreeNode[]): Set<string> {
  const expanded = new Set<string>();

  const walk = (items: CategoryFilterTreeNode[], ancestors: string[]) => {
    for (const item of items) {
      if (item.selected) {
        for (const ancestor of ancestors) expanded.add(ancestor);
      }
      walk(item.children || [], [...ancestors, item.id]);
    }
  };

  walk(nodes, []);
  return expanded;
}

function collectTopLevelExpandableIds(nodes: CategoryFilterTreeNode[]): Set<string> {
  return new Set(
    nodes
      .filter((node) => Array.isArray(node.children) && node.children.length > 0)
      .map((node) => node.id),
  );
}

function CategoryTreeItem({
  node,
  expandedIds,
  toggleExpand,
  onToggle,
  depth,
}: {
  node: CategoryFilterTreeNode;
  expandedIds: Set<string>;
  toggleExpand: (id: string) => void;
  onToggle: (id: string) => void;
  depth: number;
}) {
  const children = node.children || [];
  const hasChildren = children.length > 0;
  const isExpanded = expandedIds.has(node.id);
  const isSelected = node.selected;
  const canToggle = node.selectable !== false;
  const isTopLevel = depth === 0;

  const labelTone = isSelected
    ? 'text-primary'
    : canToggle
      ? 'text-foreground/80 hover:text-foreground/90'
      : 'text-muted-foreground/60';

  const labelWeight = isTopLevel
    ? (isSelected ? 'font-semibold' : 'font-medium')
    : (isSelected ? 'font-medium' : 'font-normal');

  const labelSize = isTopLevel ? 'text-[13px]' : 'text-[12px]';

  return (
    <div>
      <div
        data-cat-id={node.id}
        data-level={depth}
        className={`flex items-center rounded-md transition-colors ${isSelected ? 'bg-primary/5' : 'hover:bg-muted/25'}`}
      >
        <div style={{ width: depth * 14 }} className="shrink-0" />

        {hasChildren ? (
          <button
            type="button"
            aria-label={isExpanded ? `Recolher ${node.label}` : `Expandir ${node.label}`}
            onClick={() => toggleExpand(node.id)}
            className="flex h-8 w-7 items-center justify-center text-muted-foreground/70 transition-colors hover:text-foreground/80"
          >
            {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        ) : (
          <div className="w-7 shrink-0" />
        )}

        <button
          type="button"
          onClick={() => canToggle && onToggle(node.id)}
          className={`flex min-w-0 flex-1 items-center justify-between gap-2 py-1.5 pr-2 text-left leading-[1.1] transition-colors ${labelTone} ${labelWeight} ${labelSize}`}
        >
          <span className="truncate">{node.label}</span>
          <span className={`shrink-0 text-[10px] font-normal tabular-nums ${isSelected ? 'text-primary/70' : 'text-muted-foreground/60'}`}>
            {node.resultCount}
          </span>
        </button>
      </div>

      {hasChildren && isExpanded && (
        <div className="space-y-0.5">
          {children.map((child) => (
            <CategoryTreeItem
              key={child.id}
              node={child}
              expandedIds={expandedIds}
              toggleExpand={toggleExpand}
              onToggle={onToggle}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function CategoryTreeFilter({
  nodes,
  onToggle,
  isLoading,
}: CategoryTreeFilterProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const initialExpanded = useMemo(() => {
    const topLevel = collectTopLevelExpandableIds(nodes);
    const selectedAncestors = collectSelectedAncestorIds(nodes);
    return new Set<string>([...topLevel, ...selectedAncestors]);
  }, [nodes]);

  useEffect(() => {
    setExpandedIds(initialExpanded);
  }, [initialExpanded]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-2 py-3">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Carregando departamentos...</span>
      </div>
    );
  }

  if (!nodes.length) {
    return (
      <div className="px-2 py-3">
        <p className="text-xs italic text-muted-foreground">Nenhum departamento disponível</p>
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {nodes.map((node) => (
        <CategoryTreeItem
          key={node.id}
          node={node}
          expandedIds={expandedIds}
          toggleExpand={toggleExpand}
          onToggle={onToggle}
          depth={0}
        />
      ))}
    </div>
  );
}
