import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Upload, RefreshCw, Loader2, Image as ImageIcon,
  ExternalLink, Download, AlertTriangle, Camera, Trash2,
  CheckCircle2, XCircle, Link2, FolderTree, BarChart3, Search, ArrowRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';

import { Button } from '../components/base/button';
import { Badge } from '../components/base/badge';
import { Card } from '../components/base/card';
import { Progress } from '../components/ui/progress';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { Tooltip, TooltipTrigger, TooltipContent } from '../components/ui/tooltip';
import { Input } from '../components/ui/input';
import { Separator } from '../components/ui/separator';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '../components/ui/dialog';
import { ScrollArea } from '../components/ui/scroll-area';

const API = `https://${projectId}.supabase.co/functions/v1/make-server-1d6e33e0`;
const HEADERS: HeadersInit = {
  Authorization: `Bearer ${publicAnonKey}`,
  apikey: publicAnonKey,
  'Content-Type': 'application/json',
};
const UPLOAD_HEADERS: HeadersInit = {
  Authorization: `Bearer ${publicAnonKey}`,
  apikey: publicAnonKey,
};

// ─── Types ───────────────────────────────────────────────────────────────────

interface CategoryNode {
  id: number;
  parent_id: number;
  name: string;
  level: number;
  is_active: boolean;
  product_count: number;
  children_data?: CategoryNode[];
  children?: CategoryNode[]; // fallback for old cache format
}

