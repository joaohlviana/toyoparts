# Toyoparts Public Next

App paralelo em Next.js para a vitrine publica da fase 1 da migracao.

## Escopo da fase 1

Rotas migradas no Next:

- `/`
- `/sobre`
- `/privacidade`
- `/entrega`
- `/troca-devolucoes`
- `/rastreamento-correios`
- `/loja-fisica`
- `/fale-conosco`
- `/produto/[sku]`
- `/produto/[sku]/[slug]`
- `/pecas`
- `/pecas/[modelo]`
- `/pecas/[modelo]/[categoriaSlug]`
- categorias e subcategorias canonicas via catch-all publico

Rotas que continuam no legado:

- `/admin/*`
- `/checkout/*`
- `/acesso`
- `/auth/*`
- `/minha-conta/*`
- `/busca*`

## Variaveis de ambiente

Defina `LEGACY_ORIGIN` e `NEXT_PUBLIC_LEGACY_ORIGIN` apontando para o host legado durante a convivencia entre apps.

Exemplo:

```env
LEGACY_ORIGIN=https://toyoparts-legacy.vercel.app
NEXT_PUBLIC_LEGACY_ORIGIN=https://toyoparts-legacy.vercel.app
```

As rewrites do Next usam esse host para encaminhar os fluxos fora do escopo da fase 1 sem quebrar checkout, login, busca e admin.

## Scripts

```bash
npm run dev
npm run build
npm run start
```
