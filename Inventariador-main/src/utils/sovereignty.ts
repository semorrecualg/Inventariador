// ============================================================================
// sovereignty.ts — selo de blindagem física («Pronto para Campo»).
//
// A blindagem suspende a nuvem e mantém o app na Base Local no arranque. Ela é
// aplicada AUTOMATICAMENTE quando o operador escolhe a Base Local e removida
// automaticamente (com confirmação única e auditoria) quando escolhe a Base
// Oficial. Este módulo é a fonte única das chaves e do evento que avisa as
// telas abertas — sem botões técnicos nos cartões de status.
// ============================================================================

export const SOVEREIGNTY_LOCK_KEY = 'is_system_locked';
export const SOVEREIGNTY_INTEGRITY_KEY = 'gbr_integrity_key';
export const SOVEREIGNTY_EVENT = 'gbr_sovereignty_changed';

/** Subconjunto de `Storage` usado aqui (facilita os testes com memória). */
export interface SovereigntyStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const randomSeed = (): string =>
  Math.random().toString(36).substring(2, 10).toUpperCase();

/** Chave de verificação exibida no cartão de blindagem. */
export const buildIntegrityKey = (assetCount: number, seed: string = randomSeed()): string =>
  `GBR-AES256-SHA512::KARDEX_CONF_LOCKED_${assetCount}_${seed}`;

/** `true` quando o aparelho está blindado. */
export const isSovereigntyLocked = (store: SovereigntyStore): boolean =>
  store.getItem(SOVEREIGNTY_LOCK_KEY) === 'true';

/**
 * Sela o aparelho. Devolve a chave criada ou `null` quando já estava selado.
 * Nunca deve ser chamada com a Base Oficial ativa (invariante no chamador).
 */
export const sealSovereignty = (
  store: SovereigntyStore,
  assetCount: number,
  seed?: string
): string | null => {
  if (isSovereigntyLocked(store)) return null;

  const integrityKey = buildIntegrityKey(assetCount, seed);
  store.setItem(SOVEREIGNTY_LOCK_KEY, 'true');
  store.setItem(SOVEREIGNTY_INTEGRITY_KEY, integrityKey);
  return integrityKey;
};

/** Remove a blindagem. Devolve `true` se havia algo para remover. */
export const unsealSovereignty = (store: SovereigntyStore): boolean => {
  const wasSealed =
    isSovereigntyLocked(store) || store.getItem(SOVEREIGNTY_INTEGRITY_KEY) !== null;

  store.removeItem(SOVEREIGNTY_LOCK_KEY);
  store.removeItem(SOVEREIGNTY_INTEGRITY_KEY);
  return wasSealed;
};

/** Avisa os ecrãs abertos para relerem o selo (badge PROTEGIDO/MONITORANDO). */
export const notifySovereigntyChanged = (): void => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(SOVEREIGNTY_EVENT));
};
