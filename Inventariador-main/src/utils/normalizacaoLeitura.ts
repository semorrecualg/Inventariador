import type { Asset } from '../types';
import { isConferido, marcaLocalConferida, marcarConferido } from './conferencia';

/**
 * NORMALIZAÇÃO DAS LEITURAS ANTIGAS — uma vez, não a cada arranque
 * ============================================================================
 * O arranque reescrevia `_dataLeitura` dos ativos conferidos com data anterior
 * a «hoje» (15/03/2026) e depois gravava a **base inteira** — 12.636 linhas nos
 * dois espelhos — para corrigir um punhado de linhas.
 *
 * Havia um segundo problema, pior: a data escrita era `2026-03-15T12:00:00Z`,
 * que no arranque seguinte voltava a ser «anterior a 2026-03-16». Uma linha
 * normalizada nunca deixava de precisar de normalização, por isso o arranque
 * reescrevia a base em TODOS os arranques.
 *
 * Aqui a regra fica idempotente: só se normaliza o que ainda está **antes** do
 * alvo. Uma leitura já no alvo (ou depois dele) não se toca, por isso o
 * arranque seguinte não tem nada a fazer. A grafia da marca local continua a
 * ser normalizada quando a única prova de conferência é a coluna de auditoria.
 */

/** Alvo da normalização: «ontem» (15/03/2026 às 12:00 UTC). */
export const LEITURA_NORMALIZADA = '2026-03-15T12:00:00Z';

const ALVO_MS = Date.parse(LEITURA_NORMALIZADA);

const anteriorAoAlvo = (leitura?: string | null): boolean => {
  if (!leitura) return true;
  const lido = Date.parse(leitura);
  return !Number.isFinite(lido) || lido < ALVO_MS;
};

export interface NormalizacaoDeLeituras {
  assets: Asset[];
  /** As linhas que mudaram — as únicas que precisam de voltar ao disco. */
  alteradas: Asset[];
}

/**
 * Devolve a base normalizada e, separadamente, as linhas que mudaram.
 *
 * `alteradas` é o que o arranque manda a `persistAssetsBatch`; uma segunda
 * passagem sobre o resultado devolve `alteradas` vazio (é o que fecha o ciclo
 * que regravava a base a cada arranque).
 */
export const normalizarLeiturasDeConferencia = (
  assets: readonly Asset[]
): NormalizacaoDeLeituras => {
  const alteradas: Asset[] = [];

  const normalizados = assets.map(ativo => {
    if (!isConferido(ativo)) return ativo;

    const leitura = typeof ativo._dataLeitura === 'string' ? ativo._dataLeitura : '';
    if (anteriorAoAlvo(leitura)) {
      const normalizado = { ...ativo, ...marcarConferido(LEITURA_NORMALIZADA) };
      alteradas.push(normalizado);
      return normalizado;
    }

    // Conferido só pela coluna de auditoria: a marca local fica canónica e a
    // leitura que já existe não é inventada.
    if (!marcaLocalConferida(ativo)) {
      const normalizado = { ...ativo, ...marcarConferido(leitura) };
      alteradas.push(normalizado);
      return normalizado;
    }

    return ativo;
  });

  return { assets: normalizados, alteradas };
};
