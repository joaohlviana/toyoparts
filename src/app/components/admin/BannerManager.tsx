import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ExternalLink,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Link2,
  Loader2,
  Monitor,
  Pencil,
  Plus,
  Save,
  Smartphone,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { projectId } from '../../../../utils/supabase/info';
import { adminFetch } from '../../lib/admin-auth';
import { Badge } from '../base/badge';
import { Button } from '../base/button';
import { Card } from '../base/card';
import { Input } from '../base/input';
import { ImageUpload } from './ImageUpload';
import { Switch } from '../ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Label } from '../ui/label';
import { Separator } from '../ui/separator';

const API = `https://${projectId}.supabase.co/functions/v1/home-config-1d6e33e0`;

export interface HeroBannerImageOnly {
  id: string;
  active: boolean;
  order: number;
  desktopImageSrc: string;
  mobileImageSrc?: string;
  linkHref?: string;
  altText?: string;
  createdAt: string;
  updatedAt: string;
}

const EMPTY_BANNER: Omit<HeroBannerImageOnly, 'id' | 'createdAt' | 'updatedAt'> = {
  active: true,
  order: 0,
  desktopImageSrc: '',
  mobileImageSrc: '',
  linkHref: '',
  altText: '',
};

function createNewBanner(order: number): HeroBannerImageOnly {
  const timestamp = new Date().toISOString();
  return {
    ...EMPTY_BANNER,
    id: `banner_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    order,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function normalizeBanners(input: unknown): HeroBannerImageOnly[] {
  if (!Array.isArray(input)) return [];
  return [...input]
    .filter((item): item is HeroBannerImageOnly => Boolean(item && typeof item === 'object' && (item as any).id))
    .map((item, index) => ({
      id: String(item.id),
      active: item.active !== false,
      order: Number.isFinite(Number(item.order)) ? Number(item.order) : index,
      desktopImageSrc: String(item.desktopImageSrc || ''),
      mobileImageSrc: String(item.mobileImageSrc || ''),
      linkHref: String(item.linkHref || ''),
      altText: String(item.altText || ''),
      createdAt: String(item.createdAt || new Date().toISOString()),
      updatedAt: String(item.updatedAt || new Date().toISOString()),
    }))
    .sort((a, b) => a.order - b.order);
}

function sanitizeBannerForSave(banner: HeroBannerImageOnly, order: number): HeroBannerImageOnly {
  return {
    ...banner,
    active: banner.active !== false,
    order,
    desktopImageSrc: String(banner.desktopImageSrc || '').trim(),
    mobileImageSrc: String(banner.mobileImageSrc || '').trim(),
    linkHref: String(banner.linkHref || '').trim(),
    altText: String(banner.altText || '').trim(),
    updatedAt: new Date().toISOString(),
  };
}

function BannerPreview({ banner, mobile = false }: { banner: HeroBannerImageOnly; mobile?: boolean }) {
  const imageSrc = mobile && banner.mobileImageSrc ? banner.mobileImageSrc : banner.desktopImageSrc;

  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-border bg-[#0a0a0a] ${
        mobile ? 'aspect-[5/2]' : 'aspect-[5/1]'
      }`}
    >
      {imageSrc ? (
        <img src={imageSrc} alt={banner.altText || ''} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-white/30">
          <ImageIcon className="h-8 w-8" />
        </div>
      )}
    </div>
  );
}

function BannerPreviewPanel({
  banner,
  mobile = false,
}: {
  banner: HeroBannerImageOnly;
  mobile?: boolean;
}) {
  const hasOwnMobileAsset = Boolean(String(banner.mobileImageSrc || '').trim());
  const previewTitle = mobile ? 'Visualizacao mobile' : 'Visualizacao desktop';
  const previewHint = mobile
    ? hasOwnMobileAsset
      ? 'Usando a arte mobile publicada.'
      : 'Sem arte mobile: o preview usa a imagem desktop.'
    : 'Como o slide aparece no hero principal da home.';

  return (
    <div className="rounded-2xl border border-border/80 bg-card/80 p-3 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {mobile ? <Smartphone className="h-4 w-4 text-muted-foreground" /> : <Monitor className="h-4 w-4 text-muted-foreground" />}
            <p className="text-sm font-semibold text-foreground">{previewTitle}</p>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{previewHint}</p>
        </div>
        <Badge variant="pill-outline" color={mobile && !hasOwnMobileAsset ? 'gray' : 'brand'} size="xs">
          {mobile ? (hasOwnMobileAsset ? 'Arte mobile' : 'Herdando desktop') : 'Arte desktop'}
        </Badge>
      </div>

      {mobile ? (
        <div className="mx-auto w-[220px] rounded-[32px] border border-border bg-[#111214] p-2 shadow-[0_18px_60px_rgba(0,0,0,0.22)]">
          <div className="mx-auto mb-2 h-1.5 w-16 rounded-full bg-white/10" />
          <div className="overflow-hidden rounded-[24px] bg-black">
            <BannerPreview banner={banner} mobile />
          </div>
        </div>
      ) : (
        <div className="rounded-[20px] border border-border bg-background/80 p-2 shadow-[0_12px_40px_rgba(0,0,0,0.10)]">
          <div className="mb-2 flex items-center gap-1.5 px-1">
            <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
          </div>
          <BannerPreview banner={banner} />
        </div>
      )}
    </div>
  );
}

