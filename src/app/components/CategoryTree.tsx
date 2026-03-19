import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Loader2, ChevronRight, ChevronDown, FolderTree } from 'lucide-react';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';

interface CategoryTreeNode {
  id: number;
  parent_id: number;
  name: string;
  level: number;
  is_active: boolean;
  product_count: number;
  children_data?: CategoryTreeNode[];
  children?: CategoryTreeNode[]; // fallback for old cache format
}

interface CategoryTreeProps {
  open: boolean;
  onClose: () => void;
}

function countCategories(node: CategoryTreeNode): { total: number; active: number; withProducts: number } {
  let total = 1;
  let active = node.is_active ? 1 : 0;
  let withProducts = node.product_count > 0 ? 1 : 0;

  const kids = node.children_data || node.children || [];
  for (const child of kids) {
    const c = countCategories(child);
    total += c.total;
    active += c.active;
    withProducts += c.withProducts;
  }
  return { total, active, withProducts };
}

export function CategoryTree({ open, onClose }: CategoryTreeProps) {
  const [tree, setTree] = useState<CategoryTreeNode | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedNodes, setExpandedNodes] = useState<Set<number>>(new Set([1, 2]));

  useEffect(() => {
    if (open) {
      loadCategories();
    }
  }, [open]);

  const loadCategories = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-1d6e33e0/categories/tree`,
        { headers: { Authorization: `Bearer ${publicAnonKey}` } },
      );

      if (res.ok) {
        setTree(await res.json());
      }
    } catch (error) {
      console.error('Erro ao carregar categorias:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleNode = (nodeId: number) => {
    setExpandedNodes((prev) => {
      const s = new Set(prev);
      if (s.has(nodeId)) s.delete(nodeId);
      else s.add(nodeId);
      return s;
    });
  };

  const renderTreeNode = (node: CategoryTreeNode, depth = 0) => {
    const kids = node.children_data || node.children || [];
    const hasChildren = kids.length > 0;
    const isExpanded = expandedNodes.has(node.id);

    return (
      <div key={node.id}>
        <div
          className="flex items-center gap-2 py-2 px-3 hover:bg-muted/50 rounded-md cursor-pointer"
          style={{ paddingLeft: `${depth * 24 + 12}px` }}
          onClick={() => hasChildren && toggleNode(node.id)}
        >
          {hasChildren ? (
            isExpanded ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            )
          ) : (
            <div className="w-4 h-4 flex-shrink-0" />
          )}

          <FolderTree className="w-4 h-4 text-primary flex-shrink-0" />

          <span className="flex-1 text-sm font-medium">{node.name}</span>

          {node.product_count > 0 && (
            <Badge variant="secondary" className="text-xs">
              {node.product_count}
            </Badge>
          )}

          {!node.is_active && (
            <Badge variant="destructive" className="text-xs">
              Inativa
            </Badge>
          )}

          <span className="text-xs text-muted-foreground">ID: {node.id}</span>
        </div>

        {hasChildren && isExpanded && (
          <div>{kids.map((child) => renderTreeNode(child, depth + 1))}</div>
        )}
      </div>
    );
  };

  const stats = tree ? countCategories(tree) : null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderTree className="w-5 h-5" />
            Arvore de Categorias do Magento
          </DialogTitle>
          <DialogDescription>
            Hierarquia completa de categorias com contagem de produtos vindos do catálogo Toyoparts.
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <span className="ml-3 text-muted-foreground">Carregando categorias...</span>
          </div>
        )}

        {!isLoading && tree && <div className="space-y-1">{renderTreeNode(tree)}</div>}

        {!isLoading && stats && (
          <div className="mt-6 pt-4 border-t">
            <h3 className="text-sm font-semibold mb-3">Estatisticas</h3>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Total:</span>
                <span className="ml-2 font-semibold">{stats.total}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Ativas:</span>
                <span className="ml-2 font-semibold">{stats.active}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Com produtos:</span>
                <span className="ml-2 font-semibold">{stats.withProducts}</span>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}