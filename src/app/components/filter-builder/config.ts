import { FilterFieldConfig } from './types';

export const PRODUCT_FILTER_FIELDS: FilterFieldConfig[] = [
  {
    key: 'name',
    label: 'Nome do Produto',
    type: 'text',
    operators: ['contains', 'not_contains', 'starts_with', 'ends_with', 'eq', 'neq'],
    placeholder: 'Ex: Filtro de Óleo...',
  },
  {
    key: 'sku',
    label: 'SKU',
    type: 'text',
    operators: ['contains', 'starts_with', 'ends_with', 'eq', 'neq'],
    placeholder: 'Ex: TOY-12345...',
  },
  {
    key: 'status',
    label: 'Status',
    type: 'select',
    operators: ['eq', 'neq'],
    options: [
      { label: 'Ativo', value: '1' },
      { label: 'Inativo', value: '2' },
    ],
  },
  {
    key: 'inStock',
    label: 'Estoque',
    type: 'select',
    operators: ['eq'],
    options: [
      { label: 'Em Estoque', value: 'true' },
      { label: 'Esgotado', value: 'false' },
    ],
  },
  {
    key: 'price',
    label: 'Preço',
    type: 'number',
    operators: ['eq', 'gt', 'gte', 'lt', 'lte', 'between'],
    placeholder: 'R$ 0,00',
  },
  {
    key: 'categories',
    label: 'Categorias',
    type: 'multi-select',
    operators: ['in', 'not_in'],
    // Options loaded dynamically: full category list + "Sem categoria" sentinel
  },
  {
    key: 'modelos',
    label: 'Modelos',
    type: 'multi-select',
    operators: ['in', 'not_in'],
    // Options loaded dynamically from facets
  },
  {
    key: 'anos',
    label: 'Anos',
    type: 'multi-select',
    operators: ['in', 'not_in'],
    // Options loaded dynamically from facets
  },
  {
    key: 'hasPromotion',
    label: 'Tem Promoção',
    type: 'boolean',
    operators: ['is_true', 'is_false'],
  },
  {
    key: 'hasImage',
    label: 'Tem Imagem',
    type: 'select',
    operators: ['eq'],
    options: [
      { label: 'Com Imagem', value: 'true' },
      { label: 'Sem Imagem', value: 'false' },
    ],
  },
  {
    key: 'type_id',
    label: 'Tipo de Produto',
    type: 'select',
    operators: ['eq', 'neq'],
    options: [
      { label: 'Simples', value: 'simple' },
      { label: 'Configurável', value: 'configurable' },
    ],
  },
  {
    key: 'posicao',
    label: 'Posição',
    type: 'select',
    operators: ['eq', 'neq'],
    options: [
      { label: 'Dianteira', value: 'Dianteira' },
      { label: 'Traseira', value: 'Traseira' },
      { label: 'Superior', value: 'Superior' },
      { label: 'Inferior', value: 'Inferior' },
      { label: 'Interna', value: 'Interna' },
      { label: 'Externa', value: 'Externa' },
    ],
  },
  {
    key: 'lado',
    label: 'Lado',
    type: 'select',
    operators: ['eq', 'neq'],
    options: [
      { label: 'Esquerdo (Motorista)', value: 'Esquerdo' },
      { label: 'Direito (Passageiro)', value: 'Direito' },
      { label: 'Ambos', value: 'Ambos' },
    ],
  },
  {
    key: 'material',
    label: 'Material',
    type: 'text',
    operators: ['contains', 'eq'],
    placeholder: 'Ex: Aço, Plástico...',
  },
];
