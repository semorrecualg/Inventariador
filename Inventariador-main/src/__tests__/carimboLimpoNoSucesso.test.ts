// @vitest-environment jsdom
// ============================================================================
// carimboLimpoNoSucesso.test.ts — um só caminho apaga o carimbo no sucesso.
//
// `_is_synced = 1` («esta linha é igual à nuvem») e `_syncFailAt` («a nuvem
// recusou este registo») não podem coexistir. Havia três escritas de sucesso e
// só o envio em massa/fila passava pela limpeza; a fila de fotos marcava
// `_is_synced = 1` com `.modify` e deixava o carimbo agarrado, e o estado
// visual do App copiava o carimbo para a linha «sincronizada». Pior: a recusa
// de uma tentativa antiga podia chegar depois de outra via já ter marcado o
// registo como igual à nuvem — o carimbo ficava órfão e voltava a pintar o
// selo no primeiro toque.
//
// Os testes fixam a regra: registo que termina sincronizado nunca guarda
// carimbo, em qualquer ordem dos dois desfechos; registo que falhou de verdade
// continua carimbado.
// ============================================================================
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db, sqliteService } from '../services/sqliteService';
import type { DexieAsset } from '../services/sqliteService';
import { marcarSincronizadoLocal, syncFailureInfo } from '../utils/syncFalha';

const CARIMBO = '2026-11-20T10:00:00.000Z';
const MOTIVO = '42501: permissão negada';

const linha = (over: Record<string, unknown> = {}): DexieAsset =>
  ({
    id: 'PK-1',
    primarykey: 'PK-1',
    tenantid: 'CICOPAL',
    filial: '010101 CICOPAL GO',
    etiqueta: '007222',
    status: 'P',
    qt: 1,
    descricaodoativo: 'Ativo de prova',
    _is_synced: 0,
    _is_deleted: 0,
    _conferido: 0,
    ...over
  }) as unknown as DexieAsset;

const semear = async (over: Record<string, unknown> = {}): Promise<DexieAsset> => {
  const registo = linha(over);
  await db.ativos.put({ ...registo } as DexieAsset);
  await db.local_assets.put({ ...registo } as DexieAsset);
  return registo;
};

// A.3a.3: `assets` deixou de receber escrita — as provas olham para as duas
// tabelas vivas.
const porEspelho = async (): Promise<Array<DexieAsset | undefined>> => [
  (await db.ativos.where('primarykey').equals('PK-1').first()) as DexieAsset | undefined,
  (await db.local_assets.where('primarykey').equals('PK-1').first()) as DexieAsset | undefined
];

const carimbosNosEspelhos = async (): Promise<Array<string | null>> => {
  const registos = await porEspelho();
  return registos.map(r => (r && r._syncFailAt ? String(r._syncFailAt) : null));
};

describe('carimbo da falha no sucesso — uma só regra', () => {
  beforeEach(async () => {
    await db.ativos.clear();
    await db.assets.clear();
    await db.local_assets.clear();
  });

  it('o patch do sucesso apaga o carimbo sem mutar o registo de origem', () => {
    const original = { primarykey: 'PK-1', _is_synced: 0, _syncFailAt: CARIMBO, _syncFailReason: MOTIVO };

    const marcado = marcarSincronizadoLocal(original);

    expect(marcado._is_synced).toBe(1);
    expect('_syncFailAt' in marcado).toBe(false);
    expect('_syncFailReason' in marcado).toBe(false);
    // O objeto de origem fica como estava (o App pode reutilizá-lo na fila).
    expect(original._syncFailAt).toBe(CARIMBO);
    expect(original._is_synced).toBe(0);
  });

  it('fila/envio em massa (`markAssetsSynced`) apaga o carimbo nas duas tabelas', async () => {
    await semear({ _syncFailAt: CARIMBO, _syncFailReason: MOTIVO });

    await sqliteService.markAssetsSynced(['PK-1']);

    expect(await carimbosNosEspelhos()).toEqual([null, null]);
    const registos = await porEspelho();
    registos.forEach(r => expect(Number(r?._is_synced)).toBe(1));
  });

  it('a fila de fotos passa pelo ponto único: `_photoUrl` entra, carimbo sai', async () => {
    await semear({ _syncFailAt: CARIMBO, _syncFailReason: MOTIVO });

    await sqliteService.markAssetsSynced(['PK-1'], { _photoUrl: 'https://cdn/foto.jpg' });

    const registos = await porEspelho();
    registos.forEach(r => {
      expect(r?._photoUrl).toBe('https://cdn/foto.jpg');
      expect(Number(r?._is_synced)).toBe(1);
      expect(r?._syncFailAt).toBeUndefined();
      expect(r?._syncFailReason).toBeUndefined();
    });
    expect(syncFailureInfo(registos[1])).toBeNull();
  });

  it('o pull (`markSynced`) deixa o registo igual à nuvem sem carimbo', async () => {
    await semear({ _syncFailAt: CARIMBO, _syncFailReason: MOTIVO });

    await sqliteService.bulkInsertAssetsOfflineFirst(
      [linha({ _syncFailAt: CARIMBO, _syncFailReason: MOTIVO }) as unknown as Record<string, unknown>],
      undefined,
      { markSynced: true }
    );

    expect(await carimbosNosEspelhos()).toEqual([null, null]);
    const registos = await porEspelho();
    registos.forEach(r => expect(Number(r?._is_synced)).toBe(1));
  });

  it('corrida — falha primeiro, sucesso depois: o carimbo sai', async () => {
    await semear();

    await sqliteService.markAssetsFailed([{ primarykey: 'PK-1', motivo: MOTIVO }]);
    expect((await carimbosNosEspelhos())[1]).toBeTruthy();

    await sqliteService.markAssetsSynced(['PK-1']);

    expect(await carimbosNosEspelhos()).toEqual([null, null]);
  });

  it('corrida — sucesso primeiro, falha atrasada depois: a falha não carimba um registo sincronizado', async () => {
    await semear();

    await sqliteService.markAssetsSynced(['PK-1']);
    // A recusa chega com a cópia em memória de antes do sucesso (`_is_synced = 0`).
    await sqliteService.markAssetsFailed([
      { primarykey: 'PK-1', motivo: MOTIVO, registo: { _is_synced: 0 } }
    ]);

    expect(await carimbosNosEspelhos()).toEqual([null, null]);
    const registos = await porEspelho();
    registos.forEach(r => expect(Number(r?._is_synced)).toBe(1));
    const pendentes = await db.local_assets.where('_is_synced').equals(0).toArray();
    expect(pendentes).toEqual([]);
  });

  it('a falha legítima de um registo pendente continua carimbada (não silencia recusas)', async () => {
    await semear({ _is_synced: 0 });

    await sqliteService.markAssetsFailed([{ primarykey: 'PK-1', motivo: MOTIVO }]);

    const carimbos = await carimbosNosEspelhos();
    carimbos.forEach(carimbo => expect(carimbo).toBeTruthy());
    const registos = await porEspelho();
    registos.forEach(r => expect(String(r?._syncFailReason)).toContain('permissão negada'));
  });
});
