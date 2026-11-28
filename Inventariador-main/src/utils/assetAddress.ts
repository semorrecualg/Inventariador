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

/**
 * O LOCAL A GRAVAR QUANDO A CONFERÊNCIA CHEGA SEM ELE
 * ============================================================================
 * O local onde o ativo foi encontrado (`_localMaster`) não pode depender do
 * ecrã por onde a conferência passou. O inventário e o lote escrevem-no no
 * próprio patch; a ficha do ativo não — e a conferência feita por lá deixava o
 * registo com a data, o auditor e a TAG, mas sem local nenhum, que é o
 * «LOCAL ONDE FOI ENCONTRADO» vazio na ficha e o item fora de qualquer
 * endereço na exportação.
 *
 * A precedência é a mesma dos outros caminhos: o local já registado manda (não
 * se reescreve uma conferência anterior com o endereço da base); sem ele vale o
 * endereço do inventário aberto; sem esse, o endereço do próprio ativo. Devolve
 * `null` quando não há nada a afirmar — nunca se inventa um local.
 */
export const localDaConferencia = (
  asset: AssetAddressFields,
  localDoInventario?: string | null
): string | null => {
  if (String(asset._localMaster ?? '').trim()) return null;
  const inventario = String(localDoInventario ?? '').trim();
  if (inventario) return inventario;
  const base = String(asset.endereco ?? '').trim();
  return base || null;
};

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
