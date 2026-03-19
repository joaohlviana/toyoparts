# 🔄 Configuração do CRON Job - Sincronização Automática

## 📋 Visão Geral

O sistema está configurado para sincronizar automaticamente os produtos do Magento em background, sem precisar abrir a página ou clicar em botões.

## 🚀 Como Funciona

1. **CRON inicia automaticamente** a cada X horas
2. **Download em background** não bloqueia nada
3. **Você abre a página** e vê a tabela com todos os produtos já sincronizados
4. **Atualização em tempo real** do progresso se a sincronização estiver rodando

## ⚙️ Configurar CRON no Supabase

### Opção 1: Via Interface Web

1. Acesse: `https://supabase.com/dashboard/project/hkxjnykrnhjtkkabgece/functions`
2. Clique na função **"server"**
3. Vá em **Settings** > **Cron Jobs**
4. Clique em **"Add Cron Job"**
5. Configure:
   ```
   Schedule: 0 */6 * * *
   Path: /make-server-1d6e33e0/cron/sync-products
   Method: GET
   ```
6. Salve

### Opção 2: Via SQL (Recomendado)

Execute no SQL Editor do Supabase:

```sql
-- Criar extensão pg_cron se não existir
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Adicionar job de sincronização (a cada 6 horas)
SELECT cron.schedule(
  'sync-toyoparts-products',          -- nome do job
  '0 */6 * * *',                      -- a cada 6 horas
  $$
    SELECT
      net.http_get(
        url := 'https://hkxjnykrnhjtkkabgece.supabase.co/functions/v1/make-server-1d6e33e0/cron/sync-products',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
        )
      ) as request_id;
  $$
);

-- Verificar jobs ativos
SELECT * FROM cron.job;
```

### Opção 3: Via cURL (Teste Manual)

```bash
curl -X GET \
  'https://hkxjnykrnhjtkkabgece.supabase.co/functions/v1/make-server-1d6e33e0/cron/sync-products' \
  -H 'Authorization: Bearer [SEU_ANON_KEY]'
```

## 📅 Frequências Recomendadas

```
0 */6 * * *   - A cada 6 horas (Recomendado)
0 */12 * * *  - A cada 12 horas
0 0 * * *     - Diariamente à meia-noite
0 2 * * *     - Diariamente às 2h da manhã
0 0 * * 0     - Semanalmente aos domingos
```

## 🔍 Monitoramento

### Ver Status Atual

```bash
curl 'https://hkxjnykrnhjtkkabgece.supabase.co/functions/v1/make-server-1d6e33e0/sync/status' \
  -H 'Authorization: Bearer [SEU_ANON_KEY]'
```

### Iniciar Manualmente

```bash
curl -X POST \
  'https://hkxjnykrnhjtkkabgece.supabase.co/functions/v1/make-server-1d6e33e0/sync/start' \
  -H 'Authorization: Bearer [SEU_ANON_KEY]'
```

## 📊 Interface Web

A interface mostra automaticamente:

- ✅ **Status da sincronização** em tempo real
- 📊 **Progresso** com barra visual
- 📋 **Tabela de produtos** com paginação
- 🔍 **Busca** por SKU ou nome
- 🔢 **Estatísticas** (total, em estoque, preço médio)

## 🎯 Endpoints Disponíveis

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/cron/sync-products` | GET | CRON: Iniciar sincronização |
| `/sync/status` | GET | Ver status atual |
| `/sync/start` | POST | Iniciar manualmente |
| `/products` | GET | Listar produtos (paginado) |
| `/products/stats` | GET | Estatísticas |
| `/products/:sku` | GET | Produto específico |

## 🔐 Segurança

- O token do Magento está no servidor (não exposto)
- CRON roda com permissões do Supabase
- Sincronização em background não afeta usuários

## 📝 Logs

Veja os logs no Supabase:
1. Acesse: Functions > server > Logs
2. Procure por mensagens com emoji: 🔄, ✅, ❌, 📦

## ✨ Pronto!

Agora o sistema:
1. ✅ Sincroniza automaticamente a cada 6 horas
2. ✅ Mostra tabela com produtos
3. ✅ Atualiza em tempo real
4. ✅ Funciona em background
5. ✅ Sem necessidade de intervenção manual
