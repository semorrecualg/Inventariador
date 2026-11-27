/**
 * BLINDAGEM FÍSICA (`is_system_locked`) — UMA CHAVE, DOIS SENTIDOS
 * ============================================================================
 * O «Pronto para Campo» do Gestor de Base grava `is_system_locked = 'true'` e
 * congela o aparelho para o auditor: nada entra nem sai do Supabase, para a
 * base de campo não mudar por baixo de quem está a contar.
 *
 * Só a SUBIDA estava fechada (a fila nem chegava a correr com o modo forçado a
 * INTERNAL no arranque), e a leitura da chave estava copiada em cinco sítios
 * do `App`/`MainMenu` com a mesma comparação à mão. A DESCIDA continuava
 * aberta por dois caminhos que não passam pelo `syncFromCloud`: o realtime
 * (`subscribeToAssetChanges`) aplicava a linha da nuvem ao estado e ao disco a
 * cada evento, e um pedido de sincronização nascido de outro ecrã podia
 * descarregar a base. Nos dois casos a blindagem não valia nada.
 *
 * A chave passa a ter uma regra só (`isSystemLocked`) e é consultada onde a
 * rede toca os dados: `pushGate` (subida), `syncFromCloud` (descida) e os dois
 * canais de realtime (evento a evento — a blindagem pode ser ligada com o app
 * já aberto, e aí a subscription existente continua viva).
 *
 * A grafia aceita é a mesma de sempre: `'true'` exato. Qualquer outro valor
 * (ausente, `'1'`, `'TRUE'`, `'false'`) é sistema desbloqueado — alargar a
 * leitura aqui mudaria o significado de chaves gravadas por versões antigas
 * sem uma migração.
 */

export const SYSTEM_LOCK_KEY = 'is_system_locked';

export const SYSTEM_LOCK_MESSAGE =
  'Sistema blindado (Pronto para Campo): nenhuma sincronização com a nuvem acontece até o Administrador libertar a base.';

/** O aparelho está blindado? Lê a chave no armazenamento local do dispositivo. */
export const isSystemLocked = (
  storage: Pick<Storage, 'getItem'> | null | undefined = typeof localStorage === 'undefined' ? null : localStorage
): boolean => {
  try {
    return storage?.getItem(SYSTEM_LOCK_KEY) === 'true';
  } catch {
    // Armazenamento indisponível (modo privado, WebView sem origem): não se
    // afirma blindagem nenhuma — o resto dos portões continua a valer.
    return false;
  }
};
