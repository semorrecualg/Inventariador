// src/__tests__/countAtivosByTenant.test.ts
// SRE ISOLAMENTO: a contagem de ativos usada no roteamento pós-login e no gate
// de módulos é escopada ao tenantid do usuário — nunca global (que poderia
// conter dados de outro contrato em cache local, ex.: CICOPAL para um MASTER
// de CLIENTETESTE).
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db, sqliteService } from '../services/sqliteService';
import type { DexieAsset } from '../services/sqliteService';

async function putMirror(table: 'ativos' | 'local_assets', tenantid: string, pk: string) {
  await db[table].put({
    primarykey: pk,
    id: pk,
    tenantid,
    filial: 'FILIAL-X',
    status: 'P',
    etiqueta: pk,
    tag: pk,
    qt: 1,
    descricaodoativo: 'Ativo',
    serial: null,
    dataaqusic: null,
    cnpj: null,
    nomefornecedor: null,
    notafiscal: null,
    endereco: null,
    registro: null,
    subreg: null,
    databaixa: null,
    contacontabil: null,
    centrodecusto: null,
    vlraquisic: 0,
    sn1_recno: null,
    sn3_recno: null,
    _is_synced: 1,
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
    gps_lng: null
  } as unknown as DexieAsset);
}

describe('sqliteService.countAtivosByTenant (isolamento por tenant)', () => {
  beforeEach(async () => {
    await db.ativos.clear();
    await db.local_assets.clear();
  });

  it('conta apenas os ativos do tenant informado (espelhos deduplicados)', async () => {
    // Mesmo ativo espelhado nas duas tabelas (padrão de gravação do app)
    await putMirror('ativos', 'CLIENTETESTE', 'PK-001');
    await putMirror('local_assets', 'CLIENTETESTE', 'PK-001');
    await putMirror('ativos', 'CICOPAL', 'PK-002');
    await putMirror('local_assets', 'CICOPAL', 'PK-002');

    expect(await sqliteService.countAtivosByTenant('CLIENTETESTE')).toBe(1);
    expect(await sqliteService.countAtivosByTenant('CICOPAL')).toBe(1);
    // Case/trim insensível
    expect(await sqliteService.countAtivosByTenant('  clienteteste ')).toBe(1);
  });

  it('retorna 0 quando o tenant não tem ativos mesmo com base global cheia', async () => {
    await putMirror('ativos', 'CICOPAL', 'PK-001');
    await putMirror('local_assets', 'CICOPAL', 'PK-001');

    expect(await sqliteService.countAtivosByTenant('CLIENTETESTE')).toBe(0);
  });

  it('sem tenant informado delega à contagem global (compatibilidade)', async () => {
    await putMirror('ativos', 'CICOPAL', 'PK-001');
    await putMirror('local_assets', 'CICOPAL', 'PK-001');

    expect(await sqliteService.countAtivosByTenant()).toBe(1);
    expect(await sqliteService.countAtivosByTenant(null)).toBe(1);
    expect(await sqliteService.countAtivosByTenant('')).toBe(1);
  });
});
