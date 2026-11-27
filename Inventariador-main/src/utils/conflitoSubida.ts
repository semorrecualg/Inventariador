/**
 * CONFLITO POR CAMPO NA SUBIDA — A LEITURA MAIS RECENTE É QUE FICA
 * ============================================================================
 * A descida já resolvia a conferência e o ponto por TEMPO (`utils/mergePorCampo`
 * e `utils/pendencia`): o pull não desfaz a conferência deste aparelho e não
 * aceita um ponto mais antigo. Faltava o outro sentido. O envio monta o payload
 * inteiro e o `ON CONFLICT DO UPDATE` grave tudo: um aparelho que conferiu às
 * 09:00 e subiu às 11:00 (fila parada, recuo, app fechado) apagava a conferência
 * que outro auditor fez às 10:00 — a nuvem guardava a leitura mais ANTIGA e o
 * ecrã de CONFERIDOS passava a mostrar o autor errado.
 *
 * A regra é a mesma dos dois lados, aplicada a dois grupos de campos:
 *
 *   - **conferência** (`conferido`, `auditor`, `data_leitura`, `status`): a
 *     `data_leitura` é a prova de tempo. A nuvem vence quando a leitura dela é
 *     estritamente posterior à deste aparelho (`_dataLeitura`, ou o toque
 *     `_lastUpdated` quando a decisão foi desmarcar);
 *   - **ponto de GPS** (`gps_lat`/`gps_lng`): a nuvem não tem carimbo próprio do
 *     ponto e usa-se a `data_leitura` da conferência. A nuvem vence quando ela
 *     é posterior e a linha dela traz um par válido.
 *
 * Quando a nuvem vence, o campo NÃO entra no payload (a coluna fica como está,
 * porque o upsert só toca nas colunas enviadas) e o valor da nuvem é devolvido
 * em `adotar` para o registo local acompanhar sem esperar por um pull. Quando
 * não há prova em contrário — linha remota ausente, sem `data_leitura`, ou
 * leitura local mais recente — o comportamento continua a ser o de sempre: o
 * valor deste aparelho sobe. Nunca se inventa uma data para ganhar o conflito.
 *
 * O `status` viaja com a conferência: enquanto a decisão de auditoria está em
 * jogo, enviar um `status` local («PENDENTE» depois de desmarcar) deixaria a
 * nuvem com `conferido = true` e `status = 'PENDENTE'` — exatamente a
 * divergência que `docs/DIAGNOSTICO_CONFERENCIA.md` mede no bloco B.1.
 *
 * Limite conhecido, igual ao da descida: o modelo não tem carimbo por campo.
 * Fora destes dois grupos, o resto dos campos continua a ser deste aparelho.
 */

import { isConferido, statusDeConferencia, type CamposDeConferencia } from './conferencia';
import { assetGpsPair } from './assetGps';

/** Grupos com regra de tempo própria; o resto do registo é deste aparelho. */
export type GrupoDeConflito = 'conferencia' | 'gps';

export interface DecisaoDeGrupo {
  /** O valor local entra no payload? `false` = a nuvem é mais recente. */
  enviar: boolean;
  /** Campos a copiar para o registo local quando a nuvem vence. */
  adotar: Record<string, unknown>;
}

export interface ConflitoDeSubida {
  conferencia: DecisaoDeGrupo;
  gps: DecisaoDeGrupo;
  /** Grupos em que os dois lados dizem coisas diferentes (vai para a trilha). */
  conflitos: GrupoDeConflito[];
}

type Linha = Record<string, unknown>;

/** Data legível em ms; `null` quando o campo não traz data nenhuma. */
const instante = (valor: unknown): number | null => {
  if (valor === null || valor === undefined) return null;
  const texto = String(valor).trim();
  if (!texto) return null;
  const lido = Date.parse(texto);
  return Number.isFinite(lido) ? lido : null;
};

/** Primeira data legível da lista (a canónica primeiro, as de recurso depois). */
const primeiroInstante = (...valores: unknown[]): number | null => {
  for (const valor of valores) {
    const momento = instante(valor);
    if (momento !== null) return momento;
  }
  return null;
};

/**
 * Momento da decisão de conferência DESTE aparelho.
 *
 * `_dataLeitura` é a leitura que marca; o desmarcar não tem data de leitura
 * própria e usa o toque (`_lastUpdated`), como em `utils/conferencia`.
 */