interface CrossRefEntry {
  parentId: number;
  parentName: string;
  childId: number;
  childName: string;
  genericKey: string;
  compositeKey: string;
  imageUrl: string | null;
  matchedKey: string | null;
  hasImage: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const slugify = (text: string): string =>
  text.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

const MODEL_NAMES = ['HILUX', 'COROLLA', 'COROLLA CROSS', 'YARIS', 'SW4', 'ETIOS', 'RAV4', 'PRIUS'];

function getTopCategories(tree: CategoryNode | null): CategoryNode[] {
  if (!tree) return [];
  const walk = (node: CategoryNode): CategoryNode[] => {
    const children = (node.children_data || node.children || []).filter(c => c.is_active);
    if (children.length === 0) return [];
    if (children.length === 1) return walk(children[0]);
    return children;
  };
  return walk(tree);
}

function findImageForEntry(
  parentSlug: string,
  childSlug: string,
  images: Record<string, string>,
): { url: string; key: string } | null {
  const compositeKey = `${parentSlug}:${childSlug}`;
  if (images[compositeKey]) return { url: images[compositeKey], key: compositeKey };
  if (images[childSlug]) return { url: images[childSlug], key: childSlug };
  for (const key of Object.keys(images)) {
    if (key.includes(childSlug) || childSlug.includes(key)) return { url: images[key], key };
  }
  return null;
}

// ─── Uploadable Image Card ──────────────────────────────────────────────────

function ImageCard({
  entry, onUpload, onDelete, uploading,
}: {
  entry: CrossRefEntry;
  onUpload: (key: string, file: File) => Promise<void>;
  onDelete: (key: string) => Promise<void>;
  uploading: string | null;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadKey = entry.matchedKey || entry.compositeKey;
  const isUploading = uploading === uploadKey;

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await onUpload(uploadKey, file);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <Card.Root className="overflow-hidden group transition-shadow hover:shadow-md gap-0">
      <div className="aspect-[16/9] bg-secondary relative overflow-hidden">
        {entry.imageUrl ? (
          <img
            src={entry.imageUrl}
            alt={entry.childName}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
            <ImageIcon className="w-8 h-8 mb-1.5 opacity-20" />
            <span className="text-[11px]">Sem imagem</span>
          </div>
        )}
        <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/50 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={isUploading}
                  className="p-2.5 bg-card rounded-lg text-foreground hover:bg-card/90 transition-colors shadow-lg disabled:opacity-50"
                >
                  {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                </button>
              </TooltipTrigger>
              <TooltipContent>{entry.hasImage ? 'Trocar imagem' : 'Enviar imagem'}</TooltipContent>
            </Tooltip>
            {entry.hasImage && entry.matchedKey && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => onDelete(entry.matchedKey!)}
                    className="p-2.5 bg-card rounded-lg text-destructive hover:bg-card/90 transition-colors shadow-lg"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Remover imagem</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
        {isUploading && (
          <div className="absolute inset-0 bg-foreground/60 flex items-center justify-center">
            <div className="bg-card rounded-lg px-4 py-2 flex items-center gap-2 shadow-lg">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              <span className="text-xs font-medium text-foreground">Enviando...</span>
            </div>
          </div>
        )}
        <div className="absolute top-2 right-2">
          <Badge
            variant={entry.hasImage ? 'pill-color' : 'pill-outline'}
            color={entry.hasImage ? 'success' : 'warning'}
            size="xs"
          >
            {entry.hasImage ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
            {entry.hasImage ? 'OK' : 'Pendente'}
          </Badge>
        </div>
      </div>
      <Card.Content className="p-3 space-y-2">
        <div>
          <p className="text-sm font-semibold text-foreground leading-tight">{entry.childName}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{entry.parentName}</p>
        </div>
        <Badge variant="pill-outline" color="gray" size="xs" className="font-mono">
          {entry.compositeKey}
        </Badge>
        <div className="flex items-center gap-2 pt-0.5">
          <Button color="tertiary" size="xs" className="h-7 text-primary" onClick={() => fileRef.current?.click()} disabled={isUploading}>
            <Upload className="w-3 h-3 mr-1" />
            {entry.hasImage ? 'Trocar' : 'Enviar'}
          </Button>
          {entry.hasImage && entry.imageUrl && (
            <a
              href={entry.imageUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center h-7 px-2 text-xs text-muted-foreground hover:text-foreground transition-colors rounded-lg"
            >
              <ExternalLink className="w-3 h-3 mr-1" /> Ver
            </a>
          )}
        </div>
      </Card.Content>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
    </Card.Root>
  );
}

// ─── Model Icon Card ────────────────────────────────────────────────────────

function ModelIconCard({
  name, currentUrl, onUpload, uploading,
}: {
  name: string;
  currentUrl: string | null;
  onUpload: (model: string, file: File) => Promise<void>;
  uploading: string | null;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const isUploading = uploading === name;
  const fallback = `https://toyoparts.com.br/pub/media/catalog/icons/models/${encodeURIComponent(name)}.png?v=1`;

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await onUpload(name, file);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <Card.Root className="overflow-hidden group transition-shadow hover:shadow-md p-0 gap-0">
      <div className="flex flex-col items-center gap-2 p-4 relative">
        <div className="w-full h-12 flex items-center justify-center relative">
          <img src={currentUrl || fallback} alt={name} className="max-w-full max-h-full object-contain" loading="lazy" />
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-card/80 rounded-lg">
            <button
              onClick={() => fileRef.current?.click()}
              disabled={isUploading}
              className="p-1.5 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-50"
            >
              {isUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
        <span className="text-[11px] font-semibold text-foreground text-center leading-tight">{name}</span>
        <Badge
          variant={currentUrl ? 'pill-color' : 'pill-outline'}
          color={currentUrl ? 'success' : 'warning'}
          size="xs"
          className="text-[9px]"
        >
          {currentUrl ? 'Storage' : 'Fallback'}
        </Badge>
      </div>
      <input ref={fileRef} type="file" accept="image/png,image/svg+xml,image/webp" className="hidden" onChange={handleFile} />
    </Card.Root>
  );
}

// ─── Stat Card ─────────────────────────────────────────────────────────────

function StatCard({ label, value, icon, color }: {
  label: string; value: string | number; icon: React.ReactNode; color: string;
}) {
  return (
    <Card.Root className="p-0 gap-0">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${color}`}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-2xl font-bold text-foreground tabular-nums leading-tight">
            {typeof value === 'number' ? value.toLocaleString('pt-BR') : value}
          </p>
          <p className="text-xs text-muted-foreground leading-tight mt-0.5">{label}</p>
        </div>
      </div>
    </Card.Root>
  );
}

// ─── Orphan Remap Dialog ────────────────────────────────────────────────────

function OrphanRemapDialog({
  open,
  onOpenChange,
  orphanKey,
  orphanImageUrl,
  allEntries,
  onRemap,
  remapping,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orphanKey: string;
  orphanImageUrl: string;
  allEntries: CrossRefEntry[];
  onRemap: (oldKey: string, newKey: string) => Promise<void>;
  remapping: boolean;
}) {
  const [search, setSearch] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [selectedLabel, setSelectedLabel] = useState<string>('');

  // Reset on open
  useEffect(() => {
    if (open) {
      setSearch('');
      setSelectedKey(null);
      setSelectedLabel('');
    }
  }, [open]);

  // Group entries by parent, filtered by search
  const grouped = useMemo(() => {
    const lowerSearch = search.toLowerCase();
    const result: Record<string, CrossRefEntry[]> = {};

    for (const entry of allEntries) {
      const matchesSearch =
        !search ||
        entry.childName.toLowerCase().includes(lowerSearch) ||
        entry.parentName.toLowerCase().includes(lowerSearch) ||
        entry.compositeKey.includes(lowerSearch);

      if (matchesSearch) {
        if (!result[entry.parentName]) result[entry.parentName] = [];
        result[entry.parentName].push(entry);
      }
    }
    return result;
  }, [allEntries, search]);

  const handleConfirm = async () => {
    if (!selectedKey) return;
    await onRemap(orphanKey, selectedKey);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle className="text-base">Associar imagem a categoria</DialogTitle>
          <DialogDescription>
            Selecione a subcategoria que corresponde a esta imagem para garantir a correta exibição no catálogo.
          </DialogDescription>
        </DialogHeader>

        <Separator />

        {/* Preview da imagem orfa */}
        <div className="px-6 py-4 bg-secondary/30">
          <div className="flex items-center gap-4">
            <div className="w-24 h-14 rounded-lg overflow-hidden border border-border bg-secondary flex-shrink-0">
              <img src={orphanImageUrl} alt={orphanKey} className="w-full h-full object-cover" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground mb-1">Imagem orfa</p>
              <Badge variant="pill-outline" color="gray" size="xs" className="font-mono">{orphanKey}</Badge>
              {selectedKey && (
                <div className="flex items-center gap-2 mt-2">
                  <ArrowRight className="w-3 h-3 text-success flex-shrink-0" />
                  <Badge variant="pill-color" color="success" size="xs" className="font-mono">
                    {selectedKey}
                  </Badge>
                </div>
              )}
            </div>
          </div>
        </div>

        <Separator />

        {/* Search */}
        <div className="px-6 py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar categoria..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9"
              autoFocus
            />
          </div>
        </div>

        {/* Category list */}
        <ScrollArea className="h-[320px]">
          <div className="px-3 pb-3">
            {Object.keys(grouped).length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Search className="w-6 h-6 mb-2 opacity-30" />
                <p className="text-sm">Nenhuma categoria encontrada</p>
              </div>
            ) : (
              Object.entries(grouped).map(([parentName, entries]) => (
                <div key={parentName} className="mb-1">
                  {/* Parent header */}
                  <div className="sticky top-0 bg-background/95 backdrop-blur-sm px-3 py-1.5 z-10">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                      {parentName}
                    </p>
                  </div>
                  {/* Child items */}
                  <div className="space-y-0.5">
                    {entries.map(entry => {
                      const isSelected = selectedKey === entry.compositeKey;
                      return (
                        <button
                          key={`${entry.parentId}-${entry.childId}`}
                          onClick={() => {
                            setSelectedKey(entry.compositeKey);
                            setSelectedLabel(`${entry.parentName} → ${entry.childName}`);
                          }}
                          className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-3 transition-colors ${
                            isSelected
                              ? 'bg-primary/10 border border-primary/30'
                              : 'hover:bg-secondary border border-transparent'
                          }`}
                        >
                          {/* Status indicator */}
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                            entry.hasImage ? 'bg-success' : 'bg-border'
                          }`} />
                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm leading-tight ${isSelected ? 'font-semibold text-primary' : 'font-medium text-foreground'}`}>
                              {entry.childName}
                            </p>
                            <p className="text-[10px] font-mono text-muted-foreground mt-0.5 truncate">
                              {entry.compositeKey}
                            </p>
                          </div>
                          {/* Current image badge */}
                          {entry.hasImage && (
                            <Badge variant="pill-color" color="success" size="xs" className="flex-shrink-0">
                              Tem imagem
                            </Badge>
                          )}
                          {/* Selected check */}
                          {isSelected && (
                            <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>

        <Separator />

        <DialogFooter className="px-6 py-4">
          <div className="flex items-center justify-between w-full gap-3">
            <div className="min-w-0 flex-1">
              {selectedLabel && (
                <p className="text-xs text-muted-foreground truncate">
                  Associar a: <span className="font-medium text-foreground">{selectedLabel}</span>
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button color="secondary" size="sm" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button
                color="primary"
                size="sm"
                disabled={!selectedKey || remapping}
                onClick={handleConfirm}
              >
                {remapping ? (
                  <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Associando...</>
                ) : (
                  <><Link2 className="w-3.5 h-3.5 mr-1.5" /> Associar</>
                )}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ═══ Main Component ═════════════════════════════════════════════════════════

export function DeptImagesSection() {
  const [catImages, setCatImages] = useState<Record<string, string>>({});
  const [modelImages, setModelImages] = useState<Record<string, string>>({});
  const [categoryTree, setCategoryTree] = useState<CategoryNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<'categories' | 'models' | null>(null);
  const [uploadingCat, setUploadingCat] = useState<string | null>(null);
  const [uploadingModel, setUploadingModel] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<'all' | 'with' | 'without'>('all');

  // Remap dialog state
  const [remapDialogOpen, setRemapDialogOpen] = useState(false);
  const [remapOrphanKey, setRemapOrphanKey] = useState<string>('');
  const [remapOrphanImageUrl, setRemapOrphanImageUrl] = useState<string>('');
  const [remapping, setRemapping] = useState(false);

  // ── Fetch all data ──
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [catRes, modelRes, treeRes] = await Promise.all([
        fetch(`${API}/categories/images`, { headers: HEADERS }),
        fetch(`${API}/models/images`, { headers: HEADERS }),
        fetch(`${API}/categories/tree`, { headers: HEADERS }),
      ]);
      if (catRes.ok) { const d = await catRes.json(); setCatImages(d.images || {}); }
      if (modelRes.ok) { const d = await modelRes.json(); setModelImages(d.urls || {}); }
      if (treeRes.ok) { const d = await treeRes.json(); setCategoryTree(d); }
    } catch (e) {
      console.error('[DeptImages] fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Cross-reference ──
  const crossRef = useMemo(() => {
    if (!categoryTree) return { entries: [], byParent: {} as Record<string, CrossRefEntry[]> };
    const topCats = getTopCategories(categoryTree);
    const entries: CrossRefEntry[] = [];

    for (const parent of topCats) {
      const subs = (parent.children_data || parent.children || []).filter(c => c.is_active);
      for (const child of subs) {
        const parentSlug = slugify(parent.name);
        const childSlug = slugify(child.name);
        const compositeKey = `${parentSlug}:${childSlug}`;
        const match = findImageForEntry(parentSlug, childSlug, catImages);
        entries.push({
          parentId: parent.id, parentName: parent.name,
          childId: child.id, childName: child.name,
          genericKey: childSlug, compositeKey,
          imageUrl: match?.url || null, matchedKey: match?.key || null,
          hasImage: !!match,
        });
      }
    }

    const byParent: Record<string, CrossRefEntry[]> = {};
    for (const e of entries) {
      if (!byParent[e.parentName]) byParent[e.parentName] = [];
      byParent[e.parentName].push(e);
    }
    return { entries, byParent };
  }, [categoryTree, catImages]);

  const { entries: allEntries, byParent } = crossRef;
  const totalEntries = allEntries.length;
  const withImage = allEntries.filter(e => e.hasImage).length;
  const withoutImage = allEntries.filter(e => !e.hasImage).length;
  const coveragePct = totalEntries > 0 ? Math.round((withImage / totalEntries) * 100) : 0;

  // ── Sync actions ──
  const syncCategoryImages = async () => {
    setSyncing('categories');
    try {
      const res = await fetch(`${API}/categories/images/sync`, { method: 'POST', headers: HEADERS });
      if (res.ok) {
        const d = await res.json();
        toast.success(`Sync concluido: ${d.ok}/${d.total} imagens`);
        await fetchData();
      } else { toast.error('Falha no sync'); }
    } catch (e: any) { toast.error(e.message); }
    finally { setSyncing(null); }
  };

  const syncModelImages = async () => {
    setSyncing('models');
    try {
      const res = await fetch(`${API}/models/images/sync`, { method: 'POST', headers: HEADERS });
      if (res.ok) {
        const d = await res.json();
        toast.success(`Sync concluido: ${d.synced}/${d.total} modelos`);
        await fetchData();
      } else { toast.error('Falha no sync'); }
    } catch (e: any) { toast.error(e.message); }
    finally { setSyncing(null); }
  };

  // ── Upload / delete ──
  const uploadCategoryImage = async (key: string, file: File) => {
    setUploadingCat(key);
    try {
      const fd = new FormData();
      fd.append('key', key);
      fd.append('file', file);
      const res = await fetch(`${API}/categories/images/upload`, { method: 'POST', headers: UPLOAD_HEADERS, body: fd });
      if (res.ok) {
        const d = await res.json();
        toast.success(`Imagem atualizada: ${key}`);
        if (d.signedUrl) setCatImages(prev => ({ ...prev, [key]: d.signedUrl }));
        else await fetchData();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(`Erro: ${err.error || 'Falha no upload'}`);
      }
    } catch (e: any) { toast.error(e.message); }
    finally { setUploadingCat(null); }
  };

  const deleteCategoryImage = async (key: string) => {
    try {
      const res = await fetch(`${API}/categories/images/${encodeURIComponent(key)}`, { method: 'DELETE', headers: HEADERS });
      if (res.ok) {
        toast.success(`Imagem removida: ${key}`);
        setCatImages(prev => { const n = { ...prev }; delete n[key]; return n; });
      } else { toast.error('Erro ao remover'); }
    } catch (e: any) { toast.error(e.message); }
  };

  const uploadModelIcon = async (model: string, file: File) => {
    setUploadingModel(model);
    try {
      const fd = new FormData();
      fd.append('model', model);
      fd.append('file', file);
      const res = await fetch(`${API}/models/images/upload`, { method: 'POST', headers: UPLOAD_HEADERS, body: fd });
      if (res.ok) {
        const d = await res.json();
        toast.success(`Icone atualizado: ${model}`);
        if (d.signedUrl) setModelImages(prev => ({ ...prev, [model]: d.signedUrl }));
        else await fetchData();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(`Erro: ${err.error || 'Falha no upload'}`);
      }
    } catch (e: any) { toast.error(e.message); }
    finally { setUploadingModel(null); }
  };

  // ── Remap orphan ──
  const remapOrphan = async (oldKey: string, newKey: string) => {
    setRemapping(true);
    try {
      const res = await fetch(`${API}/categories/images/remap`, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify({ oldKey, newKey }),
      });
      if (res.ok) {
        const d = await res.json();
        toast.success(`Imagem associada: ${oldKey} → ${newKey}`);
        // Update local state
        setCatImages(prev => {
          const next = { ...prev };
          const url = d.signedUrl || prev[oldKey];
          delete next[oldKey];
          if (url) next[newKey] = url;
          return next;
        });
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(`Erro no remap: ${err.error || 'Falha'}`);
      }
    } catch (e: any) { toast.error(e.message); }
    finally { setRemapping(false); }
  };

  const openRemapDialog = (key: string) => {
    setRemapOrphanKey(key);
    setRemapOrphanImageUrl(catImages[key] || '');
    setRemapDialogOpen(true);
  };

  // ── Filtered views ──
  const filteredByParent = useMemo(() => {
    const result: Record<string, CrossRefEntry[]> = {};
    for (const [pName, entries] of Object.entries(byParent)) {
      const filtered = entries.filter(e => {
        if (filterStatus === 'with') return e.hasImage;
        if (filterStatus === 'without') return !e.hasImage;
        return true;
      });
      if (filtered.length > 0) result[pName] = filtered;
    }
    return result;
  }, [byParent, filterStatus]);

  const orphanKeys = useMemo(() => {
    const usedKeys = new Set(allEntries.map(e => e.matchedKey).filter(Boolean));
    return Object.keys(catImages).filter(k => !usedKeys.has(k));
  }, [catImages, allEntries]);

  // ── Loading state ──
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="w-8 h-8 animate-spin mb-3 text-primary" />
        <p className="text-sm font-medium">Carregando dados...</p>
        <p className="text-xs text-muted-foreground mt-1">Categorias, imagens e modelos</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* ═══ Header ═══ */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Imagens do Menu</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Cruzamento entre categorias do Magento e imagens do MegaMenu. Envie ou troque imagens para cada departamento.
          </p>
        </div>
        <Button color="secondary" size="sm" onClick={fetchData} disabled={loading}
          iconLeading={<RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />}
        >
          Atualizar
        </Button>
      </div>

      {/* ═══ Coverage Stats ═══ */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          label="Total de subcategorias"
          value={totalEntries}
          icon={<FolderTree className="w-4 h-4 text-primary" />}
          color="bg-primary/10"
        />
        <StatCard
          label="Com imagem"
          value={withImage}
          icon={<CheckCircle2 className="w-4 h-4 text-success" />}
          color="bg-success/10"
        />
        <StatCard
          label="Sem imagem"
          value={withoutImage}
          icon={<XCircle className="w-4 h-4 text-warning" />}
          color="bg-warning/10"
        />
        <StatCard
          label="Cobertura"
          value={`${coveragePct}%`}
          icon={<BarChart3 className="w-4 h-4 text-chart-2" />}
          color="bg-chart-2/10"
        />
      </div>

      {/* Coverage bar */}
      <Card.Root className="p-0 gap-0">
        <div className="px-5 py-4 flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-foreground">Cobertura de imagens</p>
              <span className="text-sm font-semibold text-foreground tabular-nums">{withImage}/{totalEntries}</span>
            </div>
            <Progress value={coveragePct} className="h-2.5" />
          </div>
        </div>
      </Card.Root>

      {/* ═══ Tabs ═══ */}
      <Tabs defaultValue="departments">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="departments" className="gap-1.5">
            <FolderTree className="w-3.5 h-3.5" />
            Departamentos
          </TabsTrigger>
          <TabsTrigger value="models" className="gap-1.5">
            <Camera className="w-3.5 h-3.5" />
            Modelos
          </TabsTrigger>
          {orphanKeys.length > 0 && (
            <TabsTrigger value="orphans" className="gap-1.5">
              <Link2 className="w-3.5 h-3.5" />
              Orfas
              <Badge variant="modern" color="gray" size="xs" className="ml-0.5">{orphanKeys.length}</Badge>
            </TabsTrigger>
          )}
        </TabsList>

        {/* ── Tab: Departamentos ── */}
        <TabsContent value="departments" className="space-y-6 mt-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground mr-1">Filtrar:</span>
              {([
                { id: 'all', label: 'Todas', count: totalEntries },
                { id: 'without', label: 'Sem imagem', count: withoutImage },
                { id: 'with', label: 'Com imagem', count: withImage },
              ] as const).map(f => (
                <Button
                  key={f.id}
                  color={filterStatus === f.id ? 'primary' : 'secondary'}
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => setFilterStatus(f.id)}
                >
                  {f.label}
                  <Badge variant="modern" color="gray" size="xs" className={`ml-1.5 ${
                    filterStatus === f.id ? 'bg-primary-foreground/20 text-primary-foreground' : ''
                  }`}>
                    {f.count}
                  </Badge>
                </Button>
              ))}
            </div>
            <Button color="secondary" size="sm" onClick={syncCategoryImages} disabled={syncing === 'categories'} className="h-8"
              isLoading={syncing === 'categories'}
              iconLeading={syncing !== 'categories' ? <Download className="w-3.5 h-3.5" /> : undefined}
            >
              {syncing === 'categories' ? 'Sincronizando...' : 'Sync Todas'}
            </Button>
          </div>

          {Object.keys(filteredByParent).length === 0 ? (
            <Card.Root className="p-0">
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <CheckCircle2 className="w-10 h-10 mb-3 text-success/40" />
                <p className="text-sm font-medium">Nenhuma subcategoria pendente</p>
                <p className="text-xs text-muted-foreground mt-1">Todas as subcategorias ja possuem imagens</p>
              </div>
            </Card.Root>
          ) : (
            Object.entries(filteredByParent).map(([parentName, entries]) => {
              const parentWithCount = entries.filter(e => e.hasImage).length;
              const parentTotal = entries.length;
              const parentPct = parentTotal > 0 ? Math.round((parentWithCount / parentTotal) * 100) : 0;

              return (
                <Card.Root key={parentName} className="overflow-hidden p-0 gap-0">
                  <div className="px-5 py-4 border-b border-border flex items-center justify-between bg-secondary/50">
                    <div className="flex items-center gap-3">
                      <h3 className="text-sm font-semibold text-foreground">{parentName}</h3>
                      <Badge variant="pill-outline" color="gray" size="xs">ID {entries[0]?.parentId}</Badge>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="tabular-nums font-medium">{parentWithCount}/{parentTotal}</span>
                        <Progress value={parentPct} className="w-16 h-1.5" />
                      </div>
                      <Badge
                        variant="pill-color"
                        color={parentPct === 100 ? 'success' : parentPct > 0 ? 'warning' : 'error'}
                        size="xs"
                      >
                        {parentPct}%
                      </Badge>
                    </div>
                  </div>
                  <div className="p-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {entries.map(entry => (
                        <ImageCard
                          key={`${entry.parentId}-${entry.childId}`}
                          entry={entry}
                          onUpload={uploadCategoryImage}
                          onDelete={deleteCategoryImage}
                          uploading={uploadingCat}
                        />
                      ))}
                    </div>
                  </div>
                </Card.Root>
              );
            })
          )}
        </TabsContent>

        {/* ── Tab: Modelos ── */}
        <TabsContent value="models" className="space-y-6 mt-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="text-sm font-medium text-foreground">Icones dos modelos Toyota</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Icones PNG usados no MegaMenu e sidebar. Passe o mouse para trocar.
              </p>
            </div>
            <Button color="secondary" size="sm" onClick={syncModelImages} disabled={syncing === 'models'} className="h-8"
              isLoading={syncing === 'models'}
              iconLeading={syncing !== 'models' ? <Download className="w-3.5 h-3.5" /> : undefined}
            >
              {syncing === 'models' ? 'Sincronizando...' : 'Sync Todos'}
            </Button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            {MODEL_NAMES.map(name => (
              <ModelIconCard key={name} name={name} currentUrl={modelImages[name] || null} onUpload={uploadModelIcon} uploading={uploadingModel} />
            ))}
          </div>
        </TabsContent>

        {/* ── Tab: Orfas ── */}
        {orphanKeys.length > 0 && (
          <TabsContent value="orphans" className="space-y-4 mt-4">
            <Card.Root className="p-0 gap-0">
              <div className="px-5 py-4 border-b border-border bg-warning/5 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {orphanKeys.length} {orphanKeys.length === 1 ? 'imagem' : 'imagens'} sem categoria correspondente
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Estas chaves tem imagem no Storage mas nao correspondem a nenhuma subcategoria ativa do Magento.
                    Use o botao <span className="font-semibold">Associar</span> para vincular a uma categoria existente.
                  </p>
                </div>
              </div>
              <div className="p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {orphanKeys.map(key => (
                    <Card.Root key={key} className="overflow-hidden p-0 gap-0 group transition-shadow hover:shadow-md">
                      {/* Image preview */}
                      <div className="aspect-[16/9] bg-secondary relative overflow-hidden">
                        {catImages[key] ? (
                          <img
                            src={catImages[key]}
                            alt={key}
                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                            <ImageIcon className="w-6 h-6 opacity-20" />
                          </div>
                        )}
                        <div className="absolute top-2 right-2">
                          <Badge variant="pill-color" color="warning" size="xs">
                            <AlertTriangle className="w-3 h-3" /> Orfa
                          </Badge>
                        </div>
                      </div>

                      {/* Info + Actions */}
                      <Card.Content className="p-3 space-y-3">
                        <div>
                          <p className="text-sm font-semibold text-foreground leading-tight mb-1">
                            {key.includes(':') ? key.split(':')[1] : key}
                          </p>
                          <Badge variant="pill-outline" color="gray" size="xs" className="font-mono">{key}</Badge>
                        </div>

                        <Separator />

                        <div className="flex items-center gap-2">
                          <Button
                            color="primary"
                            size="sm"
                            className="flex-1 h-8 text-xs"
                            onClick={() => openRemapDialog(key)}
                            iconLeading={<Link2 className="w-3 h-3" />}
                          >
                            Associar
                          </Button>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-border text-destructive hover:bg-destructive/10 transition-colors"
                                onClick={() => deleteCategoryImage(key)}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>Remover imagem do Storage</TooltipContent>
                          </Tooltip>
                          {catImages[key] && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <a
                                  href={catImages[key]}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                              </TooltipTrigger>
                              <TooltipContent>Abrir imagem</TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </Card.Content>
                    </Card.Root>
                  ))}
                </div>
              </div>
            </Card.Root>
          </TabsContent>
        )}
      </Tabs>

      {/* ═══ Remap Dialog ═══ */}
      <OrphanRemapDialog
        open={remapDialogOpen}
        onOpenChange={setRemapDialogOpen}
        orphanKey={remapOrphanKey}
        orphanImageUrl={remapOrphanImageUrl}
        allEntries={allEntries}
        onRemap={remapOrphan}
        remapping={remapping}
      />
    </div>
  );
}