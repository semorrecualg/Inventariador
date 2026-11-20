/**
 * CLASSIFICAÇÃO DAS AÇÕES DA TRILHA DE AUDITORIA
 * ============================================================================
 * A aba «Ativos» filtra pelo `table_name` **e** por uma lista de ações. As
 * recusas do envio (`SYNC_RECORD_FAIL` / `SYNC_RECORD_EXCEPTION`) são gravadas
 * com `table_name: 'local_assets'` e não estavam nessa lista: a falha que
 * explica um «Pendente Nuvem» eterno caía no separador «Sistema», em cinzento,
 * longe do ativo a que diz respeito.
 *
 * Estas funções vivem fora do componente para poderem ser verificadas sem
 * renderizar a trilha inteira.
 */

/**
 * Recusas do envio do ativo — a causa de um pendente que não sai do aparelho.
 * São prova de auditoria: o expurgo de 7 dias não as apaga (ver
 * `services/auditoriaRetencao.ts`).
 */
export const ACOES_DE_FALHA_DE_ENVIO: ReadonlySet<string> = new Set([
  'SYNC_RECORD_FAIL',
  'SYNC_RECORD_EXCEPTION'
]);

/** A ação é uma recusa de envio registada? (aceita caixa indiferente) */
export const ehFalhaDeEnvio = (acao: unknown): boolean =>
  ACOES_DE_FALHA_DE_ENVIO.has(String(acao || '').toUpperCase());

/** Ações que a trilha de ATIVOS mostra. */
const ASSET_LOG_ACTIONS = new Set([
  'CREATE', 'INSERT', 'UPDATE', 'DELETE', 'IMPAIRMENT', 'UNITARIZAÇÃO',
  'ACQUISITION', 'TRANSFER', 'SALE', 'WRITE_OFF', 'RECONCILIAÇÃO',
  ...ACOES_DE_FALHA_DE_ENVIO
]);

export interface ActionLogLike {
  action?: string;
  table_name?: string;
}

export const isAssetLog = (log: ActionLogLike): boolean => {
  const table = String(log.table_name || '').toLowerCase();
  if (table === 'assets' || table === 'ativos') return true;
  return ASSET_LOG_ACTIONS.has(String(log.action || '').toUpperCase());
};

/** Cor do selo de ação na lista (a falha de envio é vermelha, como as baixas). */
export const getActionColor = (action: string): string => {
  switch (action) {
    case 'DELETE':
    case 'WRITE_OFF':
    case 'SALE':
    case 'SYNC_RECORD_FAIL':
    case 'SYNC_RECORD_EXCEPTION':
      return 'bg-red-100 text-red-700 border-red-200';
    case 'INSERT':
    case 'CREATE':
    case 'ACQUISITION':
      return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    case 'UPDATE':
    case 'BULK_UPDATE':
    case 'RECONCILIAÇÃO':
      return 'bg-blue-100 text-blue-700 border-blue-200';
    case 'LOGIN':
      return 'bg-purple-100 text-purple-700 border-purple-200';
    case 'IMPAIRMENT':
    case 'UNITARIZAÇÃO':
      return 'bg-amber-100 text-amber-700 border-amber-200';
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200';
  }
};
