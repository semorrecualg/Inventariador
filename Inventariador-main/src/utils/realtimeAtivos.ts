/**
 * TEMPO REAL SEM JANELA DE PERDA (H1 · Fase 4)
 * ============================================================================
 * O canal de tempo real era o caminho mais frágil da sincronização, por duas
 * razões que se somavam:
 *
 *   1. **o evento de um ativo pendente era descartado por inteiro.** O callback
 *      via `_is_synced = 0` (ou o id em `dirtyAssetsRef`) e não aplicava nada,
 *      à espera de que «o pull seguinte resolvesse». Até lá, a conferência que
 *      outro auditor acabara de gravar não aparecia neste aparelho — e, se o
 *      aparelho ficasse offline, nunca aparecia;
 *   2. **não havia reconciliação depois de uma queda do canal.** Os eventos que
 *      passaram enquanto o WebSocket esteve em baixo não voltam a ser emitidos;
 *      sem uma releitura por checkpoint, ficavam perdidos até ao pull seguinte
 *      (que pode só acontecer horas depois, ou no arranque).
 *
 * Aqui vive a parte pura das duas correções:
 *
 *   - `mesclarEventoDeAtivo` aplica a MESMA regra do pull (`utils/mergePorCampo`)
 *     ao evento: a conferência e o ponto de GPS decidem-se por tempo e o resto
 *     do registo continua a ser deste aparelho;
 *   - `avancarCheckpoint` mantém o carimbo da reconciliação só a avançar, para a
 *     releitura não repetir linhas nem deixar um buraco por relógios diferentes
 *     (usa o `updated_at` da nuvem, nunca a hora local).
 *
 * Quem chama é `App.tsx`: o merge no callback da subscription e a releitura
 * `updated_at > checkpoint` no segundo `SUBSCRIBED` do canal.
 */

import type { Asset } from '../types';
import { mesclarConflitoPorCampo, type GrupoDeCampo } from './mergePorCampo';

type Linha = Record<string, unknown>;

/**
 * Este aparelho tem alteração por subir neste ativo?
 *
 * Duas provas, porque as duas existem no runtime: a flag persistida
 * (`_is_synced = 0`, que sobrevive ao reinício) e o toque da sessão
 * (`dirtyAssetsRef`, que o pull usa para saber o que ainda não subiu).
 */
export const ativoTemPendencia = (ativo?: Linha | null, tocadoAgora = false): boolean =>
  tocadoAgora || Number(ativo?._is_synced) === 0;

export interface EventoMesclado {
  /** Registo que fica no estado. */
  registo: Asset;
  /** Grupos em que os dois lados dizem coisas diferentes (vai para o registo). */
  conflitos: GrupoDeCampo[];
  /** O registo local fica diferente do que era? `false` = nada a gravar. */
  alterou: boolean;
}

/**
 * Comparação de conteúdo, não de identidade (e sem depender da ordem das chaves).
 *
 * O merge devolve sempre um objeto novo; sem esta comparação, cada evento
 * reescrevia o estado e o disco mesmo quando nada mudou. Uma ordem de chaves
 * diferente dava um falso positivo — uma escrita a mais por cada evento.
 */
const canonico = (valor: unknown): unknown => {
  if (Array.isArray(valor)) return valor.map(canonico);
  if (valor && typeof valor === 'object') {
    const objeto = valor as Linha;
    return Object.keys(objeto)
      .sort()
      .reduce<Linha>((acc, chave) => {
        acc[chave] = canonico(objeto[chave]);
        return acc;
      }, {});
  }
  return valor;
};

const mesmoConteudo = (a: unknown, b: unknown): boolean => {
  try {
    return JSON.stringify(canonico(a)) === JSON.stringify(canonico(b));
  } catch {
    return false;
  }
};

/**
 * O merge de um ativo pendente só pode mudar valores que o registo local já
 * tem: `{ ...nuvem, ...local }` mantém todas as chaves locais e acrescenta as
 * que só a nuvem traz (o `updated_at`, por exemplo). Essas chaves extra não são
 * uma decisão deste aparelho — não contam como alteração.
 */
const preservaCamposLocais = (registo: Asset, local: Asset): boolean => {
  const doRegisto = registo as unknown as Linha;
  const doLocal = local as unknown as Linha;
  return Object.keys(doLocal).every(chave => mesmoConteudo(doRegisto[chave], doLocal[chave]));
};

