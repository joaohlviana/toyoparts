export interface FallbackCategoryNode {
  id: number;
  parent_id: number;
  name: string;
  level: number;
  is_active: boolean;
  product_count: number;
  children_data?: FallbackCategoryNode[];
  children?: FallbackCategoryNode[];
}

const createNode = (
  id: number,
  parentId: number,
  name: string,
  level: number,
  children: FallbackCategoryNode[] = [],
  productCount = 0
): FallbackCategoryNode => ({
  id,
  parent_id: parentId,
  name,
  level,
  is_active: true,
  product_count: productCount || children.reduce((sum, child) => sum + Number(child.product_count || 0), 0),
  children_data: children,
});

export const FALLBACK_CATEGORY_TREE: FallbackCategoryNode = createNode(1, 0, 'Root', 0, [
  createNode(-100, 1, 'Acessórios Exteriores', 1, [
    createNode(-101, -100, 'Cromados', 2),
    createNode(-102, -100, 'Aerofólios, Spoilers e Antenas', 2),
    createNode(-103, -100, 'Engates e Chicotes', 2),
    createNode(-104, -100, 'Frisos e Apliques', 2),
    createNode(-105, -100, 'Rodas e Calotas', 2),
    createNode(-106, -100, 'Suporte, Racks e Bagageiros', 2),
    createNode(-107, -100, 'Ponteiras', 2),
  ]),
  createNode(-200, 1, 'Acessórios Interiores', 1, [
    createNode(-201, -200, 'Tapetes', 2),
    createNode(-202, -200, 'Frisos e Apliques', 2),
    createNode(-203, -200, 'Multimídia', 2),
    createNode(-204, -200, 'Porta-malas', 2),
  ]),
  createNode(-300, 1, 'Iluminação', 1, [
    createNode(-301, -300, 'Faróis e Lanternas', 2),
    createNode(-302, -300, 'Lâmpadas', 2),
    createNode(-303, -300, 'Farol de Neblina', 2),
  ]),
  createNode(-400, 1, 'Alarmes e Segurança', 1, [
    createNode(-401, -400, 'Alarme e Segurança', 2),
    createNode(-402, -400, 'Sensor de Estacionamento', 2),
  ]),
  createNode(-500, 1, 'Peças e Manutenção', 1, [
    createNode(-501, -500, 'Filtros', 2),
    createNode(-502, -500, 'Freio', 2),
    createNode(-503, -500, 'Suspensão', 2),
    createNode(-504, -500, 'Motor', 2),
    createNode(-505, -500, 'Ferramentas e Equipamentos', 2),
  ]),
]);

export const hasRenderableCategoryChildren = (tree: FallbackCategoryNode | null | undefined): boolean => {
  if (!tree) return false;
  const queue: FallbackCategoryNode[] = [tree];

  while (queue.length > 0) {
    const node = queue.shift();
    if (!node) continue;
    const children = (node.children_data || node.children || []).filter((child) => child.is_active !== false);
    if (children.length > 1) return true;
    queue.push(...children);
  }

  return false;
};
