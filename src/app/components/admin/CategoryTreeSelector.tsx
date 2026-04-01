import React, { useMemo, useState } from 'react';
import { ChevronRight, ChevronDown, Check, Folder, FolderOpen, Search } from 'lucide-react';
import * as Checkbox from '@radix-ui/react-checkbox';
import { cn } from '../ui/utils';
import { Badge } from '../base/badge';
import { Input } from '../base/input';

export interface CategoryNode {
  id: string | number;
  name: string;
  count?: number;
  children?: CategoryNode[];
  children_data?: CategoryNode[];
  level?: number;
}

interface CategoryTreeSelectorProps {
  tree: CategoryNode[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

function normalizeNodes(tree: CategoryNode[] | CategoryNode | null | undefined): CategoryNode[] {
  const normalizeNode = (node: CategoryNode): CategoryNode => ({
    ...node,
    children_data: normalizeNodes((node.children_data || node.children || []) as CategoryNode[]),
  });

  return (Array.isArray(tree) ? tree : tree ? [tree] : [])
    .filter(Boolean)
    .map((node) => normalizeNode(node));
}

function flattenNodes(nodes: CategoryNode[], map = new Map<string, string>()) {
  for (const node of nodes) {
    map.set(String(node.id), node.name);
    const children = Array.isArray(node.children_data) ? node.children_data : [];
    flattenNodes(children, map);
  }
  return map;
}

function filterNodes(nodes: CategoryNode[], query: string): CategoryNode[] {
  if (!query) return nodes;
  const normalizedQuery = query.trim().toLowerCase();

  return nodes
    .map((node) => {
      const children = filterNodes(Array.isArray(node.children_data) ? node.children_data : [], normalizedQuery);
      const selfMatches =
        String(node.name || '').toLowerCase().includes(normalizedQuery) ||
        String(node.id || '').toLowerCase().includes(normalizedQuery);

      if (selfMatches || children.length > 0) {
        return {
          ...node,
          children_data: children,
        };
      }

      return null;
    })
    .filter(Boolean) as CategoryNode[];
}

const TreeNode = ({
  node,
  selectedIds,
  onToggle,
  level = 0,
  forcedOpen = false,
}: {
  node: CategoryNode;
  selectedIds: string[];
  onToggle: (id: string, checked: boolean) => void;
  level?: number;
  forcedOpen?: boolean;
}) => {
  const [isOpen, setIsOpen] = useState(level < 1);
  const effectiveOpen = forcedOpen || isOpen;
  const isSelected = selectedIds.includes(String(node.id));
  const kids = node.children_data || node.children || [];
  const hasChildren = kids.length > 0;

  return (
    <div className="select-none">
      <div
        className={cn(
          "flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-secondary/50 group",
          isSelected && "bg-primary/5"
        )}
        style={{ paddingLeft: `${Math.max(8, level * 16 + 8)}px` }}
      >
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setIsOpen((current) => !current);
          }}
          className={cn(
            "rounded-sm p-0.5 text-muted-foreground transition-colors hover:bg-black/10",
            !hasChildren && "pointer-events-none opacity-0"
          )}
        >
          {effectiveOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>

        <Checkbox.Root
          className="flex h-4 w-4 appearance-none items-center justify-center rounded border border-primary/30 bg-white outline-none transition-all data-[state=checked]:border-primary data-[state=checked]:bg-primary focus:ring-2 focus:ring-primary/20"
          checked={isSelected}
          onCheckedChange={(checked) => onToggle(String(node.id), checked === true)}
          id={`cat-${node.id}`}
        >
          <Checkbox.Indicator className="text-white">
            <Check className="h-3 w-3" />
          </Checkbox.Indicator>
        </Checkbox.Root>

        <label
          htmlFor={`cat-${node.id}`}
          className="flex flex-1 cursor-pointer items-center gap-2 text-sm text-foreground/80"
        >
          {hasChildren ? (
            effectiveOpen ? <FolderOpen className="h-3.5 w-3.5 text-blue-400" /> : <Folder className="h-3.5 w-3.5 text-blue-400" />
          ) : (
            <div className="h-3.5 w-3.5" />
          )}
          <span className={cn(isSelected && "font-medium text-primary")}>{node.name}</span>
          {node.id && (
            <span className="ml-auto font-mono text-[10px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-60">
              #{node.id}
            </span>
          )}
        </label>
      </div>

      {effectiveOpen && hasChildren && (
        <div className="mt-0.5">
          {kids.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              selectedIds={selectedIds}
              onToggle={onToggle}
              level={level + 1}
              forcedOpen={forcedOpen}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export function CategoryTreeSelector({ tree, selectedIds, onChange }: CategoryTreeSelectorProps) {
  const [search, setSearch] = useState('');
  const normalizedTree = useMemo(() => normalizeNodes(tree), [tree]);
  const categoryNameMap = useMemo(() => flattenNodes(normalizedTree), [normalizedTree]);
  const filteredTree = useMemo(() => filterNodes(normalizedTree, search), [normalizedTree, search]);

  const handleToggle = (id: string, checked: boolean) => {
    if (checked) {
      onChange(Array.from(new Set([...selectedIds, id])));
      return;
    }
    onChange(selectedIds.filter((existingId) => existingId !== id));
  };

  if (!normalizedTree || normalizedTree.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border bg-secondary/20 p-4 text-center text-sm text-muted-foreground">
        <span>Nenhuma estrutura de categorias carregada.</span>
        <button
          type="button"
          className="text-xs text-primary hover:underline"
          onClick={() => window.location.reload()}
        >
          Tentar recarregar pagina
        </button>
      </div>
    );
  }

  return (
    <div className="flex max-h-[480px] flex-col overflow-hidden rounded-lg border border-border bg-card">
      <div className="space-y-3 border-b border-border bg-secondary/20 p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar categoria por nome ou ID"
            className="pl-9"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {selectedIds.length > 0 ? (
            selectedIds.map((id) => (
              <Badge key={id} variant="secondary" className="h-auto min-h-6 gap-1 px-2 py-1 text-[10px]">
                <span className="max-w-[180px] truncate">{categoryNameMap.get(id) || `#${id}`}</span>
                <button
                  type="button"
                  onClick={() => handleToggle(id, false)}
                  className="transition-colors hover:text-destructive"
                >
                  &times;
                </button>
              </Badge>
            ))
          ) : (
            <span className="px-1 text-xs text-muted-foreground">Nenhuma categoria selecionada</span>
          )}
        </div>
      </div>

      <div className="overflow-y-auto p-2">
        {filteredTree.length > 0 ? (
          filteredTree.map((node) => (
            <TreeNode
              key={node.id}
              node={node}
              selectedIds={selectedIds}
              onToggle={handleToggle}
              forcedOpen={!!search}
            />
          ))
        ) : (
          <div className="rounded-lg border border-dashed border-border bg-secondary/10 p-4 text-sm text-muted-foreground">
            Nenhuma categoria encontrada para essa busca.
          </div>
        )}
      </div>
    </div>
  );
}
