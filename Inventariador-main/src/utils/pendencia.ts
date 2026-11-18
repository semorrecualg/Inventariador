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
