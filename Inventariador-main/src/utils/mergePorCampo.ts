/**
 * CONFLITO ENTRE DOIS AUDITORES NO MESMO ATIVO (item 24b)
 * ============================================================================
 * O merge do pull era last-write-wins por APARELHO: havia uma linha da nuvem e,
 * se este aparelho tinha a cópia pendente (`_is_synced = 0`), a cópia local
 * entrava inteira por cima — `{ ...nuvem, ...local }`. Uma conferência feita
 * por outro auditor, já na nuvem, desaparecia só porque a nossa linha estava
 * pendente por causa de outro campo (o endereço, a descrição, uma foto). Os
 * dois auditores trabalharam no mesmo ativo e um deles perdeu a leitura.
 *
 * A regra de campo a campo já existia para a CONFERÊNCIA (`utils/conferencia`)
 * e para o GPS (`utils/assetGps`), mas vivia no merge completo, acima do
 * `{ ...nuvem, ...local }` das linhas pendentes — que a desfazia logo a seguir.
 * Aqui as três regras passam a ser aplicadas na mesma ordem, ao mesmo tempo:
 *
 *   1. exclusão (`_is_deleted` na nuvem) vence o registo inteiro;
 *   2. sem pendência local, a nuvem fica — não há nada a defender;
 *   3. o RESTO dos campos é trabalho deste aparelho e continua a vencer;
 *   4. a CONFERÊNCIA decide-se por tempo: vence a decisão mais recente, venha
 *      ela da nuvem (outro auditor) ou deste aparelho;
 *   5. o PONTO DE GPS decide-se por tempo, pela mesma razão.
 *
 * Ou seja: dois auditores no mesmo ativo passam a poder coexistir — um fica com
 * a conferência (a mais recente) e o outro mantém o endereço que editou. O que
 * não se promete, porque o modelo não tem carimbo por campo, é separar dois
 * campos fora destes grupos: aí continua a vencer este aparelho, e o conflito
 * fica registado na trilha (`conflitos`) para não ser silencioso.
 *
 * Não há schema novo: tudo usa carimbos que já existem (`_dataLeitura`,
 * `_gps_at`, `_lastUpdated`, `updated_at`).
 */

import { normalizeFlag } from './normalize';
import {
  conferenciaLocalVenceNuvem,
  isConferido,
  type CamposDeDecisaoDeConferencia
} from './conferencia';
import { assetGpsPair, preservarGpsMaisRecente } from './assetGps';

/** Grupos com regra de conflito própria; o resto vence pelo aparelho (pendência). */
export type GrupoDeCampo = 'conferencia' | 'gps';

export interface MergeConflitoPorCampo<T> {
  /** Linha que fica no estado e vai ao disco. */
  registo: T;
  /** A nuvem dizia «apagado»: a cópia local foi descartada por inteiro. */
  exclusaoVenceu: boolean;
  /** Grupos em que a nuvem e o aparelho diziam coisas diferentes. */
  conflitos: GrupoDeCampo[];
}

/** Campos que guardam a decisão de conferência (quem, quando, com que prova). */
const CAMPOS_DA_CONFERENCIA = [
  '_conferido',
  '_auditor',
  '_dataLeitura',
  'AUDITOR_STATUS_CONFERENCIA',
  'status'
] as const;

type Linha = Record<string, unknown>;

/** A linha pode portar uma pendência deste aparelho? */
const temPendenciaLocal = (local: Linha): boolean => Number(local?._is_synced) === 0;

/** Valor presente na linha (não nulo, não vazio). */
const temValor = (linha: Linha, campo: string): boolean => {
  const valor = linha[campo];
  return valor !== null && valor !== undefined && String(valor).trim() !== '';
};

/**
 * Repõe na linha a decisão de conferência da nuvem.
 *
 * Só sobrescreve o que a nuvem REALMENTE diz: uma chave ausente na linha da
 * nuvem não apaga a decisão local por omissão — quem decide é
 * `conferenciaLocalVenceNuvem`, e ela já correu antes.
 */
const reporConferenciaDaNuvem = (registo: Linha, nuvem: Linha): void => {
  for (const campo of CAMPOS_DA_CONFERENCIA) {
    if (temValor(nuvem, campo)) registo[campo] = nuvem[campo];
  }
};

