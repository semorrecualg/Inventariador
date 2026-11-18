import type { Asset } from '../types';

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

export const syncBadgeState = (asset: Asset): SyncBadgeState => {
  const conferido = asset._conferido === true || Number(asset._conferido) === 1;
  const naNuvem = Number(asset._is_synced) === 1;

  if (!conferido && naNuvem) return null;
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
export type SyncPendingReason = 'conferência por enviar' | 'base por espelhar';

export interface SyncPendingInfo {
  motivo: SyncPendingReason;
  /** Texto curto (ex.: «há 2 h») ou null quando não há data no registo. */
  idade: string | null;
}

/** Converte para timestamp só datas legíveis; devolve null para o resto. */
const parseTimestamp = (value?: string | null): number | null => {
  if (!value) return null;
  const ts = new Date(value).getTime();
  return Number.isFinite(ts) ? ts : null;
};

/** Idade em texto curto: «agora», «há 5 min», «há 3 h», «há 2 d». */
export const formatPendingAge = (
  value: string | null | undefined,
  now: number = Date.now()
): string | null => {
  const ts = parseTimestamp(value);
  if (ts === null) return null;

  // Relógio do aparelho atrasado não pode produzir «há -3 min».
  const diffMs = Math.max(0, now - ts);
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  return `há ${Math.floor(hours / 24)} d`;
};

export const syncPendingInfo = (asset: Asset, now: number = Date.now()): SyncPendingInfo | null => {
  if (syncBadgeState(asset) !== 'pendente') return null;

  const conferido = asset._conferido === true || Number(asset._conferido) === 1;
  const data = conferido ? asset._dataLeitura : asset._lastUpdated;

  return {
    motivo: conferido ? 'conferência por enviar' : 'base por espelhar',
    idade: formatPendingAge(data, now)
  };
};
