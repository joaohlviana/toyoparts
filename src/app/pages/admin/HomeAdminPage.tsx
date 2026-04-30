import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Clock3,
  ExternalLink,
  Eye,
  GripVertical,
  Loader2,
  Megaphone,
  Plus,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  Store,
  Trash2,
  Undo2,
  UploadCloud,
} from 'lucide-react';
import { toast } from 'sonner';
import { projectId, publicAnonKey } from '../../../../utils/supabase/info';
import { Badge } from '../../components/base/badge';
import { Button } from '../../components/base/button';
import { Card } from '../../components/base/card';
import { Input } from '../../components/base/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Textarea } from '../../components/ui/textarea';
import {
  fetchHomeAdminBundle,
  previewHomeDraft,
  publishHomeDraft,
  restorePublishedHome,
  saveHomeDraft,
  searchHomePickerProducts,
} from '../../lib/home-admin';
import {
  catSlugify,
  getRenderableCategoryImage,
  getHomeDepartmentCandidates,
  getSelectableCategories,
  markCategoryImageUrlBroken,
  type HomeDepartmentCategoryNode as CategoryNode,
} from '../../lib/home-departments';
import type {
  HomeAdminConfigBundle,
  HomeConfigResolvedProduct,
  HomeConfigResolvedSection,
  HomeMerchandisingSectionConfig,
  HomePageConfig,
  HomePickerProduct,
  HomeRuleCondition,
  HomeRuleConditionType,
  HomeRuleGroup,
  HomeSmallBannerConfig,
  HomeSmallBannerTheme,
} from '../../lib/home-config';

const API = `https://${projectId}.supabase.co/functions/v1/make-server-1d6e33e0`;
const HEADERS: HeadersInit = {
  Authorization: `Bearer ${publicAnonKey}`,
  apikey: publicAnonKey,
  'Content-Type': 'application/json',
};

function sortDepartmentCategories(categories: CategoryNode[], images: Record<string, string>) {
  return [...categories].sort((a, b) => {
    const aHasImage = !!getRenderableCategoryImage(a.name, images);
    const bHasImage = !!getRenderableCategoryImage(b.name, images);
    if (aHasImage !== bHasImage) return aHasImage ? -1 : 1;
    const countDiff = Number(b.product_count || 0) - Number(a.product_count || 0);
    if (countDiff !== 0) return countDiff;
    const levelDiff = Number(a.level || 0) - Number(b.level || 0);
    if (levelDiff !== 0) return levelDiff;
    return a.name.localeCompare(b.name, 'pt-BR');
  });
}

const FEATURED_CATEGORY_ORDER = [
  'acessorios-externos',
  'acessorios-interiores',
  'pecas',
  'iluminacao',
  'acessorios-pick-up-e-suv',
  'outlet',
  'ofertas',
  'itens-promocionais',
];

const HOME_DEPARTMENT_DEFAULT_LIMIT = 15;

function getDailySeed() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const d = now.getDate();
  return Number(`${y}${String(m).padStart(2, '0')}${String(d).padStart(2, '0')}`);
}

function shuffleWithSeed<T>(items: T[], seed: number): T[] {
  let state = seed || 1;
  const next = () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };

  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const nextIndex = Math.floor(next() * (index + 1));
    [copy[index], copy[nextIndex]] = [copy[nextIndex], copy[index]];
  }
  return copy;
}

function getAutoHomeDepartments(categories: CategoryNode[], images: Record<string, string>) {
  const scoreCategory = (category: CategoryNode) => {
    const orderIndex = FEATURED_CATEGORY_ORDER.indexOf(catSlugify(category.name));
    return orderIndex === -1 ? FEATURED_CATEGORY_ORDER.length + 1 : orderIndex;
  };

  const ranked = categories
    .filter((category) => !!getRenderableCategoryImage(category.name, images))
    .sort((a, b) => {
      const aScore = scoreCategory(a);
      const bScore = scoreCategory(b);
      if (aScore !== bScore) return aScore - bScore;
      return Number(b.product_count || 0) - Number(a.product_count || 0);
    });

  return shuffleWithSeed(ranked, getDailySeed());
}

function parseSkuTextarea(value: string) {
  return Array.from(
    new Set(
      String(value || '')
        .split(/[\n,;]+/g)
        .map((item) => item.trim().toUpperCase())
        .filter(Boolean),
    ),
  );
}

function skuTextareaValue(skus: string[]) {
  return (skus || []).join('\n');
}

function createGroup(): HomeRuleGroup {
  return {
    id: `group-${crypto.randomUUID()}`,
    conditions: [{ id: `cond-${crypto.randomUUID()}`, type: 'in_stock' }],
  };
}

function createCondition(type: HomeRuleConditionType = 'in_stock'): HomeRuleCondition {
  if (type === 'price_range') {
    return { id: `cond-${crypto.randomUUID()}`, type, minPrice: null, maxPrice: null };
  }
  if (type === 'category_in' || type === 'category_not_in' || type === 'sku_in' || type === 'sku_not_in') {
    return { id: `cond-${crypto.randomUUID()}`, type, values: [] };
  }
  return { id: `cond-${crypto.randomUUID()}`, type };
}

function formatDateTimeInput(value?: string | null) {
  if (!value) return '';
  return String(value).slice(0, 16);
}

