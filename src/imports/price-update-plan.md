Tá **bem bom** e já está “na direção certa” (parse → cruzamento → fila em batches → relatório). Eu só faria alguns **ajustes de engenharia** pra ficar à prova de 100k linhas + evitar travar UI + reduzir memória + deixar o relatório de “SKU do site sem preço” impecável.

Abaixo vai um **plano refinado** (admin), mantendo sua ideia de “fila inteligente” de Operações.

---

## O que eu manteria do seu plano (100%)

* **Sessão no Admin** “Atualização de Preços”.
* **Batches** (ex.: 200 SKUs) + **progresso + logs**.
* **Backend** que fala com o **Magento** (token só no servidor).
* **Relatório final**: atualizados, erros, e principalmente **SKUs do site não encontrados no arquivo** (exportável).

---

## Ajustes que eu faria (importantes)

### 1) Não guardar 100k itens em Map “à toa”

Em vez de montar `Map` com **todos** os itens do arquivo, faça o parse e **só guarde o que existir no site**.

**Fluxo ideal:**

1. Carrega `siteSkuSet` (SKUs normalizados do site)
2. Parseia arquivo e, linha a linha, se `sku` estiver no `siteSkuSet`, salva no `matchMap` e marca como encontrado
3. No fim: `missing = siteSkuSet - foundSet`

➡️ Isso reduz memória e acelera.

### 2) Parse em **Web Worker**

100k linhas pode travar o React fácil. Parse + matching em **worker** mantém UI lisa.

### 3) Preço sem float (cents)

Seu formato `00294467` = **2944,67**. Então:

* `publ_cents = parseInt(raw, 10)`
* `price = publ_cents / 100`
* `special_cents = round(publ_cents * 0.901)` (9,9% OFF)
* manda pro backend como **string decimal** “2944.67” (ou cents e converte lá)

➡️ evita bugs de arredondamento.

### 4) “Fila inteligente” de verdade (robusta)

Além de chunk:

* **retry com backoff** (ex.: 429/5xx)
* **concurrency adaptativa** (1→3 quando tá ok; cai quando dá rate limit)
* **idempotência** por `runId + batchIndex` (pra retomar sem duplicar)
* **cancelamento** (AbortController) e **resume** (opcional)

---

## Plano definitivo — Atualização de Preços (Admin)

### A) Nova seção / página

* Menu: **Catálogo → Atualização de Preços**
* Página: `PriceUpdatePage.tsx`
* Componentes UI:

  * Upload (drag & drop)
  * Status (Analisando / Cruzando / Pronto)
  * Resumo (contagens)
  * Botões: **Iniciar**, **Cancelar**, **Exportar faltantes**, **Exportar erros**
  * Log em tempo real

---

### B) Backend (Edge Function / API Admin)

**Endpoints:**

1. `GET /admin/price-update/site-skus`

   * Retorna lista paginada (ou inteira) de **SKUs do site já normalizados**
   * Fonte recomendada:

     * **Meilisearch** (rápido) **+ cache KV**
     * (e validação final via Magento quando atualizar, caso índice esteja desatualizado)

2. `POST /admin/price-update/batch`

   * Body: `{ runId, batchIndex, items: [{ sku, price, special_price }] }`
   * Atualiza no Magento e retorna resultado por SKU:

     * `updated[]`, `notFound[]`, `failed[]` com motivo/status code

3. (Opcional, mas bom) `POST /admin/price-update/run/start`

   * Cria runId, salva metadados (quem rodou, data, desconto, totals)

4. (Opcional) `GET /admin/price-update/run/:runId/status`

   * Pra retomar/recarregar a página sem perder o progresso

**Segurança:**

* Só admin (JWT/role)
* Token Magento em env (`MAGENTO_TOKEN`)
* Rate limit e logs no servidor

---

### C) Parser do arquivo (Worker)

**Entrada:** texto do arquivo
**Regras:**

* Ignorar linhas que não começam com `A;`
* Split por `;` (campos fixos)
* `Peca` = coluna “Peca”
* `$Publ` = coluna “$Publ”

**Normalização do SKU**

* `sku = rawSku.trim().toUpperCase().replace(/\s+/g, '')`
* (se seu catálogo tiver hífen/underscore, pode remover também, mas só se você já usa isso no site)

**Conversão do preço**

* `publRaw = "00294467"`
* `publCents = parseInt(publRaw, 10)`
* `price = (publCents / 100).toFixed(2)`
* `special = (Math.round(publCents * 0.901) / 100).toFixed(2)`

**Matching em tempo real**

* Se `sku ∈ siteSkuSet`:

  * `matchMap.set(sku, { price, special })`
  * `foundSet.add(sku)`
* Se SKU repetir no arquivo:

  * manter o **último** e registrar `duplicatesCount`

**Saídas do Worker**

* `matchedCount`
* `missingSkus[]` (do site, não encontrados)
* `matchedItems[]` (array pronto pra batch)
* `duplicatesCount`
* `parseErrors[]` (linhas malformadas)

---

### D) Cruzamento + Relatório antes de rodar

Exibir:

* SKUs do site: X
* Linhas válidas (A;): Y
* SKUs do site com preço encontrado: Z
* **SKUs do site sem preço no arquivo:** W (lista + export)

Botão: **Iniciar Atualização**

---

### E) Processamento em fila (padrão Operações)

**Config padrão:**

* `chunkSize = 200`
* `maxConcurrency = 2~3` (adaptativo)
* `maxRetries = 3`
* `retryBackoff = 1s, 3s, 7s (+ jitter)`

**Execução:**

* Divide `matchedItems` em batches
* Para cada batch:

  * chama `POST /admin/price-update/batch`
  * atualiza UI:

    * progresso (batch/total)
    * tempo por batch
    * contadores: ok / notFound / failed
* Cancelar:

  * aborta fila e mantém parcial com export de erros

---

### F) Pós-processo (obrigatório)

Exibir:

* ✅ Atualizados com sucesso: X
* ⚠️ SKU do site sem preço no arquivo: W (**export CSV**)
* ❌ Erros: Z (**export CSV com motivo**)
* (Bônus) `notFound` retornado pelo Magento (SKU sumiu / índice desatualizado)

---

## Checklist de implementação (bem direto)

* [ ] Criar rota/admin page “Atualização de Preços”
* [ ] `GET site-skus` com cache KV
* [ ] Criar Web Worker: parse + match + progress
* [ ] UI de resumo + export de faltantes
* [ ] Implementar fila (chunk + retry + concurrency adaptativa + cancel)
* [ ] `POST batch` atualizando Magento (price + special_price)
* [ ] Relatórios finais (ok / missing / errors)
* [ ] Guardrails: idempotência por `runId+batchIndex`

---

## Veredito sobre seu plano

✅ **Bom e implementável**.
Com os ajustes acima (principalmente **worker + match durante parse + cents + fila robusta**), fica **profissional e seguro** pra 100k linhas sem travar e com o relatório que você precisa.

Se quiser, eu já posso te entregar o **esqueleto exato**:

* estrutura da página + estados
* contrato dos endpoints
* worker (mensagens progressivas)
* e o “queue runner” igual ao de Operações (com retry/backoff/adaptativo)
