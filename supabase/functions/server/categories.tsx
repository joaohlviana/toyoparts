import { Hono } from 'npm:hono';
import * as kv from './kv_store.tsx';
import { fetchMagento } from './magento.tsx';

const app = new Hono();

const CATEGORY_TREE_CACHE_KEY = 'meta:category_tree';

// ─── Category image source URLs ──────────────────────────────────────────────
const CATEGORY_IMAGE_SOURCES: Record<string, string> = {
  // Generic categories (toyoparts catalog)
  'acessorios-externos-cromados': 'https://toyoparts.com.br/pub/media/catalog/category/33.jpg',
  'aerofolios-spoilers-e-antenas': 'https://toyoparts.com.br/pub/media/catalog/category/34.jpg',
  'alarme-e-seguranca': 'https://toyoparts.com.br/pub/media/catalog/category/35.jpg',
  'engates-e-chicotes': 'https://toyoparts.com.br/pub/media/catalog/category/38.jpg',
  'ferramentas-e-equipamentos': 'https://toyoparts.com.br/pub/media/catalog/category/39.jpg',
  'frisos-e-apliques': 'https://toyoparts.com.br/pub/media/catalog/category/40.jpg',
  'ponteiras': 'https://toyoparts.com.br/pub/media/catalog/category/41.jpg',
  'rodas-e-calotas': 'https://toyoparts.com.br/pub/media/catalog/category/42.jpg',
  'sensor-de-estacionamento': 'https://toyoparts.com.br/pub/media/catalog/category/43.jpg',
  'suporte-racks-e-bagageiros': 'https://toyoparts.com.br/pub/media/catalog/category/44.jpg',
  // Corolla
  'corolla:acessorios-externos': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/corolla-menu-acessorios-externos.jpg?v=1770635254',
  'corolla:acessorios-internos': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/corolla-menu-acessorios-internos.jpg?v=1770635254',
  'corolla:iluminacao': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/corolla-menu-iluminacao.jpg?v=1770635254',
  'corolla:pecas': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/corolla-menu-pecas.jpg?v=1770635254',
  // Corolla Cross
  'corolla-cross:acessorios-externos': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/banner-departamento-corolla-cross-acessorio-externo.jpg?v=1770635254',
  'corolla-cross:acessorios-internos': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/banner-departamento-corolla-cross-acessorio-interno.jpg?v=1770635254',
  'corolla-cross:iluminacao': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/banne-departamento-corolla-cross-iluminacao.jpg?v=1770635254',
  'corolla-cross:pecas': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/banne-departamento-corolla-cross-pecas.jpg?v=1770635254',
  // Etios
  'etios:acessorios-externos': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/etios-menu-acessorios-externos.jpg?v=1770635254',
  'etios:acessorios-internos': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/etios-menu-acessorios-internos.jpg?v=1770635254',
  'etios:iluminacao': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/etios-menu-iluminacao.jpg?v=1770635254',
  'etios:pecas': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/etios-menu-pecas.jpg?v=1770635254',
  // Hilux
  'hilux:acessorios-externos': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/hilux-menu-acessorios-externos.jpg?v=1770635254',
  'hilux:acessorios-internos': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/hilux-menu-acessorios-internos.jpg?v=1770635254',
  'hilux:iluminacao': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/hilux-menu-iluminacao.jpg?v=1770635254',
  'hilux:pecas': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/hilux-menu-pecas.jpg?v=1770635254',
  'hilux:santo-antonio': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/hilux-menu-santo-antonio.jpg?v=1770635254',
  // SW4
  'sw4:acessorios-externos': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/sw4-menu-acessorios-externos.jpg?v=1770635254',
  'sw4:acessorios-internos': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/sw4-menu-acessorios-internos.jpg?v=1770635254',
  'sw4:iluminacao': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/sw4-menu-iluminacao.jpg?v=1770635254',
  'sw4:pecas': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/sw4-menu-pecas.jpg?v=1770635254',
  'sw4:acessorios-para-pick-up-e-suv': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/sw4-menu-pickup-suv.jpg?v=1770635254',
  // RAV4
  'rav4:acessorios-externos': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/rav4-menu-acessorios-externos.jpg?v=1770635254',
  'rav4:acessorios-internos': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/rav4-menu-acessorios-internos.jpg?v=1770635254',
  'rav4:iluminacao': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/rav4-menu-iluminacao.jpg?v=1770635254',
  'rav4:pecas': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/rav4-menu-pecas.jpg?v=1770635254',
  // Prius
  'prius:acessorios-externos': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/prius-menu-acessorios-externos.jpg?v=1770635254',
  'prius:acessorios-internos': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/prius-menu-acessorios-internos.jpg?v=1770635254',
  'prius:iluminacao': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/prius-menu-iluminacao.jpg?v=1770635254',
  'prius:pecas': 'https://increazy-folder.s3.amazonaws.com/5ebed78a28503303b0530072/prius-menu-pecas.jpg?v=1770635254',
};

// GET /tree - Fetches category tree from KV or Magento
app.get('/tree', async (c) => {
  try {
    // 1. Try Cache
    const cached = await kv.get(CATEGORY_TREE_CACHE_KEY);
    if (cached) {
      return c.json(cached);
    }

    // 2. Fetch from Magento
    // We need the full tree. Magento V1/categories returns the root category with children nested.
    const tree = await fetchMagento('/V1/categories');
    
    // 3. Cache it
    if (tree) {
       await kv.set(CATEGORY_TREE_CACHE_KEY, tree);
    }

    return c.json(tree);
  } catch (e: any) {
    console.error('Category Tree Error:', e);
    // Return empty tree on error to avoid crashing frontend
    return c.json({ id: 1, name: 'Root', children_data: [] });
  }
});

// GET /images - Returns the static image map
app.get('/images', (c) => {
  return c.json({ images: CATEGORY_IMAGE_SOURCES });
});

export const categories = app;
