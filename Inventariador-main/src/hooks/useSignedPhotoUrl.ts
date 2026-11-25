import { useEffect, useState } from 'react';
import { getSignedPhotoUrl } from '../services/photoStorage';

/**
 * Resolve `_photoUrl` (caminho no bucket privado ou URL antigo) numa URL
 * assinada. `blob:`/`data:` são devolvidos tal como estão (pré-visualização
 * local antes do upload).
 */
export function useSignedPhotoUrl(value?: string | null): string | null {
  const local = value && (value.startsWith('blob:') || value.startsWith('data:')) ? value : null;
  const [url, setUrl] = useState<string | null>(local);

  useEffect(() => {
    let cancelled = false;

    if (!value) {
      setUrl(null);
      return;
    }

    if (value.startsWith('blob:') || value.startsWith('data:')) {
      setUrl(value);
      return;
    }

    setUrl(null);
    getSignedPhotoUrl(value).then((signed) => {
      if (!cancelled) setUrl(signed);
    });

    return () => {
      cancelled = true;
    };
  }, [value]);

  return url;
}
