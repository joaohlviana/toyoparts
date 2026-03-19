import { v4 as uuidv4 } from 'uuid';
import { FilterGroup, FilterRule, FilterNode, FilterOperator } from './types';
import { PRODUCT_FILTER_FIELDS } from './config';

// Create a new empty rule with smart defaults based on field type
export function createRule(field: string = 'name'): FilterRule {
  const fieldConfig = PRODUCT_FILTER_FIELDS.find(f => f.key === field);
  const defaultOp = fieldConfig?.operators[0] || 'eq';
  const defaultValue = fieldConfig?.type === 'multi-select' ? [] 
    : fieldConfig?.type === 'boolean' ? undefined 
    : '';
  
  return {
    id: uuidv4(),
    type: 'rule',
    field,
    operator: defaultOp,
    value: defaultValue,
  };
}

// Create a new empty group
export function createGroup(operator: 'and' | 'or' = 'and'): FilterGroup {
  return {
    id: uuidv4(),
    type: 'group',
    operator,
    children: [createRule()],
  };
}

// Traverse and find node to update
export function updateNode(
  root: FilterGroup,
  nodeId: string,
  updater: (node: FilterNode) => FilterNode
): FilterGroup {
  if (root.id === nodeId) {
    return updater(root) as FilterGroup;
  }

  return {
    ...root,
    children: root.children.map((child) => {
      if (child.id === nodeId) {
        return updater(child);
      }
      if (child.type === 'group') {
        return updateNode(child, nodeId, updater);
      }
      return child;
    }),
  };
}

// Remove a node
export function removeNode(root: FilterGroup, nodeId: string): FilterGroup {
  return {
    ...root,
    children: root.children
      .filter((child) => child.id !== nodeId)
      .map((child) => {
        if (child.type === 'group') {
          return removeNode(child, nodeId);
        }
        return child;
      }),
  };
}

// Sentinel value for "Sem categoria" inside the categories multi-select
export const NO_CATEGORY_SENTINEL = '__no_category__';

// Convert Builder State to Flat Backend Filters
export function builderToFilters(root: FilterGroup): Record<string, any> {
  const filters: Record<string, any> = {
    status: '',
    inStock: '',
    minPrice: '',
    maxPrice: '',
    categories: [],
    modelos: [],
    anos: [],
    noCategory: false,
    hasPromotion: false,
    hasImage: '',
    type_id: '',
    name: '',
    nameOp: '',
    sku: '',
    skuOp: '',
  };

  function traverse(node: FilterNode) {
    if (node.type === 'group') {
      node.children.forEach(traverse);
    } else {
      const { field, operator, value } = node;
      
      switch (field) {
        case 'name':
          if (value) {
            filters.name = value;
            filters.nameOp = operator;
          }
          break;
        case 'sku':
          if (value) {
            filters.sku = value;
            filters.skuOp = operator;
          }
          break;
        case 'status':
          if (operator === 'eq' && value) filters.status = value;
          break;
        case 'inStock':
          if (operator === 'eq' && value) filters.inStock = value;
          break;
        case 'price':
          if (operator === 'gte') filters.minPrice = value;
          if (operator === 'lte') filters.maxPrice = value;
          if (operator === 'gt') filters.minPrice = value;
          if (operator === 'lt') filters.maxPrice = value;
          if (operator === 'eq') { filters.minPrice = value; filters.maxPrice = value; }
          if (operator === 'between' && Array.isArray(value)) {
            filters.minPrice = value[0];
            filters.maxPrice = value[1];
          }
          break;
        case 'categories':
          if ((operator === 'in' || operator === 'not_in') && Array.isArray(value)) {
            // Separate the sentinel from real category IDs
            const realIds = value.filter((v: string) => v !== NO_CATEGORY_SENTINEL);
            if (value.includes(NO_CATEGORY_SENTINEL)) {
              filters.noCategory = true;
            }
            filters.categories = [...filters.categories, ...realIds];
          }
          break;
        case 'modelos':
          if ((operator === 'in' || operator === 'not_in') && Array.isArray(value)) {
            filters.modelos = [...filters.modelos, ...value];
          }
          break;
        case 'anos':
          if ((operator === 'in' || operator === 'not_in') && Array.isArray(value)) {
            filters.anos = [...filters.anos, ...value];
          }
          break;
        case 'noCategory':
          if (operator === 'is_true') filters.noCategory = true;
          break;
        case 'hasPromotion':
          if (operator === 'is_true') filters.hasPromotion = true;
          break;
        case 'hasImage':
          if (operator === 'eq' && value) filters.hasImage = value;
          break;
        case 'type_id':
          if (operator === 'eq' && value) filters.type_id = value;
          break;
      }
    }
  }

  traverse(root);
  
  // Deduplicate arrays
  filters.categories = [...new Set(filters.categories)];
  filters.modelos = [...new Set(filters.modelos)];
  filters.anos = [...new Set(filters.anos)];

  return filters;
}

// Convert existing Filters back to Builder State (for initial load)
export function filtersToBuilder(filters: any): FilterGroup {
  const root = createGroup('and');
  root.children = [];

  if (filters.name) {
    const r = createRule('name');
    r.operator = filters.nameOp || 'contains';
    r.value = filters.name;
    root.children.push(r);
  }
  if (filters.sku) {
    const r = createRule('sku');
    r.operator = filters.skuOp || 'contains';
    r.value = filters.sku;
    root.children.push(r);
  }
  if (filters.status) {
    const r = createRule('status');
    r.value = filters.status;
    root.children.push(r);
  }
  if (filters.inStock) {
    const r = createRule('inStock');
    r.value = filters.inStock;
    root.children.push(r);
  }
  if (filters.minPrice || filters.maxPrice) {
    const r = createRule('price');
    r.operator = 'between';
    r.value = [filters.minPrice || 0, filters.maxPrice || 0];
    root.children.push(r);
  }
  if (filters.categories?.length || filters.noCategory) {
    const r = createRule('categories');
    r.operator = 'in';
    // Merge real category IDs + sentinel if noCategory is active
    const vals = [...(filters.categories || [])];
    if (filters.noCategory) vals.unshift(NO_CATEGORY_SENTINEL);
    r.value = vals;
    root.children.push(r);
  }
  if (filters.modelos?.length) {
    const r = createRule('modelos');
    r.operator = 'in';
    r.value = filters.modelos;
    root.children.push(r);
  }
  if (filters.anos?.length) {
    const r = createRule('anos');
    r.operator = 'in';
    r.value = filters.anos;
    root.children.push(r);
  }
  if (filters.hasPromotion) {
    const r = createRule('hasPromotion');
    r.operator = 'is_true';
    root.children.push(r);
  }
  if (filters.hasImage) {
    const r = createRule('hasImage');
    r.value = filters.hasImage;
    root.children.push(r);
  }
  if (filters.type_id) {
    const r = createRule('type_id');
    r.value = filters.type_id;
    root.children.push(r);
  }

  if (root.children.length === 0) {
    root.children.push(createRule());
  }

  return root;
}

export function serializeBuilderToUrl(root: FilterGroup): string {
  try {
    return btoa(JSON.stringify(root));
  } catch (e) {
    return '';
  }
}

export function parseBuilderFromUrl(str: string): FilterGroup | null {
  try {
    return JSON.parse(atob(str));
  } catch (e) {
    return null;
  }
}