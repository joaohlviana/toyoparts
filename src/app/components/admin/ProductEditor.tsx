import React, { useState, useEffect, useRef } from 'react';
import { 
  X, Save, Layout, Tag, DollarSign, Package, Truck, 
  FileText, Search, Settings, Image as ImageIcon,
  AlertTriangle, Check, Plus, Trash2, ArrowRight
} from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { useForm, Controller, useFieldArray } from 'react-hook-form';
import { projectId } from '../../../../utils/supabase/info';
import { adminFetch } from '../../lib/admin-auth';
import { cn } from '../ui/utils';
import { Button } from '../base/button';
import { Badge } from '../base/badge';
import { Input } from '../base/input';
import { Card } from '../base/card';
import { Skeleton } from '../ui/skeleton';
import { NumericFormat } from 'react-number-format';
import * as Switch from '@radix-ui/react-switch';
import * as Select from '@radix-ui/react-select';
import { CategoryTreeSelector, CategoryNode } from './CategoryTreeSelector';
import { format } from 'date-fns';

const API = `https://${projectId}.supabase.co/functions/v1/make-server-1d6e33e0`;


// --- Helper Components ---

const FormSection = ({ title, children, className }: { title: string, children: React.ReactNode, className?: string }) => (
  <div className={cn("space-y-4", className)}>
    <div className="flex items-center gap-2 pb-2 border-b border-border/50">
      <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">{title}</h3>
    </div>
    <div className="grid gap-4">
      {children}
    </div>
  </div>
);

const FormField = ({ label, error, required, children, className }: any) => (
  <div className={cn("space-y-1.5", className)}>
    <label className="text-xs font-medium text-muted-foreground uppercase flex justify-between">
      {label}
      {required && <span className="text-destructive">*</span>}
    </label>
    {children}
    {error && <span className="text-[10px] text-destructive font-medium">{error.message}</span>}
  </div>
);

const Toggle = ({ value, onChange, label }: any) => (
  <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-card">
    <span className="text-sm font-medium">{label}</span>
    <Switch.Root 
      checked={!!value} 
      onCheckedChange={onChange}
      className={cn(
        "w-[42px] h-[25px] rounded-full relative shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20",
        value ? "bg-primary" : "bg-muted"
      )}
    >
      <Switch.Thumb className={cn(
        "block w-[21px] h-[21px] bg-white rounded-full shadow-sm transition-transform duration-100 translate-x-0.5 will-change-transform",
        value ? "translate-x-[19px]" : "translate-x-0.5"
      )} />
    </Switch.Root>
  </div>
);

const RichTextSimple = ({ value, onChange, placeholder }: any) => (
  <textarea
    className="w-full min-h-[120px] p-3 rounded-lg border border-border bg-input-background text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all resize-y font-mono"
    value={value || ''}
    onChange={e => onChange(e.target.value)}
    placeholder={placeholder}
  />
);

function slugifyAssetName(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    || 'produto';
}

function normalizeMediaPreviewUrl(file: string): string {
  if (!file) return '';
  if (file.startsWith('http')) return file;
  if (file.startsWith('/')) return `https://www.toyoparts.com.br/pub/media/catalog/product${file}`;
  return file;
}

function buildEditorMediaEntries(product: any, customMap: Record<string, any>) {
  const entries: any[] = [];
  const seen = new Set<string>();

  const pushEntry = (file: string, meta?: Partial<any>) => {
    if (!file) return;
    const normalizedFile = String(file).trim();
    if (!normalizedFile) return;
    const previewUrl = normalizeMediaPreviewUrl(normalizedFile);
    const dedupeKey = previewUrl || normalizedFile;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);

    entries.push({
      file: normalizedFile,
      preview_url: previewUrl,
      media_type: 'image',
      disabled: false,
      position: entries.length + 1,
      ...meta,
    });
  };

  const galleryCandidates = [
    ...(Array.isArray(product.media_gallery_entries) ? product.media_gallery_entries : []),
    ...(Array.isArray(product.media_gallery) ? product.media_gallery : []),
  ];

  for (const entry of galleryCandidates) {
    if (!entry?.file) continue;
    pushEntry(entry.file, entry);
  }

  pushEntry(customMap.image || product.image_url, {
    label: customMap.image_label || 'Imagem principal',
    _source: 'base',
  });
  pushEntry(customMap.small_image, {
    label: customMap.small_image_label || 'Small image',
    _source: 'small',
  });
  pushEntry(customMap.thumbnail, {
    label: customMap.thumbnail_label || 'Thumbnail',
    _source: 'thumbnail',
  });
  pushEntry(customMap.swatch_image, {
    label: 'Swatch',
    _source: 'swatch',
  });

  return entries;
}

function createEmptyProductForm() {
  return {
    id: '',
    sku: '',
    name: '',
    type_id: 'simple',
    attribute_set_id: 4,
    created_at: '',
    updated_at: '',
    status: 1,
    visibility: 4,
    price: 0,
    weight: '',
    custom_attributes_map: {
      category_ids: '',
      fragile: '0',
      frete_gratis: '0',
      integra_anymarket: '0',
    } as Record<string, any>,
    stock_data: {
      is_in_stock: 1,
      manage_stock: 1,
      qty: 0,
      min_sale_qty: 1,
      max_sale_qty: 1000,
      notify_stock_qty: 0,
    } as any,
    extension_attributes: {} as any,
    media_gallery_entries: [] as any[],
    additional_attributes: [] as any[],
  };
}

type AttributeFieldType = 'text' | 'number' | 'boolean' | 'textarea' | 'select' | 'multiselect';

interface AttributeDefinitionOption {
  label: string;
  value: string;
}

interface AttributeDefinition {
  attribute_code: string;
  label: string;
  group: string;
  type: AttributeFieldType;
  placeholder?: string;
  visibility?: 'optional' | 'advanced';
  options?: AttributeDefinitionOption[];
}

interface AdditionalAttributeField extends AttributeDefinition {
  value: any;
}

interface EditorSchema {
  categoryTree: CategoryNode[];
  attributeDefinitions: AttributeDefinition[];
  fixedAttributeCodes: string[];
}

interface StagedMediaItem {
  id: string;
  file: File;
  preview_url: string;
  status: 'staged' | 'uploading' | 'uploaded' | 'failed';
  error?: string;
}

const FALLBACK_EDITOR_SCHEMA: EditorSchema = {
  categoryTree: [],
  attributeDefinitions: [],
  fixedAttributeCodes: [],
};

function inferAdditionalAttributeType(value: any, definition?: AttributeDefinition): AttributeFieldType {
  if (definition?.type) return definition.type;
  if (Array.isArray(value)) return 'multiselect';
  if (typeof value === 'boolean') return 'boolean';
  if (value === '0' || value === '1') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (value != null && value !== '' && !Number.isNaN(Number(value)) && String(value).trim() !== '') return 'number';
  if (typeof value === 'string' && (value.includes('\n') || value.length > 140)) return 'textarea';
  return 'text';
}