/** Repõe na linha o ponto da nuvem (nas duas grafias), quando o dela é o mais recente. */
const reporPontoDaNuvem = (registo: Linha, nuvem: Linha): void => {
  const ponto = assetGpsPair(nuvem);
  if (!ponto) return;
  registo.latitude = ponto.lat;
  registo.longitude = ponto.lng;
  registo.gps_lat = ponto.lat;
  registo.gps_lng = ponto.lng;
};

/**
 * Nuvem e aparelho dizem coisas diferentes sobre o grupo?
 *
 * É DIAGNÓSTICO (vai para a trilha), não decisão: a decisão já saiu das regras
 * por tempo. Só conta o que os dois lados afirmam — campo que um lado não tem
 * não é conflito.
 */
const gruposEmConflito = (nuvem: Linha, local: Linha): GrupoDeCampo[] => {
  const conflitos: GrupoDeCampo[] = [];

  const conferidoLocal = isConferido(local as CamposDeDecisaoDeConferencia);
  const conferidoNuvem = isConferido(nuvem as CamposDeDecisaoDeConferencia);
  const autoresDiferentes =
    conferidoLocal &&
    conferidoNuvem &&
    temValor(local, '_auditor') &&
    temValor(nuvem, '_auditor') &&
    String(local._auditor).trim().toLowerCase() !== String(nuvem._auditor).trim().toLowerCase();
  if (conferidoLocal !== conferidoNuvem || autoresDiferentes) conflitos.push('conferencia');

  const pontoLocal = assetGpsPair(local);
  const pontoNuvem = assetGpsPair(nuvem);
  if (pontoLocal && pontoNuvem) {
    const diferente =
      Math.abs(pontoLocal.lat - pontoNuvem.lat) > 1e-7 ||
      Math.abs(pontoLocal.lng - pontoNuvem.lng) > 1e-7;
    if (diferente) conflitos.push('gps');
  }

  return conflitos;
};

/**
 * Merge de uma linha da nuvem com a cópia local pendente, campo a campo.
 *
 * Substitui o `{ ...nuvem, ...local }` do merge do pull **apenas** para a
 * linha que este aparelho tem pendente; o resto do pull não muda.
 */
export const mesclarConflitoPorCampo = <T extends Record<string, unknown>>(
  nuvem: T,
  local?: T | null
): MergeConflitoPorCampo<T> => {
  if (!local) return { registo: nuvem, exclusaoVenceu: false, conflitos: [] };

  // EXCLUSÃO VENCE O REGISTO INTEIRO (item 23b): a cópia local não entra.
  if (normalizeFlag(nuvem._is_deleted)) {
    return { registo: nuvem, exclusaoVenceu: true, conflitos: [] };
  }

  // Sem pendência local não há nada a defender: a linha da nuvem fica.
  if (!temPendenciaLocal(local as Linha)) {
    return { registo: nuvem, exclusaoVenceu: false, conflitos: [] };
  }

  const linhaNuvem = nuvem as Linha;
  const linhaLocal = local as Linha;
  const conflitos = gruposEmConflito(linhaNuvem, linhaLocal);

  // O RESTO é trabalho deste aparelho: a cópia local entra, como antes.
  const registo: Linha = { ...linhaNuvem, ...linhaLocal };

  // CONFERÊNCIA por tempo: a decisão mais recente é a que fica — venha ela de
  // outro auditor (nuvem) ou deste aparelho.
  if (conferenciaLocalVenceNuvem(
    linhaLocal as CamposDeDecisaoDeConferencia,
    linhaNuvem as CamposDeDecisaoDeConferencia
  )) {
    // Já está na linha (a cópia local entrou inteira); nada a fazer.
  } else {
    reporConferenciaDaNuvem(registo, linhaNuvem);
  }

  // GPS por tempo: o ponto mais recente é o que fica, nas duas grafias.
  const pontoLocal = preservarGpsMaisRecente(linhaLocal, linhaNuvem);
  if (Object.keys(pontoLocal).length > 0) {
    Object.assign(registo, pontoLocal);
  } else {
    reporPontoDaNuvem(registo, linhaNuvem);
  }

  return { registo: registo as T, exclusaoVenceu: false, conflitos };
};
