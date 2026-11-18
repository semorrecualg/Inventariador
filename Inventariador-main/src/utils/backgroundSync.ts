/**
 * O CICLO DE FUNDO NÃO DEPENDE DA FILIAL DA SESSÃO
 * ============================================================================
 * O temporizador de sincronização exigia `sessionStorage.getItem('filial')`.
 * O Android esvazia o `sessionStorage` quando mata a WebView em segundo plano e
 * o ecrã continua a mostrar a unidade (o cabeçalho lê o `localStorage`): o ciclo
 * de 60 s passava a sair em silêncio, para sempre, e os ativos tocados ficavam
 * «Pendente Nuvem · base por espelhar» durante horas.
 *
 * A filial não pertence a esta barreira. `processDataSyncQueue` resolve-a com
 * `readActiveFilial()` (sessão ou `localStorage`), casa com a unidade do registo
 * e audita os pendentes que descarta — se não houver unidade nenhuma, ele próprio
 * devolve 0 e explica por quê. Aqui só se exige sessão com contrato.
 */
export const shouldRunBackgroundSync = (
  user: { tenantid?: string | null } | null | undefined
): boolean => Boolean(String(user?.tenantid || '').trim());
