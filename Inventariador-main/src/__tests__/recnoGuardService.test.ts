// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../services/sqliteService';
import type { DexieAsset } from '../services/sqliteService';
import { DatabaseLoaderService } from '../services/DatabaseLoaderService';
import { saveCollectedAssetAtomic } from '../services/persistenceService';
import {
  formatRecnoReport,
  invalidateRecnoGuardIndex,
  previewRecnoCollisions,
  reportRecnoCollisions,
  reportRecnoConflictForAsset,
  RECNO_AUDIT_ACTION
} from '../services/recnoGuardService';

const asset = (over: Partial<DexieAsset> & { primarykey: string }): DexieAsset =>
  ({
    id: over.primarykey,
    tenantid: 'CICOPAL',
    filial: '010101 CICOPAL GO',
    filial_raw: '010101 CICOPAL GO',
    etiqueta: 'ETQ-1',
    tag: 'ETQ-1',
    status: 'EM USO',
    qt: 1,
    descricaodoativo: 'CADEIRA GIRATORIA',
    vlraquisic: 345.26,
    sn1_recno: 6569,
    _is_synced: 0,
    _is_deleted: 0,
    _conferido: 0,
    _plaquetado: 0,
    _aprovado: 0,
    _isNew: 0,
    _is_unitized: 0,
    _is_divergent_baixa: 0,
    _history: null,
    DE_PARA: null,
    _photoUrl: null,
    gps_lat: null,
    gps_lng: null,
    ...over
  }) as DexieAsset;

const dupLogs = async () => db.audit_logs.filter((log) => log.acao === RECNO_AUDIT_ACTION).toArray();

describe('recnoGuardService · guardião suave de duplicidade', () => {
  beforeEach(async () => {
    await db.local_assets.clear();
    await db.ativos.clear();
    await db.assets.clear();
    await db.audit_logs.clear();
    invalidateRecnoGuardIndex();
  });

  it('mostra os casos existentes na base (mesmo recno, dados diferentes)', async () => {
    await db.local_assets.bulkPut([
      asset({ primarykey: 'PK-1', etiqueta: '003753', sn1_recno: 6569, vlraquisic: 345.26 }),
      asset({ primarykey: 'PK-2', etiqueta: '001947', sn1_recno: 6569, vlraquisic: 3.49, descricaodoativo: 'CADEIRA ESC FIXA AZ' }),
      asset({ primarykey: 'PK-3', etiqueta: '000999', sn1_recno: 77777, vlraquisic: 10 })
    ]);

    const collisions = await previewRecnoCollisions();
    expect(collisions).toHaveLength(1);
    expect(collisions[0]).toMatchObject({ filial: '010101 CICOPAL GO', recno: 6569 });
    expect(collisions[0].rows.map((row) => row.etiqueta)).toEqual(['003753', '001947']);
  });

  it('registra o caso em audit_logs e não repete o registro', async () => {
    await db.local_assets.bulkPut([
      asset({ primarykey: 'PK-1', etiqueta: 'A1', sn1_recno: 900 }),
      asset({ primarykey: 'PK-2', etiqueta: 'A2', sn1_recno: 900, vlraquisic: 1 })
    ]);

    const first = await reportRecnoCollisions('GESTOR_BASE');
    expect(first.collisions).toHaveLength(1);
    expect(first.logged).toBe(1);

    const logs = await dupLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].registro_id).toBe('CICOPAL|010101 CICOPAL GO|900');
    expect(logs[0].details).toContain('Possível duplicidade por recno');
    const delta = JSON.parse(String(logs[0].delta));
    expect(delta).toMatchObject({ source: 'GESTOR_BASE', recno: 900, filial: '010101 CICOPAL GO' });
    expect(delta.rows).toHaveLength(2);

    const second = await reportRecnoCollisions('GESTOR_BASE');
    expect(second.logged).toBe(0);
    expect(await dupLogs()).toHaveLength(1);
  });

  it('na conferência, detecta o conflito, audita e NÃO bloqueia a gravação', async () => {
    await db.local_assets.bulkPut([
      asset({ primarykey: 'PK-1', etiqueta: 'A1', sn1_recno: 6569, vlraquisic: 345.26 })
    ]);
    invalidateRecnoGuardIndex();

    await saveCollectedAssetAtomic({
      tenantid: 'CICOPAL',
      filial: '010101 CICOPAL GO',
      primarykey: 'PK-2',
      etiqueta: 'A2',
      sn1_recno: 6569,
      vlraquisic: 3.49,
      descricaodoativo: 'CADEIRA ESC FIXA AZ'
    });

    // A conferência foi gravada: o guardião só avisa.
    expect(await db.local_assets.count()).toBe(2);
    expect(await db.audit_logs.filter((log) => log.acao === 'DEDUP_ASSETS').count()).toBe(0);
    const logs = await dupLogs();
    expect(logs).toHaveLength(1);
    expect(JSON.parse(String(logs[0].delta)).source).toBe('CONFERENCIA');
    expect(logs[0].details).toContain('Nada foi bloqueado nem apagado');
  });

  it('conferência com os MESMOS dados do recno não gera alarme', async () => {
    await db.local_assets.bulkPut([
      asset({ primarykey: 'PK-1', etiqueta: 'A1', sn1_recno: 700, vlraquisic: 10 })
    ]);
    invalidateRecnoGuardIndex();

    const report = await reportRecnoConflictForAsset(
      { tenantid: 'CICOPAL', filial: '010101 CICOPAL GO', primarykey: 'PK-9', etiqueta: 'A1', sn1_recno: 700, vlraquisic: 10 },
      'CONFERENCIA'
    );
    expect(report.collisions).toHaveLength(0);
    expect(await dupLogs()).toHaveLength(0);
  });

  it('a carga da planilha audita os conflitos do próprio arquivo', async () => {
    await DatabaseLoaderService.injetarDadosEmLotes([
      { tenantid: 'CICOPAL', filial: '010101 CICOPAL GO', etiqueta: 'A1', descricaodoativo: 'CADEIRA', vlraquisic: 10, sn1_recno: 500, qt: 1 },
      { tenantid: 'CICOPAL', filial: '010101 CICOPAL GO', etiqueta: 'A2', descricaodoativo: 'MESA', vlraquisic: 20, sn1_recno: 500, qt: 1 }
    ]);

    const logs = await dupLogs();
    expect(logs).toHaveLength(1);
    expect(JSON.parse(String(logs[0].delta)).source).toBe('CARGA_PLANILHA');
    // Nada foi descartado: as duas linhas existem.
    expect(await db.local_assets.count()).toBe(2);
  });

  it('o relatório diz explicitamente quando não há casos', async () => {
    expect(formatRecnoReport({ collisions: [], logged: 0 })).toEqual([
      '[RECNO] Nenhuma duplicidade por tenantid + filial + sn1_recno na base local.'
    ]);
  });
});
