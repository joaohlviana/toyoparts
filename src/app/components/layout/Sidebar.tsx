import React, { useState, useEffect } from 'react';
import { X, Store, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '../ui/utils';
import { AnimatePresence, motion } from 'motion/react';

// ─── Untitled UI Sidebar ─────────────────────────────────────────────────────
// Uses sidebar design tokens from theme.css

export type NavigationItem = {
  id: string;
  label: string;
  icon: React.ElementType;
  badge?: number;
  items?: NavigationItem[];
};

export type NavigationGroup = {
  label: string;
  items: NavigationItem[];
};

interface SidebarProps {
  groups: NavigationGroup[];
  activeId: string;
  onNavigate: (id: string) => void;
  onBackToStore?: () => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({ 
  groups, 
  activeId, 
  onNavigate, 
  onBackToStore,
  isOpenMobile,
  onCloseMobile
}: SidebarProps) {
  
  // State for expanded groups
  const [expandedIds, setExpandedIds] = useState<string[]>([]);

  // Automatically expand groups that contain the activeId
  // Note: 'groups' deliberately omitted from deps — is static (useMemo in AdminShell)
  // Adding 'groups' would cause re-runs on each parent render without real benefit
  useEffect(() => {
    const parent = groups
      .flatMap(g => g.items)
      .find(item => item.items?.some(sub => sub.id === activeId));
    
    if (parent && !expandedIds.includes(parent.id)) {
      setExpandedIds(prev => [...prev, parent.id]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]); // 'groups' omitted intentionally — static structure via useMemo

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  return (
    <>
      {/* Mobile Overlay */}
      {isOpenMobile && (
        <div 
          className="fixed inset-0 z-40 bg-foreground/40 backdrop-blur-sm lg:hidden animate-in fade-in duration-200"
          onClick={onCloseMobile}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed lg:static inset-y-0 left-0 z-50 w-[280px] bg-sidebar border-r border-sidebar-border",
        "flex flex-col transform transition-transform duration-200 ease-out",
        isOpenMobile ? "translate-x-0 shadow-xl" : "-translate-x-full lg:translate-x-0"
      )}>
        
        {/* Header */}
        <div className="h-[64px] flex items-center justify-between px-5 border-b border-sidebar-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shadow-xs">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary-foreground">
                <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                <path d="M2 17l10 5 10-5"/>
                <path d="M2 12l10 5 10-5"/>
              </svg>
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-sidebar-foreground leading-tight">Toyoparts</span>
              <span className="text-[11px] text-muted-foreground leading-tight">Painel Admin</span>
            </div>
          </div>
          <button 
            onClick={onCloseMobile} 
            className="lg:hidden p-1.5 text-muted-foreground hover:text-sidebar-foreground rounded-md hover:bg-sidebar-accent transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-5 scrollbar-thin scrollbar-thumb-sidebar-border scrollbar-track-transparent [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-sidebar-border/60 [&::-webkit-scrollbar-track]:bg-transparent">
          {groups.map((group, i) => (
            <div key={i} className={cn(i > 0 && "mt-6 pt-6 border-t border-sidebar-border")}>
              {group.label && (
                <div className="px-3 mb-2">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {group.label}
                  </span>
                </div>
              )}
              
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const isActive = activeId === item.id;
                  const hasChildren = item.items && item.items.length > 0;
                  const isExpanded = expandedIds.includes(item.id);
                  const isChildActive = item.items?.some(sub => sub.id === activeId);

                  if (hasChildren) {
                    return (
                      <div key={item.id} className="space-y-0.5">
                        <button
                          onClick={() => toggleExpand(item.id)}
                          className={cn(
                            "group relative w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors duration-100",
                            isChildActive
                              ? "text-sidebar-foreground bg-sidebar-accent/30"
                              : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                          )}
                        >
                          <item.icon className={cn(
                            "w-5 h-5 shrink-0 transition-colors",
                            isChildActive ? "text-sidebar-primary" : "text-muted-foreground group-hover:text-sidebar-foreground"
                          )} />
                          
                          <span className="flex-1 text-left truncate">{item.label}</span>
                          
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-muted-foreground" />
                          )}
                        </button>

                        <AnimatePresence initial={false}>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2 }}
                              className="overflow-hidden"
                            >
                              <div className="ml-4 pl-4 border-l border-sidebar-border/50 space-y-0.5 my-1">
                                {item.items!.map(subItem => {
                                  const isSubActive = activeId === subItem.id;
                                  return (
                                    <button
                                      key={subItem.id}
                                      onClick={() => {
                                        onNavigate(subItem.id);
                                        onCloseMobile();
                                      }}
                                      className={cn(
                                        "w-full flex items-center gap-3 px-3 py-1.5 text-sm font-medium rounded-md transition-colors duration-100",
                                        isSubActive
                                          ? "text-sidebar-primary bg-sidebar-accent"
                                          : "text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                                      )}
                                    >
                                      <span className="flex-1 text-left truncate">{subItem.label}</span>
                                      {subItem.badge != null && subItem.badge > 0 && (
                                        <span className="px-1.5 py-0.5 rounded-full bg-muted text-[10px] font-medium text-muted-foreground tabular-nums">
                                          {subItem.badge}
                                        </span>
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  }

                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        onNavigate(item.id);
                        onCloseMobile();
                      }}
                      className={cn(
                        "group relative w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors duration-100",
                        isActive 
                          ? "bg-sidebar-accent text-sidebar-accent-foreground" 
                          : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                      )}
                    >
                      {isActive && (
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 bg-sidebar-primary rounded-r-full" />
                      )}
                      
                      <item.icon className={cn(
                        "w-5 h-5 shrink-0 transition-colors",
                        isActive ? "text-sidebar-primary" : "text-muted-foreground group-hover:text-sidebar-foreground"
                      )} />
                      
                      <span className="flex-1 text-left truncate">{item.label}</span>
                      
                      {item.badge != null && item.badge > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full bg-muted text-[10px] font-medium text-muted-foreground tabular-nums">
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-sidebar-border shrink-0 space-y-3">
          {onBackToStore && (
            <button
              onClick={onBackToStore}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground rounded-md transition-colors"
            >
              <Store className="w-4 h-4" />
              <span>Voltar a loja</span>
            </button>
          )}

          <div className="flex items-center gap-3 px-3 py-2.5 bg-sidebar-accent/50 border border-sidebar-border rounded-lg">
            <div className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-medium text-sidebar-foreground">Sistema Online</span>
              <span className="text-[10px] text-muted-foreground">v2.4.0</span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}