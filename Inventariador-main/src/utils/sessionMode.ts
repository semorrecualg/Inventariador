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

/**
 * Origem de uma sessão que o app encontrou já aberta (reload / auto-login).
 *
 * Sem login a acontecer não há como perguntar ao formulário: usa-se a marca que
 * o login deixou. Sessão marcada como do app (`markAppManagedSession`, gravada
 * nos logins por credencial local) é LOCAL; qualquer outra é a nuvem, porque só
 * chega aqui quem tem sessão Supabase guardada.
 */
export const origemDaSessaoGuardada = (sessaoDoApp: boolean): LoginOrigin =>
  (sessaoDoApp ? 'LOCAL' : 'SUPABASE');

export interface AvisoCargaLocal {
  titulo: string;
  mensagem: string;
}

/**
 * Texto mostrado depois de uma carga de planilha.
 *
 * A carga NÃO troca o modo global de base — antes mudava para INTERNAL e
 * persistia, o que devolvia a app a BASE LOCAL e derrubava o sync do contrato
 * que o login Supabase tinha acabado de activar. A mensagem tem de dizer isso,
 * em vez de anunciar uma troca de modo que já não acontece.
 */
export const avisoAposCargaLocal = (info: {
  count: number;
  tenantids: string[];
  modoActual: string;
}): AvisoCargaLocal => {
  const contrato = info.tenantids[0] ? ` (contrato ${info.tenantids[0]})` : '';
  const naNuvem = String(info.modoActual ?? '').toUpperCase().startsWith('SUPABASE');
  return {
    titulo: naNuvem ? 'Base local carregada — modo mantido' : 'Base local carregada',
    mensagem: `A carga de ${info.count.toLocaleString('pt-BR')} ativos foi gravada na base deste dispositivo${contrato}. ` +
      (naNuvem
        ? 'O modo de base NÃO foi alterado: a app continua em BASE OFICIAL. Espelhe esta base para a nuvem em Gestão e Manutenção quando quiser publicá-la.'
        : 'A Unidade Operacional e o Inventário leem esta base local.')
  };
};
