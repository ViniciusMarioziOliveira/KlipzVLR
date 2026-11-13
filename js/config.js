/*
 * =====================================================================
 *  KlipzVLR · CONFIGURAÇÃO DO SUPABASE  (o único arquivo que você edita)
 * =====================================================================
 *  1. Painel do Supabase > Project Settings > API Keys
 *     copie a "Publishable key" (começa com sb_publishable_...).
 *     Se o painel mostrar só a aba "Legacy", a "anon public" também serve.
 *  2. Copie a "Project URL" (Project Settings > Data API, ou botão "Connect").
 *  3. Cole os dois valores abaixo e salve.
 *
 *  Essa chave é PÚBLICA, vai pro navegador mesmo. Quem protege os dados
 *  são as regras RLS do arquivo supabase/schema.sql.
 *  NUNCA cole aqui a "secret key" nem a "service_role".
 * =====================================================================
 */
window.KLIPZ_CONFIG = {
  SUPABASE_URL: 'https://fejaplrzktrkpqflvthr.supabase.co',
  SUPABASE_KEY: 'sb_publishable_VjbS731Rl7CfxWthkeNxxQ_BK8tQXbL',

  // nome do bucket criado pelo schema.sql
  BUCKET: 'clips',

  // limite por arquivo; o plano Free do Supabase aceita no máximo 50 MB
  MAX_UPLOAD_MB: 50,
};
