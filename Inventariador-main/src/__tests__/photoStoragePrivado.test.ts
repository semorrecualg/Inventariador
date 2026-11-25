// src/__tests__/photoStoragePrivado.test.ts
// Regressão da privatização do bucket `asset-photos` e do fecho do Kardex:
//  - `_photoUrl` guarda o CAMINHO; URLs antigas (pública/assinada) resolvem;
//  - o app já não chama `getPublicUrl` nem aceita o ativo em base64 no URL;
//  - o SQL fecha o bucket e filtra storage.objects por tenant.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { photoStoragePath, isLocalPhotoUrl } from '../utils/photoStoragePath';

const fonte = (rel: string) => readFileSync(join(process.cwd(), 'src', rel), 'utf8');
const sqlPrivacidade = readFileSync(
  join(process.cwd(), 'docs', 'supabase_privacidade_storage.sql'),
  'utf8'
);

describe('photoStoragePath — caminho do objecto a partir de _photoUrl', () => {
  it('aceita o caminho guardado pelo sync', () => {
    expect(photoStoragePath('photos/CICOPAL/123/1700000000000.jpg')).toBe(
      'photos/CICOPAL/123/1700000000000.jpg'
    );
    expect(photoStoragePath('/photos/CICOPAL/123/foto.jpg')).toBe('photos/CICOPAL/123/foto.jpg');
  });

  it('extrai o caminho dos três formatos de URL do Storage', () => {
    const esperado = 'photos/CICOPAL/123/foto.jpg';
    expect(
      photoStoragePath(
        'https://x.supabase.co/storage/v1/object/public/asset-photos/photos/CICOPAL/123/foto.jpg'
      )
    ).toBe(esperado);
    expect(
      photoStoragePath(
        'https://x.supabase.co/storage/v1/object/sign/asset-photos/photos/CICOPAL/123/foto.jpg?token=abc'
      )
    ).toBe(esperado);
    expect(
      photoStoragePath(
        'https://x.supabase.co/storage/v1/object/authenticated/asset-photos/photos/CICOPAL/123/foto.jpg'
      )
    ).toBe(esperado);
  });

  it('descarta query/token e não trata blob:/data: como objecto do bucket', () => {
    expect(photoStoragePath('photos/CICOPAL/123/foto.jpg?token=abc')).toBe('photos/CICOPAL/123/foto.jpg');
    expect(photoStoragePath('blob:http://localhost/abc')).toBeNull();
    expect(photoStoragePath('data:image/jpeg;base64,AAA')).toBeNull();
    expect(photoStoragePath('https://outro.example/foto.jpg')).toBeNull();
    expect(photoStoragePath(undefined)).toBeNull();
    expect(isLocalPhotoUrl('blob:http://localhost/abc')).toBe(true);
  });
});

describe('bucket privado — o código deixou de emitir URL pública', () => {
  it('o upload devolve o caminho e não chama getPublicUrl', () => {
    const service = fonte('services/supabaseService.ts');
    expect(service).not.toContain('getPublicUrl');
    expect(service).toContain('photoStoragePath(photoUrlOrPath)');
  });

  it('a assinatura é pedida com TTL de uma hora', () => {
    const service = fonte('services/photoStorage.ts');
    expect(service).toContain('createSignedUrl(path, SIGNED_PHOTO_TTL_SECONDS)');
    expect(service).toContain('SIGNED_PHOTO_TTL_SECONDS = 60 * 60');
  });

  it('o backup automático fica dentro da pasta do tenant', () => {
    const service = fonte('services/backupService.ts');
    expect(service).toContain('photos/${tenantid}/backups/${userId}/backup_v24.json');
  });
});

describe('Kardex público — sem payload em base64 no URL', () => {
  it('o app deixou de descodificar ?d=', () => {
    const app = fonte('App.tsx');
    expect(app).not.toContain("params.get('d')");
    expect(app).not.toContain('atob(dataParam)');
  });

  it('a consulta por etiqueta exige tenant', () => {
    const app = fonte('App.tsx');
    expect(app).toContain('getAssetByTag(etqParam, user.tenantid)');
    expect(app).not.toContain('getAssetByTag(etqParam, user?.tenantid)');
  });
});

describe('docs/supabase_privacidade_storage.sql — invariantes', () => {
  it('fecha o bucket e mantém as quatro políticas por tenant', () => {
    expect(sqlPrivacidade).toContain("VALUES ('asset-photos', 'asset-photos', false)");
    for (const op of ['select', 'insert', 'update', 'delete']) {
      expect(sqlPrivacidade).toContain(`CREATE POLICY p_asset_photos_tenant_${op} ON storage.objects`);
    }
  });

  it('remove o p_all da tabela asset-photos e cria a política por tenant', () => {
    expect(sqlPrivacidade).toContain('DROP POLICY IF EXISTS p_all ON public."asset-photos"');
    expect(sqlPrivacidade).not.toContain('CREATE POLICY p_all ON public."asset-photos"');
    expect(sqlPrivacidade).toContain('CREATE POLICY p_tenant_all ON public."asset-photos"');
  });

  it('move os backups legados para photos/{tenantid}/backups e é idempotente', () => {
    expect(sqlPrivacidade).toContain("SET name = 'photos/' || up.tenantid || '/backups/'");
    expect(sqlPrivacidade).toContain("AND o.name LIKE 'backups/%'");
    expect(sqlPrivacidade).toContain('BEGIN;');
    expect(sqlPrivacidade).toContain('COMMIT;');
  });
});