export const momentoDaConferenciaLocal = (local?: Linha | null): number | null =>
  primeiroInstante(local?._dataLeitura, local?._lastUpdated);

/** Momento do ponto deste aparelho: o carimbo do GPS, senão o da leitura/toque. */
export const momentoDoPontoLocal = (local?: Linha | null): number | null =>
  primeiroInstante(local?._gps_at, local?._dataLeitura, local?._lastUpdated);

/** «Conferido» na linha da nuvem, pelo mesmo predicado dos ecrãs. */
const conferidoNaNuvem = (nuvem?: Linha | null): boolean =>
  !!nuvem &&
  (isConferido({
    _conferido: nuvem.conferido,
    AUDITOR_STATUS_CONFERENCIA: nuvem.AUDITOR_STATUS_CONFERENCIA,
  } as CamposDeConferencia) ||
    statusDeConferencia(nuvem.status));

/** «Conferido» no registo deste aparelho (flag, coluna da base ou marcador). */
const conferidoLocal = (local: Linha): boolean =>
  isConferido(local as CamposDeConferencia) || statusDeConferencia(local.status);

const texto = (valor: unknown): string => (valor === null || valor === undefined ? '' : String(valor).trim());

const semConflito = (): DecisaoDeGrupo => ({ enviar: true, adotar: {} });

/**
 * Decide, grupo a grupo, o que sobe e o que se adota da nuvem.
 *
 * `local` é o registo em memória do ciclo (vocabulário do app); `nuvem` é a
 * linha CRUA do Postgres (`conferido`, `auditor`, `data_leitura`, `gps_lat`…),
 * como sai de `fetchCloudConflictRows`.
 */
export const resolverConflitoDeSubida = (
  local: Linha,
  nuvem?: Linha | null
): ConflitoDeSubida => {
  const conferencia = semConflito();
  const gps = semConflito();
  const conflitos: GrupoDeConflito[] = [];

  if (!nuvem) return { conferencia, gps, conflitos };

  const leituraNuvem = instante(nuvem.data_leitura);
  const leituraLocal = momentoDaConferenciaLocal(local);

  // CONFERÊNCIA — a nuvem só vence com prova de tempo dos dois lados.
  if (leituraNuvem !== null && leituraLocal !== null && leituraNuvem > leituraLocal) {
    conferencia.enviar = false;
    conferencia.adotar = {
      _conferido: conferidoNaNuvem(nuvem),
      _dataLeitura: String(nuvem.data_leitura),
      ...(texto(nuvem.auditor) ? { _auditor: texto(nuvem.auditor) } : {}),
      ...(texto(nuvem.status) ? { status: texto(nuvem.status) } : {}),
    };
  }

  // PONTO — mesma prova de tempo; a nuvem só vence com um par válido.
  const pontoNuvem = assetGpsPair(nuvem);
  const pontoLocal = assetGpsPair(local);
  const leituraDoPontoLocal = momentoDoPontoLocal(local);
  if (
    pontoNuvem &&
    leituraNuvem !== null &&
    leituraDoPontoLocal !== null &&
    leituraNuvem > leituraDoPontoLocal
  ) {
    gps.enviar = false;
    gps.adotar = {
      latitude: pontoNuvem.lat,
      longitude: pontoNuvem.lng,
      gps_lat: pontoNuvem.lat,
      gps_lng: pontoNuvem.lng,
    };
  }

  // DIAGNÓSTICO (vai para a trilha): só conta o que os dois lados afirmam.
  const autorLocal = texto(local._auditor).toLowerCase();
  const autorNuvem = texto(nuvem.auditor).toLowerCase();
  const conferidoAqui = conferidoLocal(local);
  const conferidoLa = conferidoNaNuvem(nuvem);
  if (
    conferidoAqui !== conferidoLa ||
    (conferidoAqui && conferidoLa && autorLocal && autorNuvem && autorLocal !== autorNuvem)
  ) {
    conflitos.push('conferencia');
  }

  if (pontoLocal && pontoNuvem) {
    const diferente =
      Math.abs(pontoLocal.lat - pontoNuvem.lat) > 1e-7 ||
      Math.abs(pontoLocal.lng - pontoNuvem.lng) > 1e-7;
    if (diferente) conflitos.push('gps');
  }

  return { conferencia, gps, conflitos };
};
