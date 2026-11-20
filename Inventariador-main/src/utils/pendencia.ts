import { normalizeFlag } from './normalize';
import {
  conferenciaLocalVenceNuvem,
  preservarConferenciaLocal,
  type CamposDeDecisaoDeConferencia,
  type DecisaoDeConferencia,
} from './conferencia';

/**
 * TOQUE DESTE APARELHO = PENDENTE DE NUVEM, COM DATA
 * ============================================================================
 * Toda a gravação local que marca `_is_synced: 0` diz a mesma coisa: «este
 * registo foi alterado aqui e ainda não está igual na nuvem». O selo do cartão
 * («Pendente Nuvem · base por espelhar») mostra o motivo e a idade da pendência,
 * mas a idade só existe se o registo tiver data (`_lastUpdated`, em
 * `utils/syncBadge`).
 *
 * As escritas pousavam a flag sem data nenhuma, e o cartão ficava sem idade: um
 * toque de minutos parecia igual a um esquecido desde a semana passada. Marcar
 * a flag por este helper garante que os dois campos andam sempre juntos.
 */
export const marcarAlteracaoLocal = (
  /** Data do toque. Sem argumento é agora; aceita a data que o registo já tinha. */
  quando: Date | string = new Date()
): { _is_synced: 0; _lastUpdated: string } => ({
  _is_synced: 0,
  _lastUpdated: quando instanceof Date ? quando.toISOString() : quando,
});

/** Campos locais que o pull tem de manter quando remonta a linha da nuvem. */
export type CamposDePendencia = CamposDeDecisaoDeConferencia & {
  _lastUpdated?: unknown;
  _syncFailAt?: unknown;
  _syncFailReason?: unknown;
};

export type PendenciaPreservada = {
  _is_synced: 0;
  _lastUpdated?: string;
  _syncFailAt?: string;
  _syncFailReason?: string;
} & DecisaoDeConferencia;

/** Só texto com conteúdo conta: campos vazios ou de outro tipo não são dados. */
const textoUtil = (valor: unknown): string | undefined =>
  typeof valor === 'string' && valor.trim() ? valor : undefined;

/**
 * MANTÉM A PENDÊNCIA QUE JÁ EXISTIA (não é um toque novo)
 * ============================================================================
 * O pull da base não pode apagar a pendência local de um registo — mas também
 * não pode inventar-lhe uma data. Os pendentes anteriores a `_lastUpdated` não
 * têm data nenhuma; carimbar «agora» a cada pull reiniciava a idade mostrada no
 * selo, e um registo de há três horas aparecia sempre como «agora».
 *
 * O carimbo da falha de envio (`_syncFailAt`/`_syncFailReason`) é local e não
 * vem na linha da nuvem: sem o preservar aqui, cada descarga da base apagava o
 * selo vermelho do cartão e o registo recusado voltava a parecer apenas «na
 * fila» até à tentativa seguinte falhar outra vez. Um motivo sem data de falha
 * não é copiado — o selo não o saberia mostrar.
 */
export const preservarPendenciaLocal = (
  local?: CamposDePendencia | null,
  nuvem?: CamposDeDecisaoDeConferencia | null
): PendenciaPreservada => {
  const pendencia: PendenciaPreservada = { _is_synced: 0 };

  const ultimaAlteracao = textoUtil(local?._lastUpdated);
  if (ultimaAlteracao) pendencia._lastUpdated = ultimaAlteracao;

  const falhaEm = textoUtil(local?._syncFailAt);
  if (falhaEm) {
    pendencia._syncFailAt = falhaEm;
    const motivo = textoUtil(local?._syncFailReason);
    if (motivo) pendencia._syncFailReason = motivo;
  }

  // A CONFERÊNCIA também é uma decisão do aparelho: o pull trazia a flag da
  // nuvem (`_conferido = 0`, sem autor nem data) e o item conferido no campo
  // voltava a «por conferir» no ciclo seguinte. Só se repõe quando a decisão
  // local é mais recente — a linha da nuvem manda no resto (ver
  // `conferenciaLocalVenceNuvem`).
  if (conferenciaLocalVenceNuvem(local, nuvem)) {
    Object.assign(pendencia, preservarConferenciaLocal(local));
  }

  return pendencia;
};

/**
 * A pendência local continua a ser preservada no pull?
 * ============================================================================
 * Sim para o registo que este aparelho mudou e ainda não subiu — é o que evita
 * perder trabalho de campo. Não quando a nuvem diz «apagado»: preservar a
 * pendência reactivava o registo no estado (e o envio seguinte tentava subir
 * uma cópia de um ativo apagado, em ciclo). A exclusão vence, aqui como em
 * `mesclarComExclusao`.
 */
export const devePreservarPendencia = (
  nuvem: { _is_deleted?: unknown },
  local?: { _is_synced?: unknown } | null
): boolean => Number(local?._is_synced) === 0 && !normalizeFlag(nuvem._is_deleted);

/** O resultado do merge de uma linha da nuvem com a cópia local pendente. */
export type MergeComExclusao<T> = {
  /** Linha que fica no estado (e é gravada no disco) depois do merge. */
  registo: T;
  /** A nuvem tinha o registo apagado e a cópia local foi descartada. */
  exclusaoVenceu: boolean;
};

/**
 * EXCLUSÃO VENCE A EDIÇÃO PENDENTE
 * ============================================================================
 * O pull reaplica a cópia local por cima da linha da nuvem para não perder o que
 * este aparelho mudou e ainda não subiu. Mas a exclusão **não é um campo do
 * registo**: é o registo inteiro. Quando a nuvem diz «apagado» e o aparelho tem
 * uma cópia pendente com `_is_deleted = 0` — ficou offline durante a exclusão, o
 * `delete` falhou antes de sair, ou o registo veio de uma base antiga —,
 * reaplicar essa cópia desfazia a exclusão em TODOS os aparelhos no ciclo
 * seguinte: o ativo ressuscitava sozinho, sem ninguém o tocar.
 *
 * Aqui a cópia local perde por inteiro (não entra nenhum campo dela) e o
 * chamador larga a pendência — não há alteração a enviar de um registo apagado.
 * O contrário continua igual: com a linha viva na nuvem, a edição local ganha
 * (é o comportamento que evita perder o trabalho de campo).
 */
export const mesclarComExclusao = <T extends { _is_deleted?: unknown }>(
  nuvem: T,
  local: T
): MergeComExclusao<T> => {
  // `normalizeFlag` aceita as três grafias da flag (`true`, `1`, `'1'`); sem a
  // coluna na nuvem (schema antigo) a linha não conta como apagada.
  if (normalizeFlag(nuvem._is_deleted)) {
    return { registo: nuvem, exclusaoVenceu: true };
  }
  return { registo: { ...nuvem, ...local }, exclusaoVenceu: false };
};
