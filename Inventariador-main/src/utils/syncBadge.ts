import type { Asset } from '../types';
import { isConferido } from './conferencia';

/**
 * SELO DE SINCRONIZAÇÃO DO CARTÃO ("Sincronizado" × "Pendente Nuvem")
 * ============================================================================
 * `_is_synced = 1` significa apenas **"esta linha está igual à nuvem agora"**.
 * Um pull da base (`fetchFullInventory` → `bulkInsertAssetsOfflineFirst` com
 * `markSynced: true`) marca assim TODOS os 12 mil ativos da unidade — inclusive
 * os que o auditor nunca tocou. Mostrar "Sincronizado" nesses cartões fazia
 * parecer que o app tinha subido a base inteira para a nuvem, quando o que
 * aconteceu foi o contrário: ela acabou de descer.
 *
 * O selo passa a falar só do trabalho do auditor:
 *   - conferido e na nuvem      → "Sincronizado";
 *   - conferido e fora da nuvem → "Pendente Nuvem";
 *   - não conferido, fora da nuvem → "Pendente Nuvem" (base importada que ainda
 *     não foi espelhada — é uma pendência real);
 *   - não conferido e já na nuvem  → **sem selo**: é base, não conferência.
 */
export type SyncBadgeState = 'sincronizado' | 'pendente' | null;

/** Linha igual à nuvem neste momento (não implica ter sido conferida). */
const isNaNuvem = (asset: Asset): boolean => Number(asset._is_synced) === 1;

export const syncBadgeState = (asset: Asset): SyncBadgeState => {
  const naNuvem = isNaNuvem(asset);

  if (!isConferido(asset) && naNuvem) return null;
  return naNuvem ? 'sincronizado' : 'pendente';
};

/**
 * MOTIVO E IDADE DA PENDÊNCIA
 * ============================================================================
 * «Pendente Nuvem» sozinho não distingue duas situações que pedem acções
 * diferentes: uma conferência deste aparelho que ainda não subiu, e uma base
 * importada que nunca foi espelhada. E, sem idade, uma pendência de minutos
 * parece igual a uma esquecida desde a semana passada.
 *
 * O motivo sai do próprio registo (`_conferido`), sem consultar a rede; a
 * idade sai da última data gravada no cartão (`_dataLeitura` para conferência,
 * `_lastUpdated` para base). Quando o registo não tem data nenhuma, a idade é
 * omitida em vez de inventada.
 */
export interface SyncPendingInfo {
  motivo: 'conferência por enviar' | 'base por espelhar';
  /** Texto curto (ex.: «há 2 h») ou null quando o registo não tem data. */
  idade: string | null;
}

/** Idade em texto curto: «agora», «há 5 min», «há 3 h», «há 2 d». */
export const formatPendingAge = (
  value: string | null | undefined,
  now: number = Date.now()
): string | null => {
  const ts = value ? new Date(value).getTime() : NaN;
  if (!Number.isFinite(ts)) return null;

  // Relógio do aparelho atrasado não pode produzir «há -3 min».
  const minutes = Math.floor(Math.max(0, now - ts) / 60000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  return `há ${Math.floor(hours / 24)} d`;
};

/** Sem selo (já na nuvem) não há motivo nem idade; a conferência decide a data. */
export const syncPendingInfo = (asset: Asset, now: number = Date.now()): SyncPendingInfo | null => {
  if (isNaNuvem(asset)) return null;

  const conferido = isConferido(asset);
  return {
    motivo: conferido ? 'conferência por enviar' : 'base por espelhar',
    idade: formatPendingAge(conferido ? asset._dataLeitura : asset._lastUpdated, now)
  };
};
