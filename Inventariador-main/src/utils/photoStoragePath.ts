/**
 * Caminho do objecto no bucket `asset-photos` a partir do que está guardado em
 * `_photoUrl`.
 *
 * O bucket passou a privado: o que se guarda é o caminho
 * (`photos/{tenantid}/{assetId}/{ficheiro}`) e a URL assinada é gerada na
 * altura de mostrar. Registos antigos continuam a ter o URL público (ou já um
 * URL assinado), por isso a leitura aceita os três formatos:
 *   …/storage/v1/object/public/asset-photos/photos/…
 *   …/storage/v1/object/sign/asset-photos/photos/…?token=…
 *   …/storage/v1/object/authenticated/asset-photos/photos/…
 *
 * `blob:` e `data:` são URLs locais legítimas (pré-visualização antes do
 * upload) e não têm caminho no bucket — devolvem `null`.
 */
const BUCKET = 'asset-photos';

export function isLocalPhotoUrl(value?: string | null): boolean {
  return !!value && (value.startsWith('blob:') || value.startsWith('data:'));
}

/**
 * Os objectos vivem todos em `photos/...` — é o que a política do bucket exige.
 * A fila de fotos antiga gravava em `{tenantid}/{assetId}/...` sem o prefixo;
 * quem tem esse caminho guardado continua a conseguir assiná-lo.
 */
function withPhotosPrefix(path: string): string | null {
  if (!path) return null;
  return path.startsWith('photos/') ? path : `photos/${path}`;
}

export function photoStoragePath(value?: string | null): string | null {
  if (!value) return null;

  const raw = value.trim();
  if (!raw || isLocalPhotoUrl(raw)) return null;

  if (!/^https?:\/\//i.test(raw)) {
    const path = raw.replace(/^\/+/, '').split('?')[0];
    return withPhotosPrefix(path);
  }

  const marker = `/${BUCKET}/`;
  const idx = raw.indexOf(marker);
  if (idx === -1) return null;

  const path = raw.slice(idx + marker.length).split(/[?#]/)[0];
  if (!path) return null;

  try {
    return withPhotosPrefix(decodeURIComponent(path));
  } catch {
    return withPhotosPrefix(path);
  }
}
