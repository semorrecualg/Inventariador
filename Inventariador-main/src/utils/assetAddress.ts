/**
 * Endereço efetivo do ativo — UMA regra para o inventário, a tela de ENDEREÇO
 * FÍSICO (`getLocationsWithStats`), o App e a busca ativa.
 *
 * Precedência: local auditado (`_localMaster`) → `endereco` → `LOCALIZACAO` →
 * `CENTRO_CUSTO`. Manter as pontas alinhadas é o que faz o toque numa
 * localidade encontrar os mesmos ativos em todos os ecrãs.
 *
 * A comparação entre o local da base e o local auditado também vive aqui: o
 * de-para da exportação e o bloco «Fluxo de Adoção» do cartão e do Kardex
 * perguntam a mesma coisa, e comparar as strings cruas dizia «COM ALTERAÇÃO»
 * em «ALMOX CENTRAL» → «almox central».
 */
import { SEM_LOCAL_LABEL } from '../constants/addressLabels';
import { normalizeKey } from './schema';

export type AssetAddressFields = Partial<
  Record<'_localMaster' | 'endereco' | 'LOCALIZACAO' | 'CENTRO_CUSTO', unknown>
>;

/** Endereço efetivo, `''` quando o ativo não declara nenhum. */
export const pickAssetAddress = (a: AssetAddressFields): string =>
  String(a._localMaster || a.endereco || a.LOCALIZACAO || a.CENTRO_CUSTO || '').trim();

/** `pickAssetAddress` com o rótulo partilhado «SEM LOCAL» no lugar do vazio. */
export const effectiveAssetAddress = (a: AssetAddressFields): string =>
  pickAssetAddress(a) || SEM_LOCAL_LABEL;

/**
 * O local da base e o local auditado são o MESMO local?
 *
 * Mesma tolerância de `normalizeKey` que o resto do app usa para localidade
 * (maiúsculas, acentos, `-`/`_` e espaços repetidos). Sem `_localMaster` não
 * houve auditoria de local, logo não há alteração a mostrar.
 */
export const mesmoEnderecoAuditado = (a: AssetAddressFields): boolean =>
  normalizeKey(String(a.endereco || '')) ===
  normalizeKey(String(a._localMaster || a.endereco || ''));

export type AssetDeParaFields = AssetAddressFields & { DE_PARA?: unknown };

/**
 * Rótulo «DE → PARA» que a exportação de auditoria leva para a planilha.
 *
 * Um `DE_PARA` já registado no ativo (gravado pela conciliação) é a prova do
 * que aconteceu e vale por si; sem ele, quem responde é a conferência — item
 * por conferir é `PENDENTE`, conferido num local diferente é `COM ALTERAÇÃO`.
 */
export const rotuloDePara = (a: AssetDeParaFields, conferido: boolean): string => {
  if (a.DE_PARA) return String(a.DE_PARA);
  if (!conferido) return 'PENDENTE';
  return mesmoEnderecoAuditado(a) ? 'SEM ALTERAÇÃO' : 'COM ALTERAÇÃO';
};
