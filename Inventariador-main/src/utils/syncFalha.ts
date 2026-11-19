/**
 * FALHA DE ENVIO VISÍVEL NO APARELHO
 * ============================================================================
 * «Pendente Nuvem» diz que o registo está fora da nuvem, não *porquê*. Um ativo
 * que a nuvem recusou (RLS, coluna inexistente, sessão inválida) e um ativo que
 * só ainda não teve a sua vez de subir apareciam exactamente iguais no cartão —
 * e o operador não tinha como saber se devia esperar ou agir.
 *
 * A recusa já ficava em `audit_logs` (`SYNC_RECORD_FAIL` /
 * `SYNC_RECORD_EXCEPTION`), longe do ativo e num separador diferente. Este
 * módulo carimba o próprio registo local com a última recusa, para o cartão e o
 * botão global a poderem mostrar sem consultar a trilha.
 *
 * O carimbo é apagado no sucesso (`markRecordSynced`): é a mesma flag
 * `_is_synced` que deixa de estar a 0, por isso o aviso não sobrevive ao envio.
 */
import { formatPendingAge } from './syncBadge';

/**
 * Intervalo mínimo entre dois carimbos do mesmo registo.
 *
 * O ciclo de fundo corre a cada 60 s. Sem este limite, um ativo preso com o
 * mesmo erro reescrevia o registo local 1.440 vezes por dia (e cada escrita
 * acorda o contador do selo, que lê `local_assets` a cada 5 s).
 */
export const SYNC_FAILURE_STAMP_WINDOW_MS = 10 * 60 * 1000;

/** Tamanho máximo do motivo guardado no registo (o detalhe completo fica na trilha). */
const MOTIVO_MAX = 90;

export interface SyncFailureStamp {
  /** Data da última tentativa recusada (ISO). */
  _syncFailAt: string;
  /** Motivo curto da recusa, para o selo do cartão. */
  _syncFailReason: string;
}

export interface SyncFailureInfo {
  motivo: string;
  /** Texto curto (ex.: «há 5 min») ou null quando o carimbo não tem data legível. */
  idade: string | null;
}

/** Um motivo numa linha só, curto o suficiente para o selo do cartão. */
export const resumirMotivoFalha = (motivo: string): string => {
  const limpo = String(motivo ?? '').replace(/\s+/g, ' ').trim();
  if (!limpo) return 'erro sem detalhe';
  if (limpo.length <= MOTIVO_MAX) return limpo;
  return `${limpo.slice(0, MOTIVO_MAX - 1).trimEnd()}…`;
};

/**
 * Carimbo a gravar — ou `null` quando não vale a pena reescrever o registo.
 *
 * Não reescreve quando a última tentativa foi há menos de
 * `SYNC_FAILURE_STAMP_WINDOW_MS` com o mesmo motivo; um motivo diferente é
 * sempre registado, porque é informação nova para o operador. A idade mostrada
 * é a da última tentativa conhecida, que pode ter até uma janela de atraso.
 */
export const carimbarFalhaEnvio = (
  actual: { _syncFailAt?: unknown; _syncFailReason?: unknown } | null | undefined,
  motivo: string,
  agora: number = Date.now()
): SyncFailureStamp | null => {
  const motivoNovo = resumirMotivoFalha(motivo);
  const anterior = actual?._syncFailAt ? new Date(String(actual._syncFailAt)).getTime() : NaN;
  const dentroDaJanela = Number.isFinite(anterior) && agora - anterior < SYNC_FAILURE_STAMP_WINDOW_MS;
  const mesmoMotivo = String(actual?._syncFailReason ?? '') === motivoNovo;

  if (dentroDaJanela && mesmoMotivo) return null;
  return { _syncFailAt: new Date(agora).toISOString(), _syncFailReason: motivoNovo };
};

/**
 * Motivo e idade para o selo do cartão. Sem carimbo não há aviso — um registo
 * só na fila continua a ser «Pendente Nuvem» sem falha nenhuma a declarar.
 */
export const syncFailureInfo = (
  asset: { _syncFailAt?: unknown; _syncFailReason?: unknown } | null | undefined,
  now: number = Date.now()
): SyncFailureInfo | null => {
  if (!asset?._syncFailAt) return null;

  const motivo = String(asset._syncFailReason ?? '').trim();
  return {
    motivo: motivo || 'erro sem detalhe',
    idade: formatPendingAge(String(asset._syncFailAt), now)
  };
};
