/**
 * Endereço efetivo do ativo — UMA regra para o inventário, a tela de ENDEREÇO
 * FÍSICO (`getLocationsWithStats`), o App e a busca ativa.
 *
 * Precedência: local auditado (`_localMaster`) → `endereco` → `LOCALIZACAO` →
 * `CENTRO_CUSTO`. Manter as pontas alinhadas é o que faz o toque numa
 * localidade encontrar os mesmos ativos em todos os ecrãs.
 */
import { SEM_LOCAL_LABEL } from '../constants/addressLabels';

export type AssetAddressFields = Partial<
  Record<'_localMaster' | 'endereco' | 'LOCALIZACAO' | 'CENTRO_CUSTO', unknown>
>;

/** Endereço efetivo, `''` quando o ativo não declara nenhum. */
export const pickAssetAddress = (a: AssetAddressFields): string =>
  String(a._localMaster || a.endereco || a.LOCALIZACAO || a.CENTRO_CUSTO || '').trim();

/** `pickAssetAddress` com o rótulo partilhado «SEM LOCAL» no lugar do vazio. */
export const effectiveAssetAddress = (a: AssetAddressFields): string =>
  pickAssetAddress(a) || SEM_LOCAL_LABEL;
