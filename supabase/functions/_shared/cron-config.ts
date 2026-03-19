/**
 * Configuração do CRON Job
 * 
 * Para configurar no Supabase:
 * 1. Acesse: https://supabase.com/dashboard/project/[seu-project-id]/functions
 * 2. Clique na função "server"
 * 3. Vá em "Settings" > "Cron Jobs"
 * 4. Adicione um novo job:
 *    - Schedule: "0 */6 * * *" (a cada 6 horas)
 *    - Path: "/make-server-1d6e33e0/cron/sync-products"
 *    - Method: GET
 * 
 * Ou use o comando SQL no Supabase:
 */

export const CRON_SCHEDULE = {
  // A cada 6 horas
  SYNC_PRODUCTS: '0 */6 * * *',
  
  // Alternativas:
  // '0 0 * * *'     - Diariamente à meia-noite
  // '0 */12 * * *'  - A cada 12 horas
  // '0 2 * * *'     - Diariamente às 2h da manhã
};

export const CRON_ENDPOINT = '/make-server-1d6e33e0/cron/sync-products';