function normalizeAdditionalAttributeValue(value: any, type: AttributeFieldType) {
  if (type === 'multiselect') {
    if (Array.isArray(value)) return value.map(String);
    return String(value || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (type === 'boolean') {
    return value === true || value === 1 || value === '1' || value === 'true';
  }
  if (type === 'number') {
    if (value === '' || value == null) return '';
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : '';
  }
  return value ?? '';
}

function serializeAdditionalAttributeValue(value: any, type: AttributeFieldType) {
  if (type === 'multiselect') {
    return Array.isArray(value) ? value.map(String).filter(Boolean).join(',') : String(value || '');
  }
  if (type === 'boolean') {
    return value ? '1' : '0';
  }
  if (type === 'number') {
    return value === '' || value == null ? '' : String(value);
  }
  return value ?? '';
}

function humanizeAttributeCode(code: string) {
  return String(code || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim() || 'Atributo';
}

function buildAdditionalAttributes(
  customMap: Record<string, any>,
  schema: EditorSchema,
): AdditionalAttributeField[] {
  const fixedCodes = new Set(schema.fixedAttributeCodes || []);
  const definitionMap = new Map((schema.attributeDefinitions || []).map((definition) => [definition.attribute_code, definition]));

  return Object.entries(customMap)
    .filter(([code]) => !fixedCodes.has(code))
    .map(([code, value]) => {
      const definition = definitionMap.get(code);
      const type = inferAdditionalAttributeType(value, definition);
      return {
        attribute_code: code,
        label: definition?.label || humanizeAttributeCode(code),
        group: definition?.group || 'Avançado',
        type,
        placeholder: definition?.placeholder,
        visibility: definition?.visibility || 'advanced',
        options: definition?.options || [],
        value: normalizeAdditionalAttributeValue(value, type),
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
}

function buildFormValues(product: any, schema: EditorSchema = FALLBACK_EDITOR_SCHEMA) {
  const defaults = createEmptyProductForm();
  const customMap: Record<string, any> = {};
  (product?.custom_attributes || []).forEach((attr: any) => {
    customMap[attr.attribute_code] = attr.value;
  });

  let stockData = defaults.stock_data;
  try {
    if (product?.extension_attributes?.stock) {
      stockData = typeof product.extension_attributes.stock === 'string'
        ? JSON.parse(product.extension_attributes.stock)
        : product.extension_attributes.stock;
    }
  } catch (e) {
    console.error('Stock parse error', e);
  }

  return {
    ...defaults,
    ...product,
    custom_attributes_map: {
      ...defaults.custom_attributes_map,
      ...customMap,
    },
    stock_data: {
      ...defaults.stock_data,
      ...(stockData || {}),
    },
    media_gallery_entries: buildEditorMediaEntries(product, customMap),
    additional_attributes: buildAdditionalAttributes(customMap, schema),
  };
}

function hasAttributeValue(value: any, type: AttributeFieldType) {
  if (type === 'multiselect') {
    return Array.isArray(value) && value.length > 0;
  }
  if (type === 'boolean') {
    return value === true || value === '1' || value === 1;
  }
  return value !== '' && value != null;
}

async function convertImageToWebp(file: File, productName: string, sku: string, index: number): Promise<File> {
  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Nao foi possivel abrir a imagem selecionada'));
      img.src = objectUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;

    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Nao foi possivel preparar a conversao da imagem');
    }

    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/webp', 0.9);
    });

    if (!blob) {
      throw new Error('Nao foi possivel converter a imagem para WebP');
    }

    const safeName = slugifyAssetName(productName);
    const safeSku = slugifyAssetName(sku);
    const suffix = index > 0 ? `-${index + 1}` : '';

    return new File(
      [blob],
      `${safeName}-${safeSku}${suffix}.webp`,
      { type: 'image/webp', lastModified: Date.now() }
    );
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

// --- Main Component ---

interface ProductEditorProps {
  sku?: string;
  mode?: 'create' | 'edit';
  onClose: () => void;
  onSave?: (product: any) => void;
}

export function ProductEditor({ sku, mode = 'edit', onClose, onSave }: ProductEditorProps) {
  const initialMode = mode === 'create' || !sku ? 'create' : 'edit';
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('principal');
  const [schema, setSchema] = useState<EditorSchema>(FALLBACK_EDITOR_SCHEMA);
  const [mediaUploading, setMediaUploading] = useState(false);
  const [mediaProgress, setMediaProgress] = useState('');
  const [editorMode, setEditorMode] = useState<'create' | 'edit'>(initialMode);
  const [currentSku, setCurrentSku] = useState(sku || '');
  const [stagedMedia, setStagedMedia] = useState<StagedMediaItem[]>([]);
  const [attributeSearch, setAttributeSearch] = useState('');
  const [customAttributeCode, setCustomAttributeCode] = useState('');
  const [customAttributeType, setCustomAttributeType] = useState<AttributeFieldType>('text');
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const stagedMediaRef = useRef<StagedMediaItem[]>([]);

  const { control, register, handleSubmit, reset, watch, setValue, getValues, formState: { errors, isSubmitting } } = useForm({
    defaultValues: createEmptyProductForm()
  });
  const { fields: additionalAttributeFields, append: appendAdditionalAttribute, remove: removeAdditionalAttribute, replace: replaceAdditionalAttributes } = useFieldArray({
    control,
    name: 'additional_attributes',
  });

  const mediaEntries = watch('media_gallery_entries') || [];
  const additionalAttributes = watch('additional_attributes') || [];
  const productName = watch('name') || currentSku || 'produto';
  const watchedSku = watch('sku') || currentSku;
  const canUploadMedia = editorMode === 'edit' && !!currentSku;
  const categoryTree = schema.categoryTree || [];
  const selectedAdditionalCodes = new Set(
    (Array.isArray(additionalAttributes) ? additionalAttributes : [])
      .map((attribute: any) => String(attribute?.attribute_code || '').trim())
      .filter(Boolean)
  );
  const availableAttributeDefinitions = (schema.attributeDefinitions || []).filter((definition) => {
    const searchValue = attributeSearch.trim().toLowerCase();
    if (selectedAdditionalCodes.has(definition.attribute_code)) return false;
    if (!searchValue) return true;
    return (
      definition.label.toLowerCase().includes(searchValue) ||
      definition.attribute_code.toLowerCase().includes(searchValue) ||
      definition.group.toLowerCase().includes(searchValue)
    );
  });

  useEffect(() => {
    setEditorMode(mode === 'create' || !sku ? 'create' : 'edit');
    setCurrentSku(sku || '');
    setStagedMedia((current) => {
      releaseStagedMedia(current);
      return [];
    });
  }, [mode, sku]);

  useEffect(() => {
    setActiveTab('principal');
  }, [mode, sku]);

  useEffect(() => {
    void loadData(editorMode === 'edit' ? currentSku : undefined);
  }, [currentSku, editorMode]);

  useEffect(() => {
    stagedMediaRef.current = stagedMedia;
  }, [stagedMedia]);

  useEffect(() => () => {
    stagedMediaRef.current.forEach((item) => {
      try {
        URL.revokeObjectURL(item.preview_url);
      } catch {
        // noop
      }
    });
  }, []);

  const releaseStagedMedia = (items: StagedMediaItem[]) => {
    items.forEach((item) => {
      try {
        URL.revokeObjectURL(item.preview_url);
      } catch {
        // noop
      }
    });
  };

  const clearStagedMedia = () => {
    setStagedMedia((current) => {
      releaseStagedMedia(current);
      return [];
    });
  };

  const loadData = async (targetSku?: string) => {
    setLoading(true);
    try {
      const schemaRes = await adminFetch(`${API}/admin/products/schema`);
      if (!schemaRes.ok) throw new Error('Falha ao carregar schema do editor');
      const loadedSchema = await schemaRes.json().catch(() => FALLBACK_EDITOR_SCHEMA);
      setSchema({
        categoryTree: Array.isArray(loadedSchema?.categoryTree) ? loadedSchema.categoryTree : [],
        attributeDefinitions: Array.isArray(loadedSchema?.attributeDefinitions) ? loadedSchema.attributeDefinitions : [],
        fixedAttributeCodes: Array.isArray(loadedSchema?.fixedAttributeCodes) ? loadedSchema.fixedAttributeCodes : [],
      });

      if (!targetSku) {
        reset(createEmptyProductForm());
        replaceAdditionalAttributes([]);
        return;
      }

      const productRes = await adminFetch(`${API}/admin/products/${targetSku}/detail`);
      if (!productRes.ok) throw new Error('Falha ao carregar produto');
      const product = await productRes.json();
      const formValues = buildFormValues(product, loadedSchema);
      reset(formValues);
      replaceAdditionalAttributes(formValues.additional_attributes || []);

    } catch (err: any) {
      toast.error(err.message);
      if (targetSku) {
        onClose();
      }
    } finally {
      setLoading(false);
    }
  };

  const updateStagedMediaStatus = (id: string, patch: Partial<StagedMediaItem>) => {
    setStagedMedia((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  };

  const removeStagedMediaItem = (id: string) => {
    setStagedMedia((current) => {
      const next: StagedMediaItem[] = [];
      for (const item of current) {
        if (item.id === id) {
          releaseStagedMedia([item]);
          continue;
        }
        next.push(item);
      }
      return next;
    });
  };

  const queueMediaFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const imageFiles = Array.from(files).filter((file) => file.type.startsWith('image/'));
    if (imageFiles.length === 0) {
      toast.error('Selecione pelo menos uma imagem valida');
      return;
    }

    const nextItems = imageFiles.map((file, index) => ({
      id: `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
      file,
      preview_url: URL.createObjectURL(file),
      status: 'staged' as const,
    }));

    setStagedMedia((current) => [...current, ...nextItems]);
    toast.success(`${nextItems.length} imagem(ns) preparada(s) para envio`);

    if (mediaInputRef.current) {
      mediaInputRef.current.value = '';
    }
  };

  const uploadQueuedMedia = async (targetSku: string, targetName: string, targetItems?: StagedMediaItem[]) => {
    const itemsToUpload = (targetItems || stagedMediaRef.current).filter((item) => item.status === 'staged' || item.status === 'failed');
    if (itemsToUpload.length === 0) return;

    setMediaUploading(true);
    setMediaProgress('');

    try {
      const persistedEntries = Array.isArray(getValues('media_gallery_entries')) ? getValues('media_gallery_entries') : [];

      for (let index = 0; index < itemsToUpload.length; index++) {
        const currentItem = itemsToUpload[index];
        updateStagedMediaStatus(currentItem.id, { status: 'uploading', error: undefined });
        setMediaProgress(`Enviando ${index + 1} de ${itemsToUpload.length}`);

        try {
          const webpFile = await convertImageToWebp(
            currentItem.file,
            targetName || productName,
            targetSku,
            persistedEntries.length + index,
          );

          const formData = new FormData();
          formData.append('file', webpFile);

          const res = await adminFetch(`${API}/admin/products/${targetSku}/upload-image`, {
            method: 'POST',
            body: formData,
          });

          if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            throw new Error(errorData.error || `Falha no upload da imagem ${index + 1}`);
          }

          const data = await res.json();
          if (data?.product) {
            setValue('media_gallery_entries', data.product.media_gallery_entries || data.product.media_gallery || [], { shouldDirty: true });
          }

          updateStagedMediaStatus(currentItem.id, { status: 'uploaded' });
        } catch (error: any) {
          updateStagedMediaStatus(currentItem.id, { status: 'failed', error: error.message || 'Falha ao enviar imagem' });
        }
      }

      let failedCount = 0;
      setStagedMedia((current) => {
        const failed = current.filter((item) => item.status === 'failed');
        const uploaded = current.filter((item) => item.status === 'uploaded');
        releaseStagedMedia(uploaded);
        failedCount = failed.length;
        return failed;
      });

      if (failedCount > 0) {
        toast.error(`${failedCount} imagem(ns) falharam e ficaram pendentes para retry`);
      } else {
        toast.success(`${itemsToUpload.length} imagem(ns) enviada(s) com sucesso`);
      }
    } finally {
      setMediaUploading(false);
      setMediaProgress('');
    }
  };

  const onSubmit = async (data: any) => {
    try {
      const customAttributeMap = new Map<string, any>();
      Object.entries(data.custom_attributes_map || {}).forEach(([code, value]) => {
        customAttributeMap.set(code, value);
      });

      (Array.isArray(data.additional_attributes) ? data.additional_attributes : []).forEach((attribute: AdditionalAttributeField) => {
        const attributeCode = String(attribute?.attribute_code || '').trim();
        if (!attributeCode) return;
        if (!hasAttributeValue(attribute.value, attribute.type)) return;
        customAttributeMap.set(attributeCode, serializeAdditionalAttributeValue(attribute.value, attribute.type));
      });

      const customAttributesArray = Array.from(customAttributeMap.entries()).map(([attribute_code, value]) => ({
        attribute_code,
        value,
      }));

      // Serialize Stock
      const stockString = JSON.stringify(data.stock_data);

      const payload = {
        ...data,
        custom_attributes: customAttributesArray,
        extension_attributes: {
          ...data.extension_attributes,
          stock: stockString
        }
      };

      // Remove temp fields
      delete payload.custom_attributes_map;
      delete payload.stock_data;
      delete payload.additional_attributes;

      const endpoint = editorMode === 'create'
        ? `${API}/admin/products`
        : `${API}/admin/products/${currentSku}`;
      const method = editorMode === 'create' ? 'POST' : 'PATCH';

      const res = await adminFetch(endpoint, {
        method,
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || (editorMode === 'create' ? 'Falha ao criar produto' : 'Falha ao salvar produto'));
      }
      
      const updated = await res.json();
      const savedSku = updated.product.sku;
      const savedName = updated.product.name || data.name || productName;
      if (editorMode === 'create') {
        toast.success('Produto criado com sucesso');
        setEditorMode('edit');
        setCurrentSku(savedSku);
      } else {
        toast.success('Produto salvo com sucesso');
      }
      if (stagedMediaRef.current.length > 0) {
        await uploadQueuedMedia(savedSku, savedName);
      }
      if (onSave) onSave(updated.product);
      await loadData(savedSku);

    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleProductImageUpload = async (files: FileList | null) => {
    queueMediaFiles(files);
  };

  const addAttributeDefinition = (definition: AttributeDefinition) => {
    appendAdditionalAttribute({
      ...definition,
      value: normalizeAdditionalAttributeValue('', definition.type),
    });
  };

  const addCustomAttribute = () => {
    const attributeCode = customAttributeCode.trim().toLowerCase().replace(/\s+/g, '_');
    if (!attributeCode) {
      toast.error('Informe um codigo para o atributo adicional');
      return;
    }
    if (selectedAdditionalCodes.has(attributeCode) || (schema.fixedAttributeCodes || []).includes(attributeCode)) {
      toast.error('Esse atributo ja esta no cadastro');
      return;
    }
    appendAdditionalAttribute({
      attribute_code: attributeCode,
      label: humanizeAttributeCode(attributeCode),
      group: 'Avancado',
      type: customAttributeType,
      placeholder: '',
      visibility: 'advanced',
      options: [],
      value: normalizeAdditionalAttributeValue('', customAttributeType),
    });
    setCustomAttributeCode('');
  };

  const uploadPendingStagedMedia = async () => {
    if (!canUploadMedia || !currentSku) {
      toast.error('Salve o produto primeiro para enviar as imagens pendentes');
      return;
    }
    await uploadQueuedMedia(currentSku, productName);
    await loadData(currentSku);
  };

  if (loading) return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      {/* Header skeleton */}
      <div className="px-6 py-4 border-b border-border bg-card flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <Skeleton className="w-9 h-9 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="w-36 h-5 rounded-md" />
            <Skeleton className="w-28 h-3.5 rounded-md" />
          </div>
        </div>
        <Skeleton className="w-40 h-9 rounded-lg" />
      </div>
      {/* Tabs skeleton */}
      <div className="px-6 border-b border-border bg-card flex gap-6 shrink-0">
        {[96, 76, 104, 56].map((w, i) => (
          <div key={i} className="py-4 px-1">
            <Skeleton className="h-4 rounded-md" style={{ width: w }} />
          </div>
        ))}
      </div>
      {/* Content skeleton */}
      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        {/* Section 1: Identificação */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-border/50">
            <Skeleton className="w-32 h-4 rounded-md" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="space-y-2">
                <Skeleton className="w-16 h-3 rounded" />
                <Skeleton className="w-full h-10 rounded-lg" />
              </div>
            ))}
          </div>
        </div>
        {/* Section 2: Publicação */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-border/50">
            <Skeleton className="w-24 h-4 rounded-md" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[1, 2].map(i => (
              <div key={i} className="p-3 rounded-lg border border-border bg-card flex items-center justify-between">
                <Skeleton className="w-20 h-4 rounded-md" />
                <Skeleton className="w-[42px] h-[25px] rounded-full" />
              </div>
            ))}
          </div>
        </div>
        {/* Section 3: Preço + Descrição */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-border/50">
            <Skeleton className="w-20 h-4 rounded-md" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="space-y-2">
                <Skeleton className="w-14 h-3 rounded" />
                <Skeleton className="w-full h-10 rounded-lg" />
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <Skeleton className="w-20 h-3 rounded" />
            <Skeleton className="w-full h-32 rounded-lg" />
          </div>
        </div>
        {/* Section 4: Categorias + Atributos */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-border/50">
            <Skeleton className="w-28 h-4 rounded-md" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="space-y-2">
                <Skeleton className="w-16 h-3 rounded" />
                <Skeleton className="w-full h-10 rounded-lg" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  const tabs = [
    { id: 'principal', label: 'Info Principal', icon: Layout },
    { id: 'comercial', label: 'Comercial', icon: DollarSign },
    { id: 'detalhes', label: 'Detalhes & Integ.', icon: Settings },
    { id: 'midia', label: 'Mídia', icon: ImageIcon },
  ];

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border bg-card flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={onClose} className="p-2 hover:bg-secondary rounded-full transition-colors">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
          <div>
            <h2 className="text-lg font-semibold text-foreground leading-tight">{editorMode === 'create' ? 'Novo Produto' : 'Editar Produto'}</h2>
            <p className="text-sm text-muted-foreground font-mono">
              {currentSku || 'Preencha os dados principais para criar o produto'}
            </p>
          </div>
        </div>
        <Button 
          onClick={handleSubmit(onSubmit)} 
          isLoading={isSubmitting}
          iconLeading={<Save className="w-4 h-4" />}
        >
          {editorMode === 'create' ? 'Criar Produto' : 'Salvar Alterações'}
        </Button>
      </div>

      {/* Tabs */}
      <div className="px-6 border-b border-border bg-card flex gap-6 overflow-x-auto no-scrollbar shrink-0">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-2 py-4 px-1 border-b-2 transition-all text-sm font-medium whitespace-nowrap",
              activeTab === tab.id 
                ? "border-primary text-primary" 
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
            )}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto bg-secondary/5">
        <div className="max-w-5xl mx-auto p-6 pb-24 space-y-8">
          
          {/* TAB: PRINCIPAL */}
          {activeTab === 'principal' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
              
              {/* Seção A - Identificação */}
              <Card.Root>
                <Card.Content className="p-6">
                  <FormSection title="A. Identificação">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField label="ID (Read-only)">
                        <Input {...register('id')} disabled className="bg-muted/50 font-mono" />
                      </FormField>
                      <FormField label="SKU">
                        <Input {...register('sku', { required: true })} className="font-mono" disabled={editorMode === 'edit'} />
                      </FormField>
                      <div className="col-span-full">
                        <FormField label="Nome do Produto" required>
                          <Input {...register('name', { required: true })} />
                        </FormField>
                      </div>
                      <FormField label="Tipo">
                        <Input {...register('type_id')} disabled className="bg-muted/50" />
                      </FormField>
                      <FormField label="Attribute Set ID">
                        <Input type="number" {...register('attribute_set_id')} />
                      </FormField>
                    </div>
                  </FormSection>
                </Card.Content>
              </Card.Root>

              {/* Seção B - Publicação */}
              <Card.Root>
                <Card.Content className="p-6">
                  <FormSection title="B. Publicação">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <Controller
                        name="status"
                        control={control}
                        render={({ field }) => (
                          <Toggle 
                            label="Status (Ativo)" 
                            value={field.value === 1} 
                            onChange={(v: boolean) => field.onChange(v ? 1 : 2)} 
                          />
                        )}
                      />
                       <FormField label="Visibilidade">
                         <Controller
                            name="visibility"
                            control={control}
                            render={({ field }) => (
                              <select 
                                className="w-full h-10 rounded-lg border border-border bg-card px-3 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                                {...field}
                                value={field.value}
                                onChange={e => field.onChange(parseInt(e.target.value))}
                              >
                                <option value={1}>1 - Não visível individualmente</option>
                                <option value={2}>2 - Catálogo</option>
                                <option value={3}>3 - Busca</option>
                                <option value={4}>4 - Catálogo e Busca</option>
                              </select>
                            )}
                         />
                       </FormField>
                    </div>
                  </FormSection>
                </Card.Content>
              </Card.Root>

              {/* Seção F - Conteúdo */}
              <Card.Root>
                <Card.Content className="p-6">
                  <FormSection title="F. Conteúdo">
                    <FormField label="Descrição Curta">
                      <Controller
                        name="custom_attributes_map.short_description"
                        control={control}
                        render={({ field }) => <RichTextSimple {...field} placeholder="Breve resumo..." />}
                      />
                    </FormField>
                    <FormField label="Descrição Completa">
                      <Controller
                        name="custom_attributes_map.description"
                        control={control}
                        render={({ field }) => <RichTextSimple {...field} placeholder="Descrição detalhada HTML..." />}
                      />
                    </FormField>
                  </FormSection>
                </Card.Content>
              </Card.Root>

              {/* Seção G - SEO */}
              <Card.Root>
                <Card.Content className="p-6">
                  <FormSection title="G. Otimização SEO">
                    <FormField label="URL Key (Slug)">
                      <Input {...register('custom_attributes_map.url_key')} className="font-mono text-xs" />
                    </FormField>
                    <FormField label="Meta Title">
                      <Input {...register('custom_attributes_map.meta_title')} />
                    </FormField>
                    <FormField label="Meta Keywords">
                      <Input {...register('custom_attributes_map.meta_keyword')} placeholder="Separe por vírgula" />
                    </FormField>
                    <FormField label="Meta Description">
                      <textarea 
                         className="w-full min-h-[80px] p-3 rounded-lg border border-border bg-input-background text-sm outline-none focus:ring-2 focus:ring-primary/20"
                         {...register('custom_attributes_map.meta_description')}
                      />
                    </FormField>
                  </FormSection>
                </Card.Content>
              </Card.Root>

            </motion.div>
          )}

          {/* TAB: COMERCIAL */}
          {activeTab === 'comercial' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
              
              {/* Seção C - Preço */}
              <Card.Root>
                <Card.Content className="p-6">
                  <FormSection title="C. Preços e Promoções">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <FormField label="Preço (R$)">
                        <Controller
                          name="price"
                          control={control}
                          render={({ field }) => (
                            <NumericFormat
                              value={field.value}
                              onValueChange={(v) => field.onChange(v.floatValue)}
                              thousandSeparator="."
                              decimalSeparator=","
                              prefix="R$ "
                              className="w-full h-10 rounded-lg border border-border bg-input-background px-3 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                            />
                          )}
                        />
                      </FormField>
                      <FormField label="Preço Especial (R$)">
                        <Controller
                          name="custom_attributes_map.special_price"
                          control={control}
                          render={({ field }) => (
                            <NumericFormat
                              value={field.value}
                              onValueChange={(v) => field.onChange(v.floatValue)}
                              thousandSeparator="."
                              decimalSeparator=","
                              prefix="R$ "
                              className="w-full h-10 rounded-lg border border-border bg-input-background px-3 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                            />
                          )}
                        />
                      </FormField>
                      <FormField label="Custo (Interno)">
                        <Controller
                          name="custom_attributes_map.cost"
                          control={control}
                          render={({ field }) => (
                            <NumericFormat
                              value={field.value}
                              onValueChange={(v) => field.onChange(v.floatValue)}
                              thousandSeparator="."
                              decimalSeparator=","
                              prefix="R$ "
                              className="w-full h-10 rounded-lg border border-border bg-input-background px-3 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                            />
                          )}
                        />
                      </FormField>
                    </div>
                  </FormSection>
                </Card.Content>
              </Card.Root>

              {/* Seção D - Estoque (Parsed) */}
              <Card.Root>
                <Card.Content className="p-6">
                  <FormSection title="D. Controle de Estoque">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      <Controller
                        name="stock_data.is_in_stock"
                        control={control}
                        render={({ field }) => (
                          <Toggle 
                            label="Em Estoque?" 
                            value={field.value == 1 || field.value === true} 
                            onChange={(v: boolean) => field.onChange(v ? 1 : 0)} 
                          />
                        )}
                      />
                      <Controller
                        name="stock_data.manage_stock"
                        control={control}
                        render={({ field }) => (
                          <Toggle 
                            label="Gerenciar Estoque?" 
                            value={field.value == 1 || field.value === true} 
                            onChange={(v: boolean) => field.onChange(v ? 1 : 0)} 
                          />
                        )}
                      />
                      <FormField label="Quantidade (Qty)">
                        <Input type="number" {...register('stock_data.qty')} />
                      </FormField>
                      <FormField label="Qtd. Mínima Venda">
                        <Input type="number" {...register('stock_data.min_sale_qty')} />
                      </FormField>
                      <FormField label="Qtd. Máxima Venda">
                        <Input type="number" {...register('stock_data.max_sale_qty')} />
                      </FormField>
                      <FormField label="Qtd. Notificação">
                        <Input type="number" {...register('stock_data.notify_stock_qty')} />
                      </FormField>
                    </div>
                  </FormSection>
                </Card.Content>
              </Card.Root>

              {/* Seção E - Entrega */}
              <Card.Root>
                <Card.Content className="p-6">
                  <FormSection title="E. Dimensões e Entrega">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <FormField label="Peso (kg)">
                        <Input type="number" step="0.001" {...register('weight')} />
                      </FormField>
                      <FormField label="Comprimento (cm)">
                        <Input type="number" {...register('custom_attributes_map.volume_length')} />
                      </FormField>
                      <FormField label="Largura (cm)">
                        <Input type="number" {...register('custom_attributes_map.volume_width')} />
                      </FormField>
                      <FormField label="Altura (cm)">
                        <Input type="number" {...register('custom_attributes_map.volume_height')} />
                      </FormField>
                      <FormField label="Lead Time (Dias)">
                        <Input type="number" {...register('custom_attributes_map.lead_time')} />
                      </FormField>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                       <Controller
                        name="custom_attributes_map.fragile"
                        control={control}
                        render={({ field }) => (
                          <Toggle 
                            label="Frágil?" 
                            value={field.value == 1} 
                            onChange={(v: boolean) => field.onChange(v ? "1" : "0")} 
                          />
                        )}
                      />
                      <Controller
                        name="custom_attributes_map.frete_gratis"
                        control={control}
                        render={({ field }) => (
                          <Toggle 
                            label="Frete Grátis?" 
                            value={field.value == 1} 
                            onChange={(v: boolean) => field.onChange(v ? "1" : "0")} 
                          />
                        )}
                      />
                    </div>
                  </FormSection>
                </Card.Content>
              </Card.Root>
            </motion.div>
          )}

          {/* TAB: DETALHES */}
          {activeTab === 'detalhes' && (
             <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
               
               {/* Seção H - Categoria */}
               <Card.Root>
                 <Card.Content className="p-6">
                   <FormSection title="H. Categorização">
                     <FormField label="Árvore de Categorias">
                       <Controller
                          name="custom_attributes_map.category_ids"
                          control={control}
                          render={({ field }) => {
                            // Convert current CSV string (or array) to array of strings for the selector
                            const currentIds = Array.isArray(field.value) 
                              ? field.value.map(String)
                              : typeof field.value === 'string'
                                ? field.value.split(',').map(s => s.trim()).filter(Boolean)
                                : [];

                            return (
                              <div className="space-y-2">
                                <CategoryTreeSelector
                                  tree={categoryTree}
                                  selectedIds={currentIds}
                                  onChange={(newIds) => {
                                    // Save back as CSV string as per original format
                                    // Or array if backend supports it. Sticking to string to match existing data.
                                    field.onChange(newIds.join(','));
                                  }}
                                />
                                <div className="text-[10px] text-muted-foreground font-mono">
                                  Raw: {typeof field.value === 'string' ? field.value : JSON.stringify(field.value)}
                                </div>
                              </div>
                            );
                          }}
                       />
                     </FormField>
                     <FormField label="Ordenação na Busca">
                       <Input type="number" {...register('custom_attributes_map.ordena_busca')} />
                     </FormField>
                   </FormSection>
                 </Card.Content>
               </Card.Root>

               {/* Seção I - Compatibilidade */}
               <Card.Root>
                 <Card.Content className="p-6">
                   <FormSection title="I. Compatibilidade Automotiva">
                     <div className="space-y-4">
                        <FormField label="Modelos (IDs CSV)">
                           <Input {...register('custom_attributes_map.modelo')} />
                        </FormField>
                        <FormField label="Anos (IDs CSV)">
                           <Input {...register('custom_attributes_map.ano')} />
                        </FormField>
                        <FormField label="Versões (IDs CSV)">
                           <Input {...register('custom_attributes_map.versao')} />
                        </FormField>
                        <FormField label="String de Compatibilidade Completa">
                           <textarea 
                             className="w-full min-h-[100px] p-3 rounded-lg border border-border bg-input-background text-xs font-mono"
                             {...register('custom_attributes_map.compatibilidade')}
                             placeholder="Modelo=Versao:Ano-Ano..."
                           />
                        </FormField>
                     </div>
                   </FormSection>
                 </Card.Content>
               </Card.Root>

               {/* Seção J - Anymarket */}
               <Card.Root>
                 <Card.Content className="p-6">
                   <FormSection title="J. Integração Anymarket">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Controller
                          name="custom_attributes_map.integra_anymarket"
                          control={control}
                          render={({ field }) => (
                            <Toggle label="Integrar Anymarket?" value={field.value == 1} onChange={v => field.onChange(v ? "1" : "0")} />
                          )}
                        />
                        <FormField label="Marca Anymarket">
                          <Input {...register('custom_attributes_map.marca_anymarket')} />
                        </FormField>
                        <FormField label="Garantia (Meses)">
                          <Input type="number" {...register('custom_attributes_map.garantia_meses_any')} />
                        </FormField>
                        <FormField label="Texto Garantia">
                          <Input {...register('custom_attributes_map.garantia_texto_anymarket')} />
                        </FormField>
                      </div>
                   </FormSection>
                 </Card.Content>
               </Card.Root>

               {/* Seção M - Outros */}
               <Card.Root>
                 <Card.Content className="p-6">
                   <FormSection title="K. Atributos adicionais">
                     <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                       <div className="space-y-4">
                         {additionalAttributeFields.length > 0 ? (
                           additionalAttributeFields.map((field, index) => {
                             const currentField = additionalAttributes[index] || field;
                             const fieldType = (currentField?.type || 'text') as AttributeFieldType;
                             const fieldOptions = Array.isArray(currentField?.options) ? currentField.options : [];

                             return (
                               <div key={field.id} className="space-y-3 rounded-xl border border-border bg-card p-4">
                                 <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                   <div>
                                     <div className="flex flex-wrap items-center gap-2">
                                       <p className="text-sm font-semibold text-foreground">{currentField?.label || humanizeAttributeCode(currentField?.attribute_code)}</p>
                                       <Badge variant="secondary" className="text-[10px] uppercase">{currentField?.group || 'Avancado'}</Badge>
                                       <Badge variant="outline" className="text-[10px] font-mono">{currentField?.attribute_code}</Badge>
                                     </div>
                                     {currentField?.placeholder && (
                                       <p className="mt-1 text-xs text-muted-foreground">{currentField.placeholder}</p>
                                     )}
                                   </div>
                                   <Button
                                     type="button"
                                     size="sm"
                                     variant="outline"
                                     iconLeading={<Trash2 className="w-4 h-4" />}
                                     onClick={() => removeAdditionalAttribute(index)}
                                   >
                                     Remover
                                   </Button>
                                 </div>

                                 <div className="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)]">
                                   <FormField label="Tipo">
                                     <Controller
                                       name={`additional_attributes.${index}.type` as const}
                                       control={control}
                                       render={({ field: typeField }) => (
                                         <select
                                           className="w-full h-10 rounded-lg border border-border bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                                           value={typeField.value}
                                           onChange={(event) => {
                                             const nextType = event.target.value as AttributeFieldType;
                                             typeField.onChange(nextType);
                                             setValue(`additional_attributes.${index}.value`, normalizeAdditionalAttributeValue(currentField?.value, nextType), { shouldDirty: true });
                                           }}
                                         >
                                           <option value="text">Texto</option>
                                           <option value="number">Numero</option>
                                           <option value="boolean">Booleano</option>
                                           <option value="textarea">Textarea</option>
                                           <option value="select">Select</option>
                                           <option value="multiselect">Multiselect</option>
                                         </select>
                                       )}
                                     />
                                   </FormField>

                                   <FormField label="Valor">
                                     {fieldType === 'textarea' && (
                                       <Controller
                                         name={`additional_attributes.${index}.value` as const}
                                         control={control}
                                         render={({ field: valueField }) => (
                                           <textarea
                                             className="min-h-[96px] w-full rounded-lg border border-border bg-input-background p-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                                             value={valueField.value || ''}
                                             onChange={(event) => valueField.onChange(event.target.value)}
                                             placeholder={currentField?.placeholder || 'Informe o valor'}
                                           />
                                         )}
                                       />
                                     )}

                                     {fieldType === 'boolean' && (
                                       <Controller
                                         name={`additional_attributes.${index}.value` as const}
                                         control={control}
                                         render={({ field: valueField }) => (
                                           <Toggle
                                             label="Ativo"
                                             value={valueField.value === true || valueField.value === '1' || valueField.value === 1}
                                             onChange={(value: boolean) => valueField.onChange(value)}
                                           />
                                         )}
                                       />
                                     )}

                                     {fieldType === 'number' && (
                                       <Controller
                                         name={`additional_attributes.${index}.value` as const}
                                         control={control}
                                         render={({ field: valueField }) => (
                                           <Input
                                             type="number"
                                             value={valueField.value ?? ''}
                                             onChange={(event) => valueField.onChange(event.target.value)}
                                             placeholder={currentField?.placeholder || 'Informe um numero'}
                                           />
                                         )}
                                       />
                                     )}

                                     {fieldType === 'select' && (
                                       <Controller
                                         name={`additional_attributes.${index}.value` as const}
                                         control={control}
                                         render={({ field: valueField }) => (
                                           fieldOptions.length > 0 ? (
                                             <select
                                               className="w-full h-10 rounded-lg border border-border bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                                               value={valueField.value ?? ''}
                                               onChange={(event) => valueField.onChange(event.target.value)}
                                             >
                                               <option value="">Selecione</option>
                                               {fieldOptions.map((option: AttributeDefinitionOption) => (
                                                 <option key={`${field.id}-${option.value}`} value={option.value}>{option.label}</option>
                                               ))}
                                             </select>
                                           ) : (
                                             <Input
                                               value={valueField.value ?? ''}
                                               onChange={(event) => valueField.onChange(event.target.value)}
                                               placeholder={currentField?.placeholder || 'Informe o valor'}
                                             />
                                           )
                                         )}
                                       />
                                     )}

                                     {fieldType === 'multiselect' && (
                                       <Controller
                                         name={`additional_attributes.${index}.value` as const}
                                         control={control}
                                         render={({ field: valueField }) => (
                                           fieldOptions.length > 0 ? (
                                             <div className="grid gap-2 rounded-lg border border-border bg-secondary/10 p-3 sm:grid-cols-2">
                                               {fieldOptions.map((option: AttributeDefinitionOption) => {
                                                 const currentValue = Array.isArray(valueField.value) ? valueField.value : [];
                                                 const checked = currentValue.includes(option.value);
                                                 return (
                                                   <label key={`${field.id}-${option.value}`} className="flex items-center gap-2 text-sm text-foreground/80">
                                                     <input
                                                       type="checkbox"
                                                       checked={checked}
                                                       onChange={(event) => {
                                                         const nextValue = event.target.checked
                                                           ? [...currentValue, option.value]
                                                           : currentValue.filter((item: string) => item !== option.value);
                                                         valueField.onChange(nextValue);
                                                       }}
                                                     />
                                                     {option.label}
                                                   </label>
                                                 );
                                               })}
                                             </div>
                                           ) : (
                                             <Input
                                               value={Array.isArray(valueField.value) ? valueField.value.join(', ') : valueField.value || ''}
                                               onChange={(event) => valueField.onChange(event.target.value.split(',').map((item) => item.trim()).filter(Boolean))}
                                               placeholder={currentField?.placeholder || 'Separe os valores por virgula'}
                                             />
                                           )
                                         )}
                                       />
                                     )}

                                     {fieldType === 'text' && (
                                       <Controller
                                         name={`additional_attributes.${index}.value` as const}
                                         control={control}
                                         render={({ field: valueField }) => (
                                           <Input
                                             value={valueField.value ?? ''}
                                             onChange={(event) => valueField.onChange(event.target.value)}
                                             placeholder={currentField?.placeholder || 'Informe o valor'}
                                           />
                                         )}
                                       />
                                     )}
                                   </FormField>
                                 </div>
                               </div>
                             );
                           })
                         ) : (
                           <div className="rounded-xl border border-dashed border-border bg-secondary/10 p-5 text-sm text-muted-foreground">
                             Nenhum atributo adicional selecionado. Adicione campos dinamicos ao lado para completar o cadastro sem perder a estrutura principal.
                           </div>
                         )}
                       </div>

                       <div className="space-y-4">
                         <div className="space-y-3 rounded-xl border border-border bg-secondary/10 p-4">
                           <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Adicionar do catalogo</p>
                           <div className="relative">
                             <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                             <Input
                               value={attributeSearch}
                               onChange={(event) => setAttributeSearch(event.target.value)}
                               placeholder="Buscar atributo"
                               className="pl-9"
                             />
                           </div>
                           <div className="max-h-[260px] space-y-2 overflow-y-auto pr-1">
                             {availableAttributeDefinitions.length > 0 ? (
                               availableAttributeDefinitions.map((definition) => (
                                 <button
                                   key={definition.attribute_code}
                                   type="button"
                                   className="w-full rounded-lg border border-border bg-card px-3 py-2 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
                                   onClick={() => addAttributeDefinition(definition)}
                                 >
                                   <div className="flex items-center justify-between gap-3">
                                     <div>
                                       <p className="text-sm font-medium text-foreground">{definition.label}</p>
                                       <p className="text-xs font-mono text-muted-foreground">{definition.attribute_code}</p>
                                     </div>
                                     <Badge variant="secondary" className="text-[10px] uppercase">{definition.group}</Badge>
                                   </div>
                                 </button>
                               ))
                             ) : (
                               <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
                                 Nenhum atributo disponivel com esse filtro.
                               </div>
                             )}
                           </div>
                         </div>

                         <div className="space-y-3 rounded-xl border border-border bg-secondary/10 p-4">
                           <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Criar atributo customizado</p>
                           <FormField label="Codigo do atributo">
                             <Input
                               value={customAttributeCode}
                               onChange={(event) => setCustomAttributeCode(event.target.value)}
                               placeholder="ex.: referencia_fornecedor"
                               className="font-mono"
                             />
                           </FormField>
                           <FormField label="Tipo">
                             <select
                               className="w-full h-10 rounded-lg border border-border bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                               value={customAttributeType}
                               onChange={(event) => setCustomAttributeType(event.target.value as AttributeFieldType)}
                             >
                               <option value="text">Texto</option>
                               <option value="number">Numero</option>
                               <option value="boolean">Booleano</option>
                               <option value="textarea">Textarea</option>
                               <option value="select">Select</option>
                               <option value="multiselect">Multiselect</option>
                             </select>
                           </FormField>
                           <Button type="button" iconLeading={<Plus className="w-4 h-4" />} onClick={addCustomAttribute}>
                             Adicionar atributo customizado
                           </Button>
                         </div>
                       </div>
                     </div>
                   </FormSection>
                 </Card.Content>
               </Card.Root>

               {/* SeÃ§Ã£o K - Atributos adicionais */}
               <Card.Root>
                 <Card.Content className="p-6">
                   <FormSection title="M. Embalagem e Origem">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField label="Tipo Embalagem">
                          <Input {...register('custom_attributes_map.ts_packaging_type')} />
                        </FormField>
                        <FormField label="País Origem">
                          <Input {...register('custom_attributes_map.ts_country_of_origin')} />
                        </FormField>
                      </div>
                   </FormSection>
                 </Card.Content>
               </Card.Root>

             </motion.div>
          )}

          {/* TAB: MÍDIA */}
          {activeTab === 'midia' && (
             <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                <Card.Root>
                  <Card.Content className="p-6">
                    <FormSection title="L. Imagens e Mídia">
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-4">
                            <h4 className="text-sm font-medium">Imagens Principais (Caminho Relativo)</h4>
                            <FormField label="Imagem Base">
                              <Input {...register('custom_attributes_map.image')} className="font-mono text-xs" />
                            </FormField>
                            <FormField label="Small Image">
                              <Input {...register('custom_attributes_map.small_image')} className="font-mono text-xs" />
                            </FormField>
                            <FormField label="Thumbnail">
                              <Input {...register('custom_attributes_map.thumbnail')} className="font-mono text-xs" />
                            </FormField>
                            <FormField label="Swatch">
                              <Input {...register('custom_attributes_map.swatch_image')} className="font-mono text-xs" />
                            </FormField>
                          </div>
                          
                          <div className="space-y-4">
                             <h4 className="text-sm font-medium">Labels (Alt Text)</h4>
                             <FormField label="Image Label">
                               <Input {...register('custom_attributes_map.image_label')} />
                             </FormField>
                             <FormField label="Small Image Label">
                               <Input {...register('custom_attributes_map.small_image_label')} />
                             </FormField>
                             <FormField label="Thumbnail Label">
                               <Input {...register('custom_attributes_map.thumbnail_label')} />
                             </FormField>
                          </div>
                       </div>

                       <div className="mt-8 pt-8 border-t border-border">
                         <h4 className="text-sm font-medium mb-4">Galeria (Media Gallery Entries)</h4>
                         <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
                            {mediaEntries.map((entry: any, idx: number) => (
                               <div key={idx} className="relative group aspect-square bg-secondary rounded-lg border border-border overflow-hidden">
                                  <img 
                                    src={entry.preview_url || normalizeMediaPreviewUrl(entry.file)}
                                    alt={entry.label || `Midia ${idx + 1}`}
                                    className="w-full h-full object-cover"
                                  />
                                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-2 text-white text-xs">
                                     <p className="font-mono truncate w-full text-center">{entry.file}</p>
                                     <div className="mt-2 flex flex-wrap items-center justify-center gap-1">
                                       <Badge className="text-[10px]" variant="outline">Pos: {entry.position}</Badge>
                                       {entry._source && (
                                         <Badge className="text-[10px]" variant="secondary">{entry._source}</Badge>
                                       )}
                                     </div>
                                  </div>
                               </div>
                            ))}

                            {stagedMedia.map((item, idx) => (
                              <div key={item.id} className="relative aspect-square overflow-hidden rounded-lg border border-dashed border-primary/40 bg-primary/5">
                                <img
                                  src={item.preview_url}
                                  alt={item.file.name || `Preview ${idx + 1}`}
                                  className="h-full w-full object-cover"
                                />
                                <div className="absolute inset-x-0 bottom-0 space-y-2 bg-gradient-to-t from-black/80 to-transparent p-3 text-white">
                                  <div className="flex items-center justify-between gap-2">
                                    <Badge variant="secondary" className="text-[10px] uppercase">
                                      {item.status === 'staged' && 'Staged'}
                                      {item.status === 'uploading' && 'Enviando'}
                                      {item.status === 'uploaded' && 'Enviado'}
                                      {item.status === 'failed' && 'Falhou'}
                                    </Badge>
                                    <button
                                      type="button"
                                      className="rounded-full bg-black/40 p-1 transition-colors hover:bg-black/60"
                                      onClick={() => removeStagedMediaItem(item.id)}
                                      disabled={item.status === 'uploading'}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                  <p className="truncate text-[11px] font-medium">{item.file.name}</p>
                                  {item.error && (
                                    <p className="line-clamp-2 text-[10px] text-amber-200">{item.error}</p>
                                  )}
                                </div>
                              </div>
                            ))}

                            <button
                              type="button"
                              onClick={() => mediaInputRef.current?.click()}
                              disabled={mediaUploading}
                              className="aspect-square rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center text-muted-foreground hover:text-primary hover:border-primary transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                               <Plus className="w-8 h-8" />
                               <span className="text-xs font-medium mt-2">
                                 {mediaUploading ? 'Processando...' : 'Selecionar imagens'}
                               </span>
                            </button>
                         </div>
                         <input
                           ref={mediaInputRef}
                           type="file"
                           accept="image/png,image/jpeg,image/webp"
                           multiple
                           className="hidden"
                           onChange={(event) => handleProductImageUpload(event.target.files)}
                         />
                         <div className="mt-4 rounded-xl border border-border/60 bg-secondary/20 p-4 space-y-2">
                           <p className="text-xs font-semibold text-foreground uppercase tracking-wider">
                             Upload inteligente
                           </p>
                           <p className="text-sm text-muted-foreground leading-relaxed">
                             As imagens selecionadas sao convertidas para WebP e renomeadas automaticamente com o nome do produto e o SKU antes do envio.
                           </p>
                           <div className="flex flex-wrap gap-2">
                             <Button type="button" variant="outline" onClick={() => mediaInputRef.current?.click()} disabled={mediaUploading}>
                               Selecionar imagens
                             </Button>
                             <Button
                               type="button"
                               onClick={uploadPendingStagedMedia}
                               disabled={!canUploadMedia || mediaUploading || stagedMedia.length === 0}
                             >
                               Enviar pendentes
                             </Button>
                             <Button
                               type="button"
                               variant="outline"
                               onClick={clearStagedMedia}
                               disabled={mediaUploading || stagedMedia.length === 0}
                             >
                               Limpar fila
                             </Button>
                           </div>
                           {!canUploadMedia && (
                             <p className="text-xs font-medium text-amber-600">
                               Voce pode selecionar as fotos agora. Depois do primeiro save, o sistema envia a fila automaticamente e libera retries.
                             </p>
                           )}
                           {stagedMedia.length > 0 && (
                             <p className="text-xs font-medium text-foreground">
                               {stagedMedia.length} arquivo(s) preparado(s) para envio.
                             </p>
                           )}
                           {mediaProgress && (
                             <p className="text-xs font-medium text-primary">{mediaProgress}</p>
                           )}
                         </div>
                       </div>
                    </FormSection>
                  </Card.Content>
                </Card.Root>
             </motion.div>
          )}

        </div>
      </div>
    </div>
  );
}
