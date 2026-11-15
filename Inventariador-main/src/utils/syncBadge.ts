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