/**
 * Decide o que fazer com a linha que chegou pelo realtime.
 *
 * `nuvem` já vem mapeada (`mapCloudAssetRow`): o payload do canal é a linha
 * CRUA do Postgres e, sem o mapeamento, o estado recebia `gps_lat`/
 * `data_leitura` em vez de `latitude`/`_dataLeitura`.
 *
 * - ativo desconhecido → entra como está (o evento também é uma descoberta);
 * - sem pendência local → a nuvem fica, como antes;
 * - com pendência local → merge por campo: a nuvem só ganha a conferência e o
 *   ponto quando a leitura dela é a mais recente; o resto é deste aparelho.
 */
export const mesclarEventoDeAtivo = (
  local: Asset | undefined,
  nuvem: Asset,
  pendente: boolean
): EventoMesclado => {
  if (!local) return { registo: nuvem, conflitos: [], alterou: true };

  if (!pendente) {
    return { registo: nuvem, conflitos: [], alterou: !mesmoConteudo(nuvem, local) };
  }

  const porCampo = mesclarConflitoPorCampo(
    nuvem as unknown as Linha,
    local as unknown as Linha
  );
  const registo = porCampo.registo as unknown as Asset;

  return {
    registo,
    conflitos: porCampo.conflitos,
    alterou: !preservaCamposLocais(registo, local)
  };
};

/**
 * Avança o checkpoint da reconciliação de forma monotónica.
 *
 * Só o `updated_at` da NUVEM serve de carimbo: a hora deste aparelho pode estar
 * adiantada e criaria um buraco (linhas com `updated_at` entre as duas horas
 * nunca seriam relidas). Um carimbo ausente ou ilegível não mexe no checkpoint.
 */
export const avancarCheckpoint = (atual: string, carimbo: unknown): string => {
  if (carimbo === null || carimbo === undefined) return atual;
  const lido = Date.parse(String(carimbo));
  if (!Number.isFinite(lido)) return atual;
  const atualMs = Date.parse(atual);
  if (Number.isFinite(atualMs) && atualMs >= lido) return atual;
  return new Date(lido).toISOString();
};

/**
 * Ids com pendência local: a flag persistida e os toques da sessão, juntos.
 *
 * A reconciliação usa a mesma lista que o delta do pull (`mergeDeltaPull`) —
 * um ativo tocado nesta sessão mas ainda sem a flag gravada não pode ser
 * substituído pela linha da nuvem.
 */
export const idsComPendencia = (
  ativos: readonly Asset[],
  tocados: Iterable<string>
): string[] => {
  const ids = new Set<string>();
  for (const ativo of ativos) {
    if (Number((ativo as unknown as Linha)._is_synced) === 0) ids.add(String(ativo.id));
  }
  for (const id of tocados) ids.add(String(id));
  return Array.from(ids);
};

/**
 * GRAVAR SÓ O QUE MUDOU NA RECONCILIAÇÃO
 * ============================================================================
 * A reconciliação relê o delta da nuvem e remonta o estado. Gravar esse estado
 * com `saveInventory(newState)` sem lista de ativos grava a BASE INTEIRA
 * (`bulkInsertAssets` de todos os ativos) a cada reconexão — 12.636 linhas por
 * três espelhos para corrigir, muitas vezes, uma dúzia. É o mesmo problema que
 * o pull já resolveu com `persistAssetsBatch`.
 *
 * Aqui ficam só as linhas que a nuvem tocou e cujo registo final ficou
 * diferente do que já estava no estado. Uma linha que a nuvem trouxe mas cujo
 * merge não mudou nada (a conferência local é mais recente, por exemplo) não
 * volta ao disco: os espelhos já têm essa cópia.
 */
export const linhasQueMudaram = (
  anteriores: readonly Asset[],
  resultado: readonly Asset[],
  visitadas: Iterable<string | number>
): Asset[] => {
  const antes = new Map(anteriores.map(ativo => [String(ativo.id), ativo]));
  const depois = new Map(resultado.map(ativo => [String(ativo.id), ativo]));
  const alteradas: Asset[] = [];

  for (const id of new Set(Array.from(visitadas, valor => String(valor)))) {
    const atual = depois.get(id);
    // Sem registo final não há o que gravar (o id não existe no estado).
    if (!atual) continue;
    const anterior = antes.get(id);
    if (!anterior || !mesmoConteudo(atual, anterior)) alteradas.push(atual);
  }

  return alteradas;
};
