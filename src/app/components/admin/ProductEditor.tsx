import React, { useState, useEffect } from 'react';
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

// --- Main Component ---

interface ProductEditorProps {
  sku: string;
  onClose: () => void;
  onSave?: (product: any) => void;
}

export function ProductEditor({ sku, onClose, onSave }: ProductEditorProps) {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('principal');
  const [metadata, setMetadata] = useState<any>({ categories: [], models: [], years: [], versions: [] });
  const [categoryTree, setCategoryTree] = useState<CategoryNode[]>([]);

  const { control, handleSubmit, reset, watch, setValue, formState: { errors, isSubmitting } } = useForm({
    defaultValues: {
      // Identity
      id: '', sku: '', name: '', type_id: 'simple', attribute_set_id: 4, created_at: '', updated_at: '',
      // Publication
      status: 0, visibility: 1,
      // Price
      price: 0,
      custom_attributes_map: {} as Record<string, any>,
      // Stock
      stock_data: {} as any,
      // Extension
      extension_attributes: {} as any,
      // Media
      media_gallery_entries: [] as any[]
    }
  });

  useEffect(() => {
    if (sku) {
      loadData();
    }
  }, [sku]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [productRes, catsRes, modsRes, yrsRes, treeRes] = await Promise.all([
        adminFetch(`${API}/admin/products/${sku}`),
        adminFetch(`${API}/admin/products/metadata/category_names`),
        adminFetch(`${API}/admin/products/metadata/modelos`),
        adminFetch(`${API}/admin/products/metadata/anos`),
        adminFetch(`${API}/admin/products/metadata/structure/tree`),
      ]);

      if (!productRes.ok) throw new Error('Falha ao carregar produto');
      
      const product = await productRes.json();
      const categories = await catsRes.json().catch(() => []);
      const models = await modsRes.json().catch(() => []);
      const years = await yrsRes.json().catch(() => []);
      const tree = await treeRes.json().catch(() => []);

      setMetadata({ 
        categories: Array.isArray(categories) ? categories : [], 
        models: Array.isArray(models) ? models : [], 
        years: Array.isArray(years) ? years : [] 
      });
      setCategoryTree(Array.isArray(tree) ? tree : []);

      // Transform API data to Form data
      const customMap: Record<string, any> = {};
      (product.custom_attributes || []).forEach((attr: any) => {
        customMap[attr.attribute_code] = attr.value;
      });

      // Parse Stock JSON
      let stockData = {};
      try {
        if (product.extension_attributes?.stock) {
          stockData = typeof product.extension_attributes.stock === 'string' 
            ? JSON.parse(product.extension_attributes.stock)
            : product.extension_attributes.stock;
        }
      } catch (e) {
        console.error('Stock parse error', e);
      }

      reset({
        ...product,
        custom_attributes_map: customMap,
        stock_data: stockData,
      });

    } catch (err: any) {
      toast.error(err.message);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (data: any) => {
    try {
      // Transform Form data back to API structure
      const customAttributesArray = Object.entries(data.custom_attributes_map).map(([code, value]) => ({
        attribute_code: code,
        value: value
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

      const res = await adminFetch(`${API}/admin/products/${sku}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error('Falha ao salvar produto');
      
      const updated = await res.json();
      toast.success('Produto salvo com sucesso');
      if (onSave) onSave(updated.product);
      // Don't close, just refresh data or stay
      loadData(); 

    } catch (err: any) {
      toast.error(err.message);
    }
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
            <h2 className="text-lg font-semibold text-foreground leading-tight">Editar Produto</h2>
            <p className="text-sm text-muted-foreground font-mono">{sku}</p>
          </div>
        </div>
        <Button 
          onClick={handleSubmit(onSubmit)} 
          isLoading={isSubmitting}
          iconLeading={<Save className="w-4 h-4" />}
        >
          Salvar Alterações
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
                        <Input {...control.register('id')} disabled className="bg-muted/50 font-mono" />
                      </FormField>
                      <FormField label="SKU">
                        <Input {...control.register('sku', { required: true })} className="font-mono" />
                      </FormField>
                      <div className="col-span-full">
                        <FormField label="Nome do Produto" required>
                          <Input {...control.register('name', { required: true })} />
                        </FormField>
                      </div>
                      <FormField label="Tipo">
                        <Input {...control.register('type_id')} disabled className="bg-muted/50" />
                      </FormField>
                      <FormField label="Attribute Set ID">
                        <Input type="number" {...control.register('attribute_set_id')} />
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
                      <Input {...control.register('custom_attributes_map.url_key')} className="font-mono text-xs" />
                    </FormField>
                    <FormField label="Meta Title">
                      <Input {...control.register('custom_attributes_map.meta_title')} />
                    </FormField>
                    <FormField label="Meta Keywords">
                      <Input {...control.register('custom_attributes_map.meta_keyword')} placeholder="Separe por vírgula" />
                    </FormField>
                    <FormField label="Meta Description">
                      <textarea 
                         className="w-full min-h-[80px] p-3 rounded-lg border border-border bg-input-background text-sm outline-none focus:ring-2 focus:ring-primary/20"
                         {...control.register('custom_attributes_map.meta_description')}
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
                        <Input type="number" {...control.register('stock_data.qty')} />
                      </FormField>
                      <FormField label="Qtd. Mínima Venda">
                        <Input type="number" {...control.register('stock_data.min_sale_qty')} />
                      </FormField>
                      <FormField label="Qtd. Máxima Venda">
                        <Input type="number" {...control.register('stock_data.max_sale_qty')} />
                      </FormField>
                      <FormField label="Qtd. Notificação">
                        <Input type="number" {...control.register('stock_data.notify_stock_qty')} />
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
                        <Input type="number" step="0.001" {...control.register('weight')} />
                      </FormField>
                      <FormField label="Comprimento (cm)">
                        <Input type="number" {...control.register('custom_attributes_map.volume_length')} />
                      </FormField>
                      <FormField label="Largura (cm)">
                        <Input type="number" {...control.register('custom_attributes_map.volume_width')} />
                      </FormField>
                      <FormField label="Altura (cm)">
                        <Input type="number" {...control.register('custom_attributes_map.volume_height')} />
                      </FormField>
                      <FormField label="Lead Time (Dias)">
                        <Input type="number" {...control.register('custom_attributes_map.lead_time')} />
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
                       <Input type="number" {...control.register('custom_attributes_map.ordena_busca')} />
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
                           <Input {...control.register('custom_attributes_map.modelo')} />
                        </FormField>
                        <FormField label="Anos (IDs CSV)">
                           <Input {...control.register('custom_attributes_map.ano')} />
                        </FormField>
                        <FormField label="Versões (IDs CSV)">
                           <Input {...control.register('custom_attributes_map.versao')} />
                        </FormField>
                        <FormField label="String de Compatibilidade Completa">
                           <textarea 
                             className="w-full min-h-[100px] p-3 rounded-lg border border-border bg-input-background text-xs font-mono"
                             {...control.register('custom_attributes_map.compatibilidade')}
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
                          <Input {...control.register('custom_attributes_map.marca_anymarket')} />
                        </FormField>
                        <FormField label="Garantia (Meses)">
                          <Input type="number" {...control.register('custom_attributes_map.garantia_meses_any')} />
                        </FormField>
                        <FormField label="Texto Garantia">
                          <Input {...control.register('custom_attributes_map.garantia_texto_anymarket')} />
                        </FormField>
                      </div>
                   </FormSection>
                 </Card.Content>
               </Card.Root>

               {/* Seção M - Outros */}
               <Card.Root>
                 <Card.Content className="p-6">
                   <FormSection title="M. Embalagem e Origem">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField label="Tipo Embalagem">
                          <Input {...control.register('custom_attributes_map.ts_packaging_type')} />
                        </FormField>
                        <FormField label="País Origem">
                          <Input {...control.register('custom_attributes_map.ts_country_of_origin')} />
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
                              <Input {...control.register('custom_attributes_map.image')} className="font-mono text-xs" />
                            </FormField>
                            <FormField label="Small Image">
                              <Input {...control.register('custom_attributes_map.small_image')} className="font-mono text-xs" />
                            </FormField>
                            <FormField label="Thumbnail">
                              <Input {...control.register('custom_attributes_map.thumbnail')} className="font-mono text-xs" />
                            </FormField>
                            <FormField label="Swatch">
                              <Input {...control.register('custom_attributes_map.swatch_image')} className="font-mono text-xs" />
                            </FormField>
                          </div>
                          
                          <div className="space-y-4">
                             <h4 className="text-sm font-medium">Labels (Alt Text)</h4>
                             <FormField label="Image Label">
                               <Input {...control.register('custom_attributes_map.image_label')} />
                             </FormField>
                             <FormField label="Small Image Label">
                               <Input {...control.register('custom_attributes_map.small_image_label')} />
                             </FormField>
                             <FormField label="Thumbnail Label">
                               <Input {...control.register('custom_attributes_map.thumbnail_label')} />
                             </FormField>
                          </div>
                       </div>

                       <div className="mt-8 pt-8 border-t border-border">
                         <h4 className="text-sm font-medium mb-4">Galeria (Media Gallery Entries)</h4>
                         <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                            {(watch('media_gallery_entries') || []).map((entry: any, idx: number) => (
                               <div key={idx} className="relative group aspect-square bg-secondary rounded-lg border border-border overflow-hidden">
                                  <img 
                                    src={entry.file.startsWith('http') ? entry.file : `https://www.toyoparts.com.br/pub/media/catalog/product${entry.file}`} 
                                    alt="" 
                                    className="w-full h-full object-cover"
                                  />
                                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-2 text-white text-xs">
                                     <p className="font-mono truncate w-full text-center">{entry.file}</p>
                                     <Badge className="mt-2" variant="outline">Pos: {entry.position}</Badge>
                                  </div>
                               </div>
                            ))}
                            <div className="aspect-square rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center text-muted-foreground hover:text-primary hover:border-primary transition-colors cursor-pointer">
                               <Plus className="w-8 h-8" />
                               <span className="text-xs font-medium mt-2">Adicionar</span>
                            </div>
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