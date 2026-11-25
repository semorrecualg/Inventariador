import { supabase } from './supabaseService';
import { isLocalPhotoUrl, photoStoragePath } from '../utils/photoStoragePath';
import { logger } from '../utils/logger';

/**
 * O bucket `asset-photos` é privado: nenhum URL público volta a ser guardado.
 * O TTL é curto de propósito (uma hora); cada ecrã pede a sua URL assinada.
 */
export const SIGNED_PHOTO_TTL_SECONDS = 60 * 60;

/**
 * Traduz `_photoUrl` (caminho no bucket ou URL antigo) numa URL assinada.
 * Devolve `null` quando não há foto ou não há sessão/permissão — a UI mostra o
 * placeholder em vez de um URL que responde 400.
 */
export const getSignedPhotoUrl = async (value?: string | null): Promise<string | null> => {
  if (!value) return null;
  if (isLocalPhotoUrl(value)) return value;

  const path = photoStoragePath(value);
  if (!path || !supabase) return null;

  try {
    const { data, error } = await supabase.storage
      .from('asset-photos')
      .createSignedUrl(path, SIGNED_PHOTO_TTL_SECONDS);

    if (error || !data?.signedUrl) {
      logger.warn('[Storage] Não foi possível assinar a foto:', error?.message || path);
      return null;
    }

    return data.signedUrl;
  } catch (err) {
    logger.warn('[Storage] Erro ao assinar a foto:', err);
    return null;
  }
};

export { isLocalPhotoUrl, photoStoragePath };
