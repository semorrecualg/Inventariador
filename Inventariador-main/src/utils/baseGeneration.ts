// ============================================================================
// SELO DE GERAÇÃO DA BASE
// ----------------------------------------------------------------------------
// Um reset da base da nuvem (scripts/reset-test-database.sql) só limpa o
// aparelho onde «Preparar Nova Carga» é corrido. Um segundo aparelho com a base
// antiga reenviaria as chaves velhas no primeiro sync e repovoava a nuvem — em
// silêncio, porque a nuvem não sabia que aquela geração já não valia.
//
// O selo é a geração corrente da nuvem (`public.base_generation`), espelhada no
// aparelho em `localStorage`. Antes de cada envio, as duas são comparadas:
//   - iguais          → segue;
//   - base local vazia → adota (nada para enviar, logo é seguro);
//   - primeira geração (seq 1) sem selo local → adota (rollout do selo);
//   - qualquer outra diferença → BLOQUEIA o envio e pede «Preparar Nova Carga».
//
// Módulo puro (storage por parâmetro) para ser testado sem jsdom.
// ============================================================================

export const BASE_GENERATION_KEY = 'gbr_base_generation';

export interface BaseGeneration {
  /** UUID da geração corrente da base. */
  generation: string;
  /** 1 na primeira base selada; sobe a cada reset. */
  seq: number;
}

export type BaseGenerationVerdict = 'ok' | 'adopt' | 'blocked' | 'unknown';

export interface BaseGenerationDecision {
  verdict: BaseGenerationVerdict;
  reason: string;
}

export type BaseGenerationStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

const defaultStorage = (): BaseGenerationStorage | null => {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
};

/** Normaliza uma linha vinda da nuvem ou do storage; inválida → `null`. */
export const normalizarGeracao = (value: unknown): BaseGeneration | null => {
  if (!value || typeof value !== 'object') return null;
  const rec = value as Record<string, unknown>;
  const generation = String(rec.generation ?? '').trim();
  const seq = Number(rec.seq);
  if (!generation || !Number.isFinite(seq) || seq < 1) return null;
  return { generation, seq: Math.trunc(seq) };
};

export const lerSeloBase = (storage: BaseGenerationStorage | null = defaultStorage()): BaseGeneration | null => {
  if (!storage) return null;
  try {
    return normalizarGeracao(JSON.parse(storage.getItem(BASE_GENERATION_KEY) ?? 'null'));
  } catch {
    return null;
  }
};

export const gravarSeloBase = (
  geracao: BaseGeneration,
  storage: BaseGenerationStorage | null = defaultStorage()
): boolean => {
  const normalized = normalizarGeracao(geracao);
  if (!normalized || !storage) return false;
  try {
    storage.setItem(BASE_GENERATION_KEY, JSON.stringify(normalized));
    return true;
  } catch {
    return false;
  }
};

export const limparSeloBase = (storage: BaseGenerationStorage | null = defaultStorage()): void => {
  if (!storage) return;
  try {
    storage.removeItem(BASE_GENERATION_KEY);
  } catch {
    /* storage indisponível: nada a limpar */
  }
};

/**
 * Decide o que fazer com o envio. `remoto` nulo (tabela ainda não existe, sem
 * rede ou leitura falhada) é compatibilidade: não há selo, não há portão — o
 * envio segue como antes. `baseLocalVazia` só é consultada quando as gerações
 * não coincidem.
 */
export const avaliarGeracaoBase = ({
  local,
  remoto,
  baseLocalVazia
}: {
  local: BaseGeneration | null;
  remoto: BaseGeneration | null;
  baseLocalVazia: boolean;
}): BaseGenerationDecision => {
  if (!remoto) {
    return {
      verdict: 'unknown',
      reason: 'A nuvem não tem selo de geração legível; o envio segue sem portão.'
    };
  }

  if (local && local.generation === remoto.generation) {
    return { verdict: 'ok', reason: 'O aparelho está na geração corrente da nuvem.' };
  }

  if (baseLocalVazia) {
    return {
      verdict: 'adopt',
      reason: `Base local vazia: adota a geração ${remoto.seq} da nuvem.`
    };
  }

  if (!local && remoto.seq <= 1) {
    return {
      verdict: 'adopt',
      reason: 'Primeira geração desde que o selo existe: adota sem bloquear aparelhos já em campo.'
    };
  }

  return {
    verdict: 'blocked',
    reason: `O aparelho tem uma base de geração anterior (${local ? local.seq : 'sem selo'}) e a nuvem está na geração ${remoto.seq}.`
  };
};

export const mensagemGeracaoAntiga = (remoto: BaseGeneration, local: BaseGeneration | null): string => {
  const aparelho = local ? `selo ${local.seq}` : 'sem selo local';
  return (
    `ENVIO BLOQUEADO: a base da nuvem foi reiniciada (geração ${remoto.seq}) e este aparelho ` +
    `ainda tem a base antiga (${aparelho}). Nada foi enviado. ` +
    'Abra o Gestor de Base → «Preparar Nova Carga», recarregue o app e carregue a planilha de novo.'
  );
};

export class BaseGenerationBlockedError extends Error {
  constructor(
    public readonly remote: BaseGeneration,
    public readonly local: BaseGeneration | null
  ) {
    super(mensagemGeracaoAntiga(remote, local));
    this.name = 'BaseGenerationBlockedError';
  }
}
