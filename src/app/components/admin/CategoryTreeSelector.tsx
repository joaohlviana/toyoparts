import React, { useState } from 'react';
import { ChevronRight, ChevronDown, Check, Folder, FolderOpen } from 'lucide-react';
import * as Checkbox from '@radix-ui/react-checkbox';
import { cn } from '../ui/utils';
import { Badge } from '../base/badge';

export interface CategoryNode {
  id: string | number;
  name: string;
  count?: number;
  children?: CategoryNode[];
  children_data?: CategoryNode[]; // novo formato do cache
  level?: number;
}

interface CategoryTreeSelectorProps {
  tree: CategoryNode[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

const TreeNode = ({ 
  node, 
  selectedIds, 
  onToggle, 
  level = 0 
}: { 
  node: CategoryNode; 
  selectedIds: string[]; 
  onToggle: (id: string, checked: boolean) => void;
  level?: number;
}) => {
  const [isOpen, setIsOpen] = useState(level < 1); // Expand first level by default
  const isSelected = selectedIds.includes(String(node.id));
  const kids = node.children_data || node.children || [];
  const hasChildren = kids.length > 0;

  return (
    <div className="select-none">
      <div 
        className={cn(
          "flex items-center gap-2 py-1.5 px-2 rounded-md transition-colors hover:bg-secondary/50 group",
          isSelected && "bg-primary/5"
        )}
        style={{ paddingLeft: `${Math.max(8, level * 16 + 8)}px` }}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen(!isOpen);
          }}
          className={cn(
            "p-0.5 rounded-sm hover:bg-black/10 transition-colors text-muted-foreground",
            !hasChildren && "opacity-0 pointer-events-none"
          )}
        >
          {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>

        <Checkbox.Root
          className="flex h-4 w-4 appearance-none items-center justify-center rounded border border-primary/30 bg-white data-[state=checked]:border-primary data-[state=checked]:bg-primary outline-none focus:ring-2 focus:ring-primary/20 transition-all"
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
          className="flex-1 text-sm cursor-pointer flex items-center gap-2 text-foreground/80"
        >
          {hasChildren ? (
            isOpen ? <FolderOpen className="w-3.5 h-3.5 text-blue-400" /> : <Folder className="w-3.5 h-3.5 text-blue-400" />
          ) : (
            <div className="w-3.5 h-3.5" /> 
          )}
          <span className={cn(isSelected && "font-medium text-primary")}>
            {node.name}
          </span>
          {node.id && <span className="text-[10px] font-mono text-muted-foreground ml-auto opacity-0 group-hover:opacity-50">#{node.id}</span>}
        </label>
      </div>

      {isOpen && hasChildren && (
        <div className="mt-0.5">
          {kids.map((child) => (
            <TreeNode 
              key={child.id} 
              node={child} 
              selectedIds={selectedIds} 
              onToggle={onToggle}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export function CategoryTreeSelector({ tree, selectedIds, onChange }: CategoryTreeSelectorProps) {
  const handleToggle = (id: string, checked: boolean) => {
    if (checked) {
      onChange([...selectedIds, id]);
    } else {
      onChange(selectedIds.filter(existingId => existingId !== id));
    }
  };

  if (!tree || tree.length === 0) {
    return (
      <div className="p-4 text-center border border-dashed border-border rounded-lg text-sm text-muted-foreground bg-secondary/20 flex flex-col items-center gap-2">
        <span>Nenhuma estrutura de categorias carregada.</span>
        <button 
          className="text-primary hover:underline text-xs" 
          onClick={() => window.location.reload()}
        >
          Tentar recarregar página
        </button>
      </div>
    );
  }

  return (
    <div className="border border-border rounded-lg bg-card overflow-hidden flex flex-col max-h-[400px]">
      <div className="p-2 border-b border-border bg-secondary/20 flex gap-2 overflow-x-auto no-scrollbar">
        {selectedIds.length > 0 ? (
          selectedIds.map(id => (
            <Badge key={id} variant="secondary" className="text-[10px] h-5 px-1.5 gap-1 shrink-0">
              #{id}
              <button 
                onClick={() => handleToggle(id, false)}
                className="hover:text-destructive transition-colors"
              >
                &times;
              </button>
            </Badge>
          ))
        ) : (
          <span className="text-xs text-muted-foreground px-2 py-0.5">Nenhuma categoria selecionada</span>
        )}
      </div>
      <div className="overflow-y-auto p-2">
        {tree.map(node => (
          <TreeNode 
            key={node.id} 
            node={node} 
            selectedIds={selectedIds} 
            onToggle={handleToggle} 
          />
        ))}
      </div>
    </div>
  );
}