function BannerPreviewSummary({ banner }: { banner: HeroBannerImageOnly }) {
  const hasMobileImage = Boolean(String(banner.mobileImageSrc || '').trim());
  const hasLink = Boolean(String(banner.linkHref || '').trim());

  return (
    <div className="grid gap-2 sm:grid-cols-3">
      <div className="rounded-xl border border-border bg-background/70 px-3 py-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Status</p>
        <p className="mt-1 text-sm font-semibold text-foreground">{banner.active ? 'Publicado no hero' : 'Inativo'}</p>
      </div>
      <div className="rounded-xl border border-border bg-background/70 px-3 py-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Mobile</p>
        <p className="mt-1 text-sm font-semibold text-foreground">{hasMobileImage ? 'Arte dedicada' : 'Usando imagem desktop'}</p>
      </div>
      <div className="rounded-xl border border-border bg-background/70 px-3 py-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Destino</p>
        <p className="mt-1 truncate text-sm font-semibold text-foreground">{hasLink ? 'Com link' : 'Sem link'}</p>
      </div>
    </div>
  );
}

function BannerEditor({
  banner,
  onChange,
  onSave,
  onCancel,
  saving,
}: {
  banner: HeroBannerImageOnly;
  onChange: (banner: HeroBannerImageOnly) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const update = (patch: Partial<HeroBannerImageOnly>) => onChange({ ...banner, ...patch });
  const canSave = Boolean(String(banner.desktopImageSrc || '').trim());

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <div className="min-w-0 flex-1 space-y-5">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-4">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Slide image-only
            </Label>
            <p className="mt-1 text-sm text-muted-foreground">
              Esse hero aceita apenas imagem, link e ordem. Sem promo antiga, seed ou fallback comercial.
            </p>
          </div>

          <div className="space-y-4">
            <ImageUpload
              label="Imagem Desktop"
              value={banner.desktopImageSrc}
              onChange={(url) => update({ desktopImageSrc: url })}
              placeholder="Clique ou arraste a imagem desktop"
              helpText="Hero principal da home. Recomendado: proporcao 5:1."
              aspectRatio="5/1"
            />

            <ImageUpload
              label="Imagem Mobile (opcional)"
              value={banner.mobileImageSrc}
              onChange={(url) => update({ mobileImageSrc: url })}
              placeholder="Clique ou arraste a imagem mobile"
              helpText="Usada apenas no mobile quando estiver preenchida."
              aspectRatio="5/2"
            />

            <div className="space-y-1.5">
              <Label className="text-xs">Link de destino</Label>
              <Input
                value={banner.linkHref || ''}
                onChange={(event) => update({ linkHref: event.target.value })}
                placeholder="/pecas ou https://..."
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Texto alternativo</Label>
              <Input
                value={banner.altText || ''}
                onChange={(event) => update({ altText: event.target.value })}
                placeholder="Banner principal Toyoparts"
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between rounded-xl border border-border bg-background px-4 py-3">
              <div>
                <Label className="text-sm font-medium">Ativo</Label>
                <p className="text-xs text-muted-foreground">So entra no hero quando estiver ativo.</p>
              </div>
              <Switch checked={banner.active} onCheckedChange={(checked) => update({ active: Boolean(checked) })} />
            </div>
          </div>
        </div>
      </div>

      <div className="w-full shrink-0 space-y-4 lg:w-[380px]">
        <div className="space-y-4 lg:sticky lg:top-6">
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="mb-4">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Como vai aparecer
              </Label>
              <p className="mt-1 text-sm text-muted-foreground">
                Visualizacao real do slide no hero, com leitura separada para desktop e mobile.
              </p>
            </div>

            <BannerPreviewSummary banner={banner} />

            <div className="mt-4 space-y-4">
              <BannerPreviewPanel banner={banner} />
              <BannerPreviewPanel banner={banner} mobile />
            </div>

            <div className="mt-4 rounded-xl border border-dashed border-border bg-background/60 px-3 py-2">
              <div className="flex items-start gap-2">
                <Link2 className="mt-0.5 h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Link atual</p>
                  <p className="mt-1 break-all text-sm text-foreground">
                    {banner.linkHref || 'Sem link configurado. O slide ficara apenas visual.'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <Button color="primary" size="sm" onClick={onSave} disabled={!canSave || saving} className="flex-1">
            {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
            {saving ? 'Salvando...' : 'Salvar banner'}
          </Button>
          <Button color="secondary" size="sm" onClick={onCancel}>
            Cancelar
          </Button>
        </div>
      </div>
    </div>
  );
}

function BannerRow({
  banner,
  index,
  total,
  onEdit,
  onToggle,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  banner: HeroBannerImageOnly;
  index: number;
  total: number;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  return (
    <div className={`flex items-center gap-3 rounded-xl border p-3 ${banner.active ? 'bg-card' : 'bg-secondary/30 opacity-70'}`}>
      <div className="hidden w-36 shrink-0 sm:block">
        <BannerPreview banner={banner} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2">
          <Badge variant="pill-color" color="brand" size="xs">Imagem</Badge>
          {banner.active ? (
            <Badge variant="pill-outline" color="success" size="xs">Ativo</Badge>
          ) : (
            <Badge variant="pill-outline" color="gray" size="xs">Inativo</Badge>
          )}
        </div>
        <p className="truncate text-sm font-semibold text-foreground">{banner.altText || 'Banner sem texto alternativo'}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {banner.linkHref || 'Sem link de destino'}
        </p>
      </div>

      <div className="flex items-center gap-1">
        <Button color="secondary" size="xs" onClick={onMoveUp} disabled={index === 0} title="Subir">
          <ArrowUp className="h-3.5 w-3.5" />
        </Button>
        <Button color="secondary" size="xs" onClick={onMoveDown} disabled={index === total - 1} title="Descer">
          <ArrowDown className="h-3.5 w-3.5" />
        </Button>
        <Button color="secondary" size="xs" onClick={onToggle} title={banner.active ? 'Desativar' : 'Ativar'}>
          {banner.active ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
        </Button>
        <Button color="secondary" size="xs" onClick={onEdit} title="Editar">
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button color="error" size="xs" onClick={onDelete} title="Excluir">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

export function BannerManager() {
  const [banners, setBanners] = useState<HeroBannerImageOnly[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingBanner, setEditingBanner] = useState<HeroBannerImageOnly | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<HeroBannerImageOnly | null>(null);

  const fetchBanners = useCallback(async () => {
    setLoading(true);
    try {
      const response = await adminFetch(`${API}/admin/banners`);
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'Nao foi possivel carregar os banners');
      }
      const data = await response.json();
      setBanners(normalizeBanners(data.banners));
    } catch (error: any) {
      console.error('BannerManager fetch error:', error);
      setBanners([]);
      toast.error(error.message || 'Falha ao carregar banners');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchBanners();
  }, [fetchBanners]);

  const sortedBanners = useMemo(() => [...banners].sort((a, b) => a.order - b.order), [banners]);
  const activeCount = sortedBanners.filter((banner) => banner.active).length;

  const persistBannerList = useCallback(async (nextBanners: HeroBannerImageOnly[], successMessage: string) => {
    try {
      const response = await adminFetch(`${API}/admin/banners/batch`, {
        method: 'POST',
        body: JSON.stringify({
          banners: nextBanners.map((banner, index) => sanitizeBannerForSave(banner, index)),
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'Nao foi possivel salvar os banners');
      }

      const data = await response.json().catch(() => ({}));
      if (data.success !== true) {
        throw new Error(data.error || 'Nao foi possivel salvar os banners');
      }

      toast.success(successMessage);
      await fetchBanners();
    } catch (error: any) {
      toast.error(error.message || 'Erro ao salvar banners');
      await fetchBanners();
    }
  }, [fetchBanners]);

  const handleCreate = () => {
    setEditingBanner(createNewBanner(sortedBanners.length));
  };

  const handleSave = async () => {
    if (!editingBanner) return;

    setSaving(true);
    try {
      const payload = sanitizeBannerForSave(editingBanner, editingBanner.order);
      const response = await adminFetch(`${API}/admin/banners`, {
        method: 'POST',
        body: JSON.stringify({ banner: payload }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'Nao foi possivel salvar o banner');
      }

      const data = await response.json().catch(() => ({}));
      if (data.success !== true) {
        throw new Error(data.error || 'Nao foi possivel salvar o banner');
      }

      toast.success('Banner salvo com sucesso');
      setEditingBanner(null);
      await fetchBanners();
    } catch (error: any) {
      toast.error(error.message || 'Erro ao salvar o banner');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (banner: HeroBannerImageOnly) => {
    try {
      const response = await adminFetch(`${API}/admin/banners`, {
        method: 'POST',
        body: JSON.stringify({
          banner: sanitizeBannerForSave({ ...banner, active: !banner.active }, banner.order),
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'Nao foi possivel atualizar o banner');
      }

      toast.success(banner.active ? 'Banner desativado' : 'Banner ativado');
      await fetchBanners();
    } catch (error: any) {
      toast.error(error.message || 'Erro ao atualizar o banner');
    }
  };

  const handleDelete = async (banner: HeroBannerImageOnly) => {
    try {
      const response = await adminFetch(`${API}/admin/banners/${encodeURIComponent(banner.id)}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'Nao foi possivel remover o banner');
      }

      toast.success('Banner removido');
      setDeleteConfirm(null);
      await fetchBanners();
    } catch (error: any) {
      toast.error(error.message || 'Erro ao remover o banner');
    }
  };

  const moveBanner = async (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= sortedBanners.length) return;

    const next = [...sortedBanners];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    const normalized = next.map((banner, orderedIndex) => ({
      ...banner,
      order: orderedIndex,
    }));
    setBanners(normalized);
    await persistBannerList(normalized, 'Ordem dos banners atualizada');
  };

  return (
    <div className="mx-auto max-w-[1280px] px-4 pb-12 pt-6 lg:px-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Banners Hero</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Hero image-only da home. {loading ? 'Carregando...' : `${activeCount} ativos de ${sortedBanners.length} no total.`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button color="secondary" size="sm" onClick={() => void fetchBanners()} disabled={loading}>
            <Loader2 className={`mr-1.5 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          <Button color="primary" size="sm" onClick={handleCreate}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Novo banner
          </Button>
        </div>
      </div>

      {editingBanner ? (
        <Card.Root className="mb-6">
          <Card.Header>
            <Card.Title>{banners.some((banner) => banner.id === editingBanner.id) ? 'Editar banner' : 'Novo banner'}</Card.Title>
            <Card.Description>
              Configure apenas imagem, link e ordem. A home usa fallback neutro se nao houver banner publicado.
            </Card.Description>
          </Card.Header>
          <Card.Content>
            <BannerEditor
              banner={editingBanner}
              onChange={setEditingBanner}
              onSave={() => void handleSave()}
              onCancel={() => setEditingBanner(null)}
              saving={saving}
            />
          </Card.Content>
        </Card.Root>
      ) : null}

      <Card.Root>
        <Card.Header>
          <Card.Title className="flex items-center gap-2">
            <ImageIcon className="h-4 w-4" />
            Slides publicados
          </Card.Title>
          <Card.Description>
            A home so mostra banners ativos com imagem desktop. Se esta lista estiver vazia, o hero neutro continua sendo usado.
          </Card.Description>
        </Card.Header>
        <Card.Content className="space-y-4">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="animate-pulse rounded-xl border border-border bg-card p-3">
                  <div className="h-20 rounded-lg bg-muted" />
                </div>
              ))}
            </div>
          ) : sortedBanners.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-secondary/20 px-6 py-14 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary">
                <ImageIcon className="h-7 w-7 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">Nenhum banner publicado</h3>
              <p className="mt-2 max-w-md text-sm text-muted-foreground">
                A home nao sera quebrada. Sem banners publicados, ela continua mostrando apenas o hero neutro atual.
              </p>
              <Button color="primary" size="sm" onClick={handleCreate} className="mt-4">
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Criar primeiro banner
              </Button>
            </div>
          ) : (
            sortedBanners.map((banner, index) => (
              <BannerRow
                key={banner.id}
                banner={banner}
                index={index}
                total={sortedBanners.length}
                onEdit={() => setEditingBanner({ ...banner })}
                onToggle={() => void handleToggle(banner)}
                onDelete={() => setDeleteConfirm(banner)}
                onMoveUp={() => void moveBanner(index, -1)}
                onMoveDown={() => void moveBanner(index, 1)}
              />
            ))
          )}
        </Card.Content>
      </Card.Root>

      <Dialog open={Boolean(deleteConfirm)} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Remover banner</DialogTitle>
            <DialogDescription>
              Esse slide sera removido do hero. Se nao restar nenhum banner ativo, a home usara apenas o fallback neutro atual.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {deleteConfirm ? <BannerPreview banner={deleteConfirm} /> : null}
            {deleteConfirm?.linkHref ? (
              <a
                href={deleteConfirm.linkHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:text-primary/80"
              >
                Ver destino
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : null}
          </div>
          <DialogFooter>
            <Button color="secondary" size="sm" onClick={() => setDeleteConfirm(null)}>Cancelar</Button>
            <Button
              color="error"
              size="sm"
              onClick={() => deleteConfirm && void handleDelete(deleteConfirm)}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Remover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