function SmallMuted({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted-foreground">{children}</p>;
}

function SectionCard({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card.Root className="overflow-visible">
      <Card.Header className="bg-secondary/20">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <Card.Title className="text-base">{title}</Card.Title>
            {description ? <Card.Description className="mt-1">{description}</Card.Description> : null}
          </div>
          {actions}
        </div>
      </Card.Header>
      <Card.Content className="space-y-5">{children}</Card.Content>
    </Card.Root>
  );
}

function ProductPreviewTile({ product }: { product: HomeConfigResolvedProduct | HomePickerProduct }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-start gap-3">
        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-secondary/40">
          {product.image_url ? (
            <img src={product.image_url} alt={product.name} className="h-full w-full object-cover" loading="lazy" />
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-xs font-bold text-foreground">{product.sku}</p>
            {'reasonLabel' in product && product.reasonLabel ? (
              <Badge variant="pill-color" color={product.reason === 'pinned' ? 'success' : 'primary'} size="sm">
                {product.reasonLabel}
              </Badge>
            ) : null}
          </div>
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{product.name}</p>
        </div>
      </div>
    </div>
  );
}

function themePreviewClasses(theme: HomeSmallBannerTheme) {
  if (theme === 'light') {
    return {
      wrapper: 'bg-muted/60 text-foreground',
      overline: 'text-muted-foreground/70',
      cta: 'text-muted-foreground',
      overlay: '',
    };
  }
  if (theme === 'primary') {
    return {
      wrapper: 'bg-primary text-white',
      overline: 'text-white/60',
      cta: 'text-white/70',
      overlay: 'bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.15),transparent)]',
    };
  }
  return {
    wrapper: 'bg-[#0a0a0a] text-white',
    overline: 'text-white/30',
    cta: 'text-white/50',
    overlay: 'bg-[radial-gradient(ellipse_at_top_right,rgba(235,10,30,0.15),transparent)]',
  };
}

function ProductSearchPicker({
  onPin,
  onExclude,
}: {
  onPin: (sku: string) => void;
  onExclude: (sku: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<HomePickerProduct[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const hits = await searchHomePickerProducts(query.trim());
        if (!cancelled) setResults(hits);
      } catch (error: any) {
        if (!cancelled) toast.error(error.message || 'Falha ao buscar produtos');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  return (
    <div className="rounded-xl border border-border bg-secondary/10 p-4">
      <p className="text-sm font-semibold text-foreground">Picker de produto</p>
      <SmallMuted>Busque por SKU ou nome e adicione como fixo ou excluido.</SmallMuted>
      <div className="mt-3">
        <Input value={query} onChange={(event) => setQuery(event.target.value)} iconLeading={Search} placeholder="Buscar SKU ou nome" />
      </div>
      {loading ? (
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Buscando produtos...
        </div>
      ) : results.length > 0 ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {results.map((product) => (
            <div key={product.sku} className="rounded-xl border border-border bg-card p-3">
              <ProductPreviewTile product={product} />
              <div className="mt-3 flex gap-2">
                <Button size="sm" color="secondary" onClick={() => onPin(product.sku)}>
                  Fixar
                </Button>
                <Button size="sm" color="secondary" onClick={() => onExclude(product.sku)}>
                  Excluir
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : query.trim().length >= 2 ? (
        <p className="mt-3 text-xs text-muted-foreground">Nenhum produto encontrado para essa busca.</p>
      ) : null}
    </div>
  );
}

function ConditionEditor({
  condition,
  onChange,
  onRemove,
}: {
  condition: HomeRuleCondition;
  onChange: (next: HomeRuleCondition) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="grid gap-3 lg:grid-cols-[220px_1fr_auto]">
        <Select
          value={condition.type}
          onValueChange={(value) => {
            const nextType = value as HomeRuleConditionType;
            onChange({ ...createCondition(nextType), id: condition.id });
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Condicao" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="in_stock">Em estoque</SelectItem>
            <SelectItem value="has_promotion">Com promocao valida</SelectItem>
            <SelectItem value="category_in">Categoria em</SelectItem>
            <SelectItem value="category_not_in">Categoria fora de</SelectItem>
            <SelectItem value="price_range">Faixa de preco</SelectItem>
            <SelectItem value="sku_in">SKU em lista</SelectItem>
            <SelectItem value="sku_not_in">SKU fora de lista</SelectItem>
          </SelectContent>
        </Select>

        {condition.type === 'price_range' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              type="number"
              value={condition.minPrice ?? ''}
              onChange={(event) => onChange({ ...condition, minPrice: Number(event.target.value || 0) || null })}
              placeholder="Preco minimo"
            />
            <Input
              type="number"
              value={condition.maxPrice ?? ''}
              onChange={(event) => onChange({ ...condition, maxPrice: Number(event.target.value || 0) || null })}
              placeholder="Preco maximo"
            />
          </div>
        ) : condition.type === 'category_in' || condition.type === 'category_not_in' ? (
          <Input
            value={(condition.values || []).join(', ')}
            onChange={(event) => onChange({ ...condition, values: parseSkuTextarea(event.target.value).map((value) => value.replace(/[^0-9]/g, '')).filter(Boolean) })}
            placeholder="IDs de categoria separados por virgula"
          />
        ) : condition.type === 'sku_in' || condition.type === 'sku_not_in' ? (
          <Textarea
            value={skuTextareaValue(condition.values || [])}
            onChange={(event) => onChange({ ...condition, values: parseSkuTextarea(event.target.value) })}
            className="min-h-[76px]"
            placeholder="Cole os SKUs, um por linha"
          />
        ) : (
          <div className="flex items-center rounded-lg border border-dashed border-border px-3 text-xs text-muted-foreground">
            Sem parametros adicionais para essa condicao.
          </div>
        )}

        <Button size="sm" color="secondary" onClick={onRemove} iconLeading={<Trash2 className="h-4 w-4" />}>
          Remover
        </Button>
      </div>
    </div>
  );
}

function ProductSectionEditor({
  title,
  description,
  config,
  resolved,
  onChange,
}: {
  title: string;
  description: string;
  config: HomeMerchandisingSectionConfig;
  resolved?: HomeConfigResolvedSection | null;
  onChange: (next: HomeMerchandisingSectionConfig) => void;
}) {
  const updateGroup = (groupId: string, nextGroup: HomeRuleGroup) => {
    onChange({
      ...config,
      ruleGroups: config.ruleGroups.map((group) => (group.id === groupId ? nextGroup : group)),
    });
  };

  return (
    <SectionCard title={title} description={description}>
      <div className="grid gap-4 xl:grid-cols-[1fr_1fr_140px_160px]">
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Titulo</label>
          <Input value={config.title} onChange={(event) => onChange({ ...config, title: event.target.value })} />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Subtitulo</label>
          <Input value={config.subtitle} onChange={(event) => onChange({ ...config, subtitle: event.target.value })} />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Limite</label>
          <Input
            type="number"
            min={1}
            max={20}
            value={String(config.limit)}
            onChange={(event) => onChange({ ...config, limit: Math.min(20, Math.max(1, Number(event.target.value || config.limit))) })}
          />
        </div>
        <label className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm font-semibold text-foreground">
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(event) => onChange({ ...config, enabled: event.target.checked })}
            className="h-4 w-4 rounded border-border"
          />
          Secao ativa
        </label>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr_140px]">
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Origem</label>
          <Select value={config.source} onValueChange={(value) => onChange({ ...config, source: value as HomeMerchandisingSectionConfig['source'] })}>
            <SelectTrigger><SelectValue placeholder="Selecione a origem" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="manual_only">Somente produtos fixos</SelectItem>
              <SelectItem value="catalog">Catalogo</SelectItem>
              <SelectItem value="top_searched">Mais buscados</SelectItem>
              <SelectItem value="top_promotions">Promocoes entre mais buscados</SelectItem>
              <SelectItem value="newest">Mais novos</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ordenacao</label>
          <Select value={config.sort} onValueChange={(value) => onChange({ ...config, sort: value as HomeMerchandisingSectionConfig['sort'] })}>
            <SelectTrigger><SelectValue placeholder="Selecione a ordenacao" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="intelligence_rank">Inteligencia</SelectItem>
              <SelectItem value="newest_desc">Mais novos</SelectItem>
              <SelectItem value="discount_desc">Maior desconto</SelectItem>
              <SelectItem value="price_desc">Maior preco</SelectItem>
              <SelectItem value="price_asc">Menor preco</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Janela (dias)</label>
          <Input
            type="number"
            min={1}
            max={90}
            value={String(config.lookbackDays)}
            onChange={(event) => onChange({ ...config, lookbackDays: Math.min(90, Math.max(1, Number(event.target.value || config.lookbackDays))) })}
          />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Iniciar exibicao</label>
          <Input
            type="datetime-local"
            value={formatDateTimeInput(config.schedule?.startAt)}
            onChange={(event) => onChange({ ...config, schedule: { ...config.schedule, startAt: event.target.value || null } })}
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Encerrar exibicao</label>
          <Input
            type="datetime-local"
            value={formatDateTimeInput(config.schedule?.endAt)}
            onChange={(event) => onChange({ ...config, schedule: { ...config.schedule, endAt: event.target.value || null } })}
          />
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-secondary/10 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Logica comercial</p>
            <SmallMuted>E dentro de cada grupo. OU entre grupos.</SmallMuted>
          </div>
          <Button size="sm" color="secondary" onClick={() => onChange({ ...config, ruleGroups: [...config.ruleGroups, createGroup()] })} iconLeading={<Plus className="h-4 w-4" />}>
            Adicionar grupo
          </Button>
        </div>
        <div className="mt-4 space-y-4">
          {config.ruleGroups.map((group, groupIndex) => (
            <div key={group.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">Grupo {groupIndex + 1}</p>
                  <SmallMuted>Todos os filtros abaixo precisam ser verdadeiros.</SmallMuted>
                </div>
                <div className="flex items-center gap-2">
                  {groupIndex > 0 ? (
                    <Badge variant="pill-color" color="primary" size="sm">OU</Badge>
                  ) : null}
                  <Button
                    size="sm"
                    color="secondary"
                    onClick={() => onChange({ ...config, ruleGroups: config.ruleGroups.filter((item) => item.id !== group.id) })}
                    iconLeading={<Trash2 className="h-4 w-4" />}
                  >
                    Remover grupo
                  </Button>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {group.conditions.map((condition) => (
                  <ConditionEditor
                    key={condition.id}
                    condition={condition}
                    onChange={(nextCondition) =>
                      updateGroup(group.id, {
                        ...group,
                        conditions: group.conditions.map((item) => (item.id === condition.id ? nextCondition : item)),
                      })
                    }
                    onRemove={() =>
                      updateGroup(group.id, {
                        ...group,
                        conditions: group.conditions.filter((item) => item.id !== condition.id),
                      })
                    }
                  />
                ))}
              </div>

              <div className="mt-4">
                <Button
                  size="sm"
                  color="secondary"
                  onClick={() => updateGroup(group.id, { ...group, conditions: [...group.conditions, createCondition('in_stock')] })}
                  iconLeading={<Plus className="h-4 w-4" />}
                >
                  Adicionar condicao
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-border bg-secondary/10 p-4">
          <p className="text-sm font-semibold text-foreground">Produtos fixos</p>
          <SmallMuted>Esses SKUs sempre entram primeiro, respeitando exclusoes.</SmallMuted>
          <div className="mt-3">
            <Textarea
              value={skuTextareaValue(config.pinnedSkus)}
              onChange={(event) => onChange({ ...config, pinnedSkus: parseSkuTextarea(event.target.value) })}
              className="min-h-[124px]"
              placeholder="Cole os SKUs fixos, um por linha"
            />
          </div>
          {config.pinnedSkus.length > 0 ? (
            <div className="mt-3 space-y-2">
              {config.pinnedSkus.map((sku, index) => (
                <div key={sku} className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{sku}</span>
                  {resolved?.missingPinnedSkus?.includes(sku) ? (
                    <Badge variant="pill-color" color="warning" size="sm">Nao encontrado</Badge>
                  ) : null}
                  <Button size="sm" color="secondary" disabled={index === 0} onClick={() => {
                    const next = [...config.pinnedSkus];
                    [next[index - 1], next[index]] = [next[index], next[index - 1]];
                    onChange({ ...config, pinnedSkus: next });
                  }} iconLeading={<ArrowUp className="h-4 w-4" />}>Subir</Button>
                  <Button size="sm" color="secondary" disabled={index === config.pinnedSkus.length - 1} onClick={() => {
                    const next = [...config.pinnedSkus];
                    [next[index + 1], next[index]] = [next[index], next[index + 1]];
                    onChange({ ...config, pinnedSkus: next });
                  }} iconLeading={<ArrowDown className="h-4 w-4" />}>Descer</Button>
                  <Button size="sm" color="secondary" onClick={() => onChange({ ...config, pinnedSkus: config.pinnedSkus.filter((item) => item !== sku) })} iconLeading={<Trash2 className="h-4 w-4" />}>Remover</Button>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl border border-border bg-secondary/10 p-4">
          <p className="text-sm font-semibold text-foreground">SKUs excluidos</p>
          <SmallMuted>Esses produtos nunca entram, mesmo quando seriam fixados ou encontrados pela regra.</SmallMuted>
          <div className="mt-3">
            <Textarea
              value={skuTextareaValue(config.excludedSkus)}
              onChange={(event) => onChange({ ...config, excludedSkus: parseSkuTextarea(event.target.value) })}
              className="min-h-[124px]"
              placeholder="Cole os SKUs que devem ficar fora"
            />
          </div>
          {config.excludedSkus.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {config.excludedSkus.map((sku) => (
                <Badge key={sku} variant="pill-color" color="gray" size="sm">{sku}</Badge>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <ProductSearchPicker
        onPin={(sku) => onChange({ ...config, pinnedSkus: Array.from(new Set([...config.pinnedSkus, sku])) })}
        onExclude={(sku) => onChange({ ...config, excludedSkus: Array.from(new Set([...config.excludedSkus, sku])) })}
      />

      <div className="rounded-2xl border border-border bg-secondary/10 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Preview resolvido</p>
            <SmallMuted>{resolved?.active ? `${resolved.matchedBeforeLimit} produtos encontrados pela regra antes do limite.` : 'Secao inativa ou fora da janela.'}</SmallMuted>
          </div>
          <Badge variant="pill-color" color={resolved?.active ? 'success' : 'gray'} size="sm">
            {resolved?.products?.length || 0} produtos finais
          </Badge>
        </div>
        {resolved?.products?.length ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {resolved.products.map((product) => <ProductPreviewTile key={`${product.reason}-${product.sku}`} product={product} />)}
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">Nenhum produto entrou nessa secao com a configuracao atual.</p>
        )}
      </div>
    </SectionCard>
  );
}

export function HomeAdminPage() {
  const [draft, setDraft] = useState<HomePageConfig | null>(null);
  const [published, setPublished] = useState<HomePageConfig | null>(null);
  const [resolvedDraft, setResolvedDraft] = useState<HomeAdminConfigBundle['resolvedDraft'] | null>(null);
  const [resolvedPublished, setResolvedPublished] = useState<HomeAdminConfigBundle['resolvedPublished'] | null>(null);
  const [meta, setMeta] = useState<HomeAdminConfigBundle['meta'] | null>(null);
  const [legacyBackend, setLegacyBackend] = useState(false);
  const [categoryTree, setCategoryTree] = useState<CategoryNode | null>(null);
  const [categoryImages, setCategoryImages] = useState<Record<string, string>>({});
  const [departmentImageValidationVersion, setDepartmentImageValidationVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [departmentQuery, setDepartmentQuery] = useState('');

  const handleDepartmentImageError = useCallback((imageUrl?: string | null) => {
    if (markCategoryImageUrlBroken(imageUrl)) {
      setDepartmentImageValidationVersion((current) => current + 1);
    }
  }, []);

  const applyBundle = useCallback((bundle: HomeAdminConfigBundle) => {
    setDraft(bundle.draft);
    setPublished(bundle.published);
    setResolvedDraft(bundle.resolvedDraft);
    setResolvedPublished(bundle.resolvedPublished);
    setMeta(bundle.meta);
    setLegacyBackend(Boolean(bundle.legacyBackend));
  }, []);

  const loadPage = useCallback(async () => {
    setLoadError(null);
    const [bundleResult, treeResult, imageResult] = await Promise.allSettled([
      fetchHomeAdminBundle(),
      fetch(`${API}/categories/tree`, { headers: HEADERS }),
      fetch(`${API}/categories/images`, { headers: HEADERS }),
    ]);

    if (bundleResult.status === 'fulfilled') {
      applyBundle(bundleResult.value);
    } else {
      console.error('[home-admin] bundle load failed:', bundleResult.reason);
      setLoadError(bundleResult.reason?.message || 'Falha ao carregar a configuracao da pagina inicial.');
    }

    if (treeResult.status === 'fulfilled') {
      try {
        const nextTree = treeResult.value.ok ? await treeResult.value.json() : null;
        setCategoryTree(nextTree);
      } catch (error) {
        console.error('[home-admin] categories tree parse failed:', error);
      }
    } else {
      console.error('[home-admin] categories tree load failed:', treeResult.reason);
    }

    if (imageResult.status === 'fulfilled') {
      try {
        const nextImages = imageResult.value.ok ? await imageResult.value.json() : { images: {} };
        setCategoryImages(nextImages.images || {});
      } catch (error) {
        console.error('[home-admin] categories images parse failed:', error);
      }
    } else {
      console.error('[home-admin] categories images load failed:', imageResult.reason);
    }
  }, [applyBundle]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadPage();
      } catch (error: any) {
        if (!cancelled) toast.error(error.message || 'Falha ao carregar pagina inicial');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadPage]);

  const allActiveCategories = useMemo(() => getSelectableCategories(categoryTree), [categoryTree]);
  const homeDepartmentCandidates = useMemo(() => getHomeDepartmentCandidates(categoryTree), [categoryTree]);
  const availableCategoryPool = useMemo(
    () => sortDepartmentCategories(homeDepartmentCandidates, categoryImages).filter((category) => !!getRenderableCategoryImage(category.name, categoryImages)),
    [homeDepartmentCandidates, categoryImages, departmentImageValidationVersion],
  );
  const homeDepartmentMap = useMemo(
    () => new Map(homeDepartmentCandidates.map((category) => [String(category.id), category])),
    [homeDepartmentCandidates],
  );
  const categoryMap = useMemo(() => new Map(allActiveCategories.map((category) => [String(category.id), category])), [allActiveCategories]);
  const filteredAvailableDepartments = useMemo(() => {
    const query = departmentQuery.trim().toLowerCase();
    const selected = new Set(draft?.departments.selectedCategoryIds || []);
    const filtered = availableCategoryPool.filter((category) => {
      if (selected.has(String(category.id))) return false;
      return category.name.toLowerCase().includes(query) || String(category.id).includes(query);
    });
    return filtered.slice(0, query ? 120 : 60);
  }, [availableCategoryPool, departmentQuery, draft?.departments.selectedCategoryIds]);
  const selectedDepartments = useMemo(() => {
    const selectedIds = draft?.departments.selectedCategoryIds || [];
    return selectedIds.map((id) => categoryMap.get(String(id))).filter(Boolean) as CategoryNode[];
  }, [categoryMap, draft?.departments.selectedCategoryIds]);
  const selectedDepartmentsWithImages = useMemo(
    () => selectedDepartments.filter((category) => !!getRenderableCategoryImage(category.name, categoryImages)),
    [categoryImages, departmentImageValidationVersion, selectedDepartments],
  );
  const selectedDepartmentsOutsideHome = useMemo(
    () => selectedDepartments.filter((category) => !homeDepartmentMap.has(String(category.id))),
    [homeDepartmentMap, selectedDepartments],
  );
  const selectedHomeEligibleDepartments = useMemo(() => {
    const selectedIds = draft?.departments.selectedCategoryIds || [];
    return selectedIds
      .map((id) => homeDepartmentMap.get(String(id)))
      .filter((category): category is CategoryNode => Boolean(category))
      .filter((category) => !!getRenderableCategoryImage(category.name, categoryImages));
  }, [categoryImages, departmentImageValidationVersion, draft?.departments.selectedCategoryIds, homeDepartmentMap]);
  const effectiveHomeDepartments = useMemo(() => {
    const automatic = getAutoHomeDepartments(homeDepartmentCandidates, categoryImages);
    const selectedIds = draft?.departments.selectedCategoryIds || [];
    const configuredLimit = draft?.departments.limit || HOME_DEPARTMENT_DEFAULT_LIMIT;
    const limit = Math.max(1, configuredLimit);

    if (selectedIds.length === 0) {
      return automatic.slice(0, limit);
    }

    const remainingWithImages = automatic.filter((category) => !selectedIds.includes(String(category.id)));
    return [...selectedHomeEligibleDepartments, ...remainingWithImages].slice(0, limit);
  }, [
    categoryImages,
    departmentImageValidationVersion,
    draft?.departments.limit,
    draft?.departments.selectedCategoryIds,
    homeDepartmentCandidates,
    selectedHomeEligibleDepartments,
  ]);

  if (loading) {
    return (
      <div className="mx-auto max-w-[1360px] px-4 py-6 lg:px-6">
        <div className="flex min-h-[50vh] items-center justify-center rounded-3xl border border-border bg-card">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando central de merchandising da home...
          </div>
        </div>
      </div>
    );
  }

  if (!draft || !published || !meta) {
    return (
      <div className="mx-auto max-w-[1360px] px-4 py-6 lg:px-6">
        <div className="rounded-3xl border border-border bg-card p-6">
          <p className="text-sm font-semibold text-foreground">Nao foi possivel carregar a central da home.</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {loadError || 'A configuracao da pagina inicial nao respondeu como esperado.'}
          </p>
          <div className="mt-4">
            <Button color="secondary" iconLeading={<RefreshCw className="h-4 w-4" />} onClick={() => {
              setLoading(true);
              void loadPage().finally(() => setLoading(false));
            }}>
              Tentar novamente
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1360px] px-4 py-6 lg:px-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Merchandising</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">Pagina inicial</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Ajuste os blocos que a home publica ja usa hoje: departamentos com imagem, banners pequenos e os trilhos de produtos. O hero principal continua separado em Banners Hero.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge variant="pill-color" color={meta.hasDraftChanges ? 'warning' : 'success'} size="sm">
              {meta.hasDraftChanges ? 'Rascunho com alteracoes pendentes' : 'Rascunho publicado'}
            </Badge>
            <Badge variant="pill-color" color="gray" size="sm">
              Publicado em: {meta.publishedAt ? new Date(meta.publishedAt).toLocaleString('pt-BR') : 'nunca'}
            </Badge>
          </div>
      </div>

      {legacyBackend ? (
        <div className="mt-4 rounded-2xl border border-warning/30 bg-warning/10 p-4">
          <p className="text-sm font-semibold text-warning">Modo de compatibilidade ativo</p>
          <p className="mt-1 text-sm text-warning/90">
            O backend novo da central da home ainda nao esta publicado neste ambiente. A tela agora abre corretamente em modo leitura,
            mas as acoes de preview, salvar, restaurar e publicar ficam desabilitadas ate o deploy do backend.
          </p>
        </div>
      ) : null}

      <div className="mt-4 rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">Coerencia com a home atual</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Esta tela nao controla o hero principal. Ela organiza departamentos, banners pequenos e os trilhos da home existente.
            </p>
          </div>
          <Button color="secondary" iconLeading={<ExternalLink className="h-4 w-4" />} onClick={() => window.location.assign('/admin?page=banners')}>
            Abrir Banners Hero
          </Button>
        </div>
      </div>

      {meta.resolutionWarning ? (
        <div className="mt-4 rounded-2xl border border-warning/30 bg-warning/10 p-4">
          <p className="text-sm font-semibold text-warning">Preview em modo seguro</p>
          <p className="mt-1 text-sm text-warning/90">{meta.resolutionWarning}</p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Button color="secondary" iconLeading={<RefreshCw className="h-4 w-4" />} onClick={loadPage}>Recarregar</Button>
        <Button color="secondary" iconLeading={<ExternalLink className="h-4 w-4" />} onClick={() => window.open('/', '_blank', 'noopener,noreferrer')}>Ver home</Button>
        <Button color="secondary" iconLeading={<Eye className="h-4 w-4" />} isLoading={previewing} disabled={legacyBackend} onClick={async () => {
            setPreviewing(true);
            try {
              const preview = await previewHomeDraft(draft);
              setResolvedDraft(preview.resolved);
              const previewMeta = (preview as any)?.meta;
              if (previewMeta) {
                setMeta((current) => current ? {
                  ...current,
                  resolutionWarning: previewMeta.resolutionWarning || null,
                  resolutionDegraded: Boolean(previewMeta.resolutionDegraded),
                } : current);
              }
              toast.success('Preview da home atualizado');
            } catch (error: any) {
              toast.error(error.message || 'Falha ao gerar preview');
            } finally {
              setPreviewing(false);
            }
          }}>Pre-visualizar</Button>
          <Button color="secondary" iconLeading={<Undo2 className="h-4 w-4" />} disabled={legacyBackend} onClick={async () => {
            if (!window.confirm('Restaurar o rascunho com base na ultima versao publicada?')) return;
            try {
              const bundle = await restorePublishedHome();
              applyBundle(bundle);
              toast.success('Rascunho restaurado com a ultima publicacao');
            } catch (error: any) {
              toast.error(error.message || 'Falha ao restaurar rascunho');
            }
          }}>Restaurar ultima publicacao</Button>
          <Button iconLeading={<Save className="h-4 w-4" />} isLoading={saving} disabled={legacyBackend} onClick={async () => {
            setSaving(true);
            try {
              const bundle = await saveHomeDraft(draft);
              applyBundle(bundle);
              toast.success('Rascunho salvo');
            } catch (error: any) {
              toast.error(error.message || 'Falha ao salvar rascunho');
            } finally {
              setSaving(false);
            }
          }}>Salvar rascunho</Button>
          <Button iconLeading={<UploadCloud className="h-4 w-4" />} isLoading={publishing} disabled={legacyBackend} onClick={async () => {
            setPublishing(true);
            try {
              const bundle = await publishHomeDraft();
              applyBundle(bundle);
              toast.success('Home publicada com sucesso');
            } catch (error: any) {
              toast.error(error.message || 'Falha ao publicar home');
            } finally {
              setPublishing(false);
            }
          }}>Publicar</Button>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[
          { label: 'Departamentos na home', value: effectiveHomeDepartments.length, icon: Store },
          { label: 'Banners ativos', value: draft.smallBanners.filter((item) => item.active).length, icon: Megaphone },
          { label: 'Produtos fixos', value: draft.offers.pinnedSkus.length + draft.popular.pinnedSkus.length + draft.newArrivals.pinnedSkus.length, icon: Sparkles },
          { label: 'Exclusoes', value: draft.offers.excludedSkus.length + draft.popular.excludedSkus.length + draft.newArrivals.excludedSkus.length, icon: Trash2 },
          { label: 'Publicacao atual', value: resolvedPublished ? resolvedPublished.offers.products.length + resolvedPublished.popular.products.length + resolvedPublished.newArrivals.products.length : 0, icon: Clock3 },
        ].map((item) => (
          <div key={item.label} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{item.label}</p>
              <item.icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="mt-3 text-2xl font-bold text-foreground">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 space-y-6">
        <SectionCard
          title="Departamentos da home"
          description="A home publica mostra apenas categorias com imagem valida no catalogo atual. Se existirem menos itens com imagem, a grade fica menor."
          actions={
            <div className="w-full sm:w-[260px]">
              <Input value={departmentQuery} onChange={(event) => setDepartmentQuery(event.target.value)} iconLeading={Search} placeholder="Buscar departamento" />
            </div>
          }
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Selecionados com imagem</p>
              <p className="mt-2 text-2xl font-bold text-foreground">{selectedDepartmentsWithImages.length}</p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Selecionados fora da home</p>
              <p className="mt-2 text-2xl font-bold text-foreground">{selectedDepartmentsOutsideHome.length}</p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Visiveis hoje na home</p>
              <p className="mt-2 text-2xl font-bold text-foreground">{effectiveHomeDepartments.length}</p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Pool com imagem</p>
              <p className="mt-2 text-2xl font-bold text-foreground">{availableCategoryPool.length}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-sm font-semibold text-foreground">Leitura atual da home</p>
            <SmallMuted>A ordem abaixo replica a regra da home publica de hoje, sem completar a grade com categorias sem imagem.</SmallMuted>
            {effectiveHomeDepartments.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {effectiveHomeDepartments.map((category, index) => (
                  <Badge key={`${category.id}-${index}`} variant="pill-color" color="gray" size="sm">
                    {index + 1}. {category.name}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">Nenhum departamento elegivel com imagem foi encontrado para a home atual.</p>
            )}
          </div>

          <div className="grid gap-5 xl:grid-cols-[1.1fr_1fr]">
            <div className="rounded-2xl border border-border bg-secondary/10 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">Selecionados</p>
                  <SmallMuted>A ordem abaixo define a prioridade manual. A home so rende os que possuem imagem e usa apenas categorias elegiveis do catalogo atual.</SmallMuted>
                </div>
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={String(draft.departments.limit)}
                  onChange={(event) => setDraft({ ...draft, departments: { ...draft.departments, limit: Math.min(20, Math.max(1, Number(event.target.value || draft.departments.limit))) } })}
                  className="w-24"
                />
              </div>

              <div className="mt-4 space-y-3">
                {selectedDepartments.length > 0 ? (
                  selectedDepartments.map((category, index) => {
                    const imageUrl = getRenderableCategoryImage(category.name, categoryImages);
                    return (
                      <div key={category.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
                        <GripVertical className="h-4 w-4 text-muted-foreground" />
                        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-secondary/40">
                          {imageUrl ? (
                            <img
                              src={imageUrl}
                              alt={category.name}
                              className="h-full w-full object-cover"
                              loading="lazy"
                              onError={() => handleDepartmentImageError(imageUrl)}
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center px-2 text-center text-[10px] font-medium text-muted-foreground">
                              Sem foto
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-foreground">{category.name}</p>
                          <p className="mt-1 text-xs text-muted-foreground">#{category.id} - {category.product_count || 0} produtos</p>
                          {selectedDepartmentsOutsideHome.some((item) => item.id === category.id) ? (
                            <p className="mt-1 text-xs font-medium text-warning">Fora da malha atual da home: esse item nao entra no bloco de departamentos.</p>
                          ) : null}
                          {!imageUrl ? (
                            <p className="mt-1 text-xs font-medium text-warning">Sem foto válida: esse item fica fora da home e do mega menu.</p>
                          ) : null}
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" color="secondary" disabled={index === 0} iconLeading={<ArrowUp className="h-4 w-4" />} onClick={() => {
                            const next = [...draft.departments.selectedCategoryIds];
                            [next[index - 1], next[index]] = [next[index], next[index - 1]];
                            setDraft({ ...draft, departments: { ...draft.departments, selectedCategoryIds: next } });
                          }}>Subir</Button>
                          <Button size="sm" color="secondary" disabled={index === selectedDepartments.length - 1} iconLeading={<ArrowDown className="h-4 w-4" />} onClick={() => {
                            const next = [...draft.departments.selectedCategoryIds];
                            [next[index + 1], next[index]] = [next[index], next[index + 1]];
                            setDraft({ ...draft, departments: { ...draft.departments, selectedCategoryIds: next } });
                          }}>Descer</Button>
                          <Button size="sm" color="secondary" iconLeading={<Trash2 className="h-4 w-4" />} onClick={() => setDraft({ ...draft, departments: { ...draft.departments, selectedCategoryIds: draft.departments.selectedCategoryIds.filter((item) => item !== String(category.id)) } })}>Remover</Button>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-xl border border-dashed border-border bg-card p-5 text-sm text-muted-foreground">
                    Nenhum departamento foi selecionado manualmente ainda. Nesse caso, a home usa a lista automatica de categorias com imagem.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-secondary/10 p-4">
              <p className="text-sm font-semibold text-foreground">Disponiveis para adicionar</p>
              <SmallMuted>Somente categorias com imagem entram na home atual. Esta busca respeita exatamente essa regra.</SmallMuted>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {filteredAvailableDepartments.map((category) => {
                  const imageUrl = getRenderableCategoryImage(category.name, categoryImages);
                  if (!imageUrl) return null;
                  return (
                    <button
                      key={category.id}
                      type="button"
                      onClick={() => setDraft({ ...draft, departments: { ...draft.departments, selectedCategoryIds: [...draft.departments.selectedCategoryIds, String(category.id)] } })}
                      className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
                    >
                      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-secondary/40">
                        <img
                          src={imageUrl}
                          alt={category.name}
                          className="h-full w-full object-cover"
                          loading="lazy"
                          onError={() => handleDepartmentImageError(imageUrl)}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-foreground">{category.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">#{category.id} - {category.product_count || 0} produtos</p>
                      </div>
                      <Plus className="h-4 w-4 shrink-0 text-primary" />
                    </button>
                  );
                })}
                {filteredAvailableDepartments.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border bg-card p-4 text-sm text-muted-foreground sm:col-span-2">
                    Nenhuma categoria encontrada com esse filtro.
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Banners pequenos" description="Atualize os dois blocos pequenos com CTA, imagem, tema e agendamento opcional.">
          <div className="grid gap-5 xl:grid-cols-2">
            {draft.smallBanners.map((banner, index) => {
              const theme = themePreviewClasses(banner.theme);
              const updateBanner = (patch: Partial<HomeSmallBannerConfig>) => {
                setDraft({
                  ...draft,
                  smallBanners: draft.smallBanners.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item),
                });
              };
              return (
                <div key={banner.id} className="rounded-2xl border border-border bg-secondary/10 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">Banner {index + 1}</p>
                      <SmallMuted>{banner.id}</SmallMuted>
                    </div>
                    <Button size="sm" color={banner.active ? 'secondary' : 'primary'} onClick={() => updateBanner({ active: !banner.active })}>
                      {banner.active ? 'Ativo' : 'Inativo'}
                    </Button>
                  </div>

                  <div className="mt-4 grid gap-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Overline</label>
                        <Input value={banner.overline} onChange={(event) => updateBanner({ overline: event.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">CTA</label>
                        <Input value={banner.ctaText} onChange={(event) => updateBanner({ ctaText: event.target.value })} />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Titulo</label>
                      <Textarea value={banner.title} onChange={(event) => updateBanner({ title: event.target.value })} className="min-h-[92px]" />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
                      <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Link</label>
                        <Input value={banner.href} onChange={(event) => updateBanner({ href: event.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tema</label>
                        <Select value={banner.theme} onValueChange={(value) => updateBanner({ theme: value as HomeSmallBannerTheme })}>
                          <SelectTrigger><SelectValue placeholder="Selecione o tema" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="dark">Escuro</SelectItem>
                            <SelectItem value="light">Claro</SelectItem>
                            <SelectItem value="primary">Vermelho</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                      <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tipo de CTA</label>
                        <Select value={banner.ctaKind || 'link'} onValueChange={(value) => updateBanner({ ctaKind: value as HomeSmallBannerConfig['ctaKind'] })}>
                          <SelectTrigger><SelectValue placeholder="Selecione o CTA" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="link">Link normal</SelectItem>
                            <SelectItem value="whatsapp">WhatsApp</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tracking ID</label>
                        <Input value={banner.trackingId || ''} onChange={(event) => updateBanner({ trackingId: event.target.value })} placeholder={banner.id} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">SKU vinculado</label>
                        <Input value={banner.linkedProductSku || ''} onChange={(event) => updateBanner({ linkedProductSku: event.target.value.toUpperCase() })} placeholder="SKU123" />
                      </div>
                      <label className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm font-semibold text-foreground">
                        <input
                          type="checkbox"
                          checked={banner.goalEnabled !== false}
                          onChange={(event) => updateBanner({ goalEnabled: event.target.checked })}
                          className="h-4 w-4 rounded border-border"
                        />
                        Meta ativa
                      </label>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Imagem opcional (URL)</label>
                      <Input value={banner.imageUrl || ''} onChange={(event) => updateBanner({ imageUrl: event.target.value })} placeholder="https://..." />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Inicio</label>
                        <Input type="datetime-local" value={formatDateTimeInput(banner.schedule?.startAt)} onChange={(event) => updateBanner({ schedule: { ...banner.schedule, startAt: event.target.value || null } })} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Fim</label>
                        <Input type="datetime-local" value={formatDateTimeInput(banner.schedule?.endAt)} onChange={(event) => updateBanner({ schedule: { ...banner.schedule, endAt: event.target.value || null } })} />
                      </div>
                    </div>

                    <div className={`relative overflow-hidden rounded-2xl p-6 ${theme.wrapper} ${banner.active ? '' : 'opacity-60'}`}>
                      {theme.overlay ? <div className={`absolute inset-0 ${theme.overlay}`} /> : null}
                      {banner.imageUrl ? <img src={banner.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-20" loading="lazy" /> : null}
                      <div className="relative z-10">
                        <p className={`text-[11px] font-medium uppercase tracking-[0.15em] ${theme.overline}`}>{banner.overline}</p>
                        <h3 className="mt-2 text-xl font-semibold tracking-tight">{banner.title}</h3>
                        <span className={`mt-3 inline-flex items-center gap-1 text-xs font-medium ${theme.cta}`}>
                          {banner.ctaText} <ExternalLink className="h-3.5 w-3.5" />
                        </span>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <Badge variant="pill-color" color={banner.ctaKind === 'whatsapp' ? 'success' : 'gray'} size="sm">
                            {banner.ctaKind === 'whatsapp' ? 'CTA WhatsApp' : 'CTA Link'}
                          </Badge>
                          <Badge variant="pill-color" color={banner.goalEnabled !== false ? 'primary' : 'warning'} size="sm">
                            {banner.goalEnabled !== false ? 'Meta ativa' : 'Meta desativada'}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </SectionCard>

        <ProductSectionEditor title="Ofertas especiais" description="Pins, exclusoes e regras para as ofertas da home." config={draft.offers} resolved={resolvedDraft?.offers} onChange={(next) => setDraft({ ...draft, offers: next })} />
        <ProductSectionEditor title="Mais procurados" description="Bloco focado em produtos com maior demanda." config={draft.popular} resolved={resolvedDraft?.popular} onChange={(next) => setDraft({ ...draft, popular: next })} />
        <ProductSectionEditor title="Novidades" description="Bloco de lancamentos e novidades do catalogo." config={draft.newArrivals} resolved={resolvedDraft?.newArrivals} onChange={(next) => setDraft({ ...draft, newArrivals: next })} />
      </div>
    </div>
  );
}
