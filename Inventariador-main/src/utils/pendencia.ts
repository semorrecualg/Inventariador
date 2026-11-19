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
export type CamposDePendencia = {
  _lastUpdated?: unknown;
  _syncFailAt?: unknown;
  _syncFailReason?: unknown;
};

export type PendenciaPreservada = {
  _is_synced: 0;
  _lastUpdated?: string;
  _syncFailAt?: string;
  _syncFailReason?: string;
};

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
  local?: CamposDePendencia | null
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

  return pendencia;
};
