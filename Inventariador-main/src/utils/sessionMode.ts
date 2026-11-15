// ============================================================================
// sessionMode.ts — que modo de base o login deve activar.
//
// O `onLogin` do App decidia o modo pelo valor que já estava guardado em
// `app_database_mode`: quem tinha ficado em INTERNAL (demo, ou uma carga local
// anterior) continuava em INTERNAL mesmo autenticando com um MASTER no Supabase.
// Como o pull da nuvem só corre em modo SUPABASE, a base ficava vazia e o
// seletor de contrato dizia "nenhuma filial na base deste contrato".
//
// A decisão passa a vir da ORIGEM da sessão: quem autenticou no Supabase entra
// em BASE OFICIAL; credencial local do app (ou build sem credenciais) entra em
// BASE LOCAL.
// ============================================================================

/** De onde veio a sessão que o Login acabou de abrir. */
export type LoginOrigin = 'SUPABASE' | 'LOCAL';

/**
 * @param origem origem da sessão; `undefined` em chamadas antigas/conhecidas
 * @param credenciaisNuvem o build tem URL e chave do Supabase (`!isInternalMode`)
 */
export const deveEntrarEmModoNuvem = (
  origem: LoginOrigin | undefined | null,
  credenciaisNuvem: boolean
): boolean => credenciaisNuvem && origem !== 'LOCAL';
