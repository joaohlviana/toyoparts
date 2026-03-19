
export type FilterOperator = 
  | 'eq' | 'neq' 
  | 'gt' | 'gte' | 'lt' | 'lte' 
  | 'between' 
  | 'in' | 'not_in'
  | 'contains' | 'not_contains'
  | 'starts_with' | 'ends_with'
  | 'is_true' | 'is_false'
  | 'is_set' | 'not_set';

export type FilterFieldType = 'text' | 'number' | 'boolean' | 'select' | 'multi-select' | 'date';

export interface FilterFieldConfig {
  key: string;
  label: string;
  type: FilterFieldType;
  operators: FilterOperator[];
  icon?: string; // lucide icon name for visual hint
  options?: { label: string; value: string | number }[];
  placeholder?: string;
}

export interface FilterRule {
  id: string;
  type: 'rule';
  field: string;
  operator: FilterOperator;
  value: any;
}

export interface FilterGroup {
  id: string;
  type: 'group';
  operator: 'and' | 'or';
  children: (FilterGroup | FilterRule)[];
}

export type FilterNode = FilterGroup | FilterRule;

export interface FilterBuilderState {
  root: FilterGroup;
}

// Operator labels in Portuguese
export const OPERATOR_LABELS: Record<FilterOperator, string> = {
  eq: 'É igual a',
  neq: 'Diferente de',
  gt: 'Maior que',
  gte: 'Maior ou igual',
  lt: 'Menor que',
  lte: 'Menor ou igual',
  between: 'Entre',
  in: 'Está em',
  not_in: 'Não está em',
  contains: 'Contém',
  not_contains: 'Não contém',
  starts_with: 'Começa com',
  ends_with: 'Termina com',
  is_true: 'Sim',
  is_false: 'Não',
  is_set: 'Está preenchido',
  not_set: 'Está vazio',
};

// Operators grouped by field type for easy reference
export const OPERATORS_BY_TYPE: Record<FilterFieldType, FilterOperator[]> = {
  text: ['contains', 'not_contains', 'starts_with', 'ends_with', 'eq', 'neq', 'is_set', 'not_set'],
  number: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between'],
  boolean: ['is_true', 'is_false'],
  select: ['eq', 'neq'],
  'multi-select': ['in', 'not_in'],
  date: ['eq', 'gt', 'lt', 'between'],
};
