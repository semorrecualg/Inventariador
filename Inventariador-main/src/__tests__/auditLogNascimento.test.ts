// @vitest-environment jsdom
// ============================================================================
// auditLogNascimento.test.ts — o evento guarda o contrato e os dois estados.
//
// A fila de F2 resolvia o `tenantid` no momento do ENVIO: um evento do contrato
// A que subisse com o contrato B activo era arquivado em B. E o `delta` antigo
// guardava UM estado (`new_data ? … : old_data`), perdendo o anterior em
// qualquer alteração. Aqui fixa-se o contrato novo: carimbo no nascimento e
// `old_data`/`new_data` em campos próprios.
// ============================================================================
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db, gravarAuditoria, sqliteService } from '../services/sqliteService';
import { localDb } from '../services/localDbService';

const ENTRADA = {
  timestamp: '2026-11-23T10:00:00.000Z',
  user: 'auditor@gbr.com.br',
  action: 'CONFERENCIA',
  table_name: 'local_assets',
  record_id: 'PK-1',
  details: 'ativo conferido',
  old_data: { status: 'PENDENTE' },
  new_data: { status: 'CONFERIDO' }
};

beforeEach(async () => {
  await db.audit_logs.clear();
  localStorage.clear();
  sessionStorage.clear();
});

describe('trilha — contrato carimbado no nascimento', () => {
  it('grava o contrato do momento do evento, não o do envio', async () => {
    sessionStorage.setItem('app_current_user', JSON.stringify({ tenantid: 'CICOPAL' }));

    await localDb.auditLogs.add(ENTRADA);

    const linhas = await db.audit_logs.toArray();
    expect(linhas).toHaveLength(1);
    expect(linhas[0].tenantid).toBe('CICOPAL');

    // O contrato activo muda antes de a fila subir: o carimbo não pode mudar.
    sessionStorage.clear();
    localStorage.setItem('tenantid', 'OUTRO_CONTRATO');

    expect((await db.audit_logs.get(linhas[0].id))?.tenantid).toBe('CICOPAL');
  });

  it('carimba o contrato também nos eventos do sqliteService', async () => {
    localStorage.setItem('tenantid', 'CICOPAL');

    await sqliteService.logAuditEvent(
      'auditor@gbr.com.br',
      'SYNC_DELETE_WINS',
      'local_assets',
      'PK-2',
      'exclusão venceu a subida',
      JSON.stringify({ signature: 'abc123' })
    );

    const linha = (await db.audit_logs.toArray()).find((log) => log.registro_id === 'PK-2');
    expect(linha?.tenantid).toBe('CICOPAL');
    expect(linha?._synced).toBe(0);
  });
});

describe('ponto único — gravarAuditoria', () => {
  it('carimba o contrato e guarda o estado novo a partir do delta', async () => {
    localStorage.setItem('tenantid', 'CICOPAL');

    const id = await gravarAuditoria({
      usuario: 'auditor@gbr.com.br',
      acao: 'CONFERENCIA',
      tabela: 'local_assets',
      registro_id: 'PK-9',
      details: 'conferido',
      delta: JSON.stringify({ status: 'CONFERIDO' })
    });

    const linha = await db.audit_logs.get(id);
    expect(linha?.tenantid).toBe('CICOPAL');
    expect(linha?._synced).toBe(0);
    expect(JSON.parse(String(linha?.new_data))).toEqual({ status: 'CONFERIDO' });
    expect(linha?.old_data).toBeNull();
  });

  it('contrato explícito vence o activo e `old_data` fica separado', async () => {
    localStorage.setItem('tenantid', 'OUTRO_CONTRATO');

    const id = await gravarAuditoria({
      usuario: 'auditor@gbr.com.br',
      acao: 'CONFERENCIA',
      registro_id: 'PK-10',
      old_data: JSON.stringify({ status: 'PENDENTE' }),
      new_data: JSON.stringify({ status: 'CONFERIDO' }),
      tenantid: 'CICOPAL'
    });

    const linha = await db.audit_logs.get(id);
    expect(linha?.tenantid).toBe('CICOPAL');
    expect(JSON.parse(String(linha?.old_data))).toEqual({ status: 'PENDENTE' });
    expect(JSON.parse(String(linha?.new_data))).toEqual({ status: 'CONFERIDO' });
  });

  it('delta em texto livre não vira `new_data`', async () => {
    const id = await gravarAuditoria({
      usuario: 'auditor@gbr.com.br',
      acao: 'LOGIN',
      details: 'login ok',
      delta: 'texto solto'
    });

    const linha = await db.audit_logs.get(id);
    expect(linha?.new_data).toBeNull();
    expect(linha?.delta).toBe('texto solto');
  });
});

describe('trilha — os dois estados ficam guardados', () => {
  it('guarda `old_data` e `new_data` em campos próprios (o delta não perde o anterior)', async () => {
    sessionStorage.setItem('app_current_user', JSON.stringify({ tenantid: 'CICOPAL' }));

    await localDb.auditLogs.add(ENTRADA);

    const [linha] = await db.audit_logs.toArray();
    expect(JSON.parse(String(linha.old_data))).toEqual({ status: 'PENDENTE' });
    expect(JSON.parse(String(linha.new_data))).toEqual({ status: 'CONFERIDO' });
    // `delta` continua como espelho legado do estado novo (dedup de falhas).
    expect(JSON.parse(String(linha.delta))).toEqual({ status: 'CONFERIDO' });
  });

  it('a leitura da Trilha devolve os dois estados e o contrato de origem', async () => {
    sessionStorage.setItem('app_current_user', JSON.stringify({ tenantid: 'CICOPAL' }));
    await localDb.auditLogs.add(ENTRADA);

    // O contrato activo muda: a leitura não pode reescrever a origem do evento.
    sessionStorage.clear();
    localStorage.setItem('tenantid', 'OUTRO_CONTRATO');

    const [lido] = await localDb.auditLogs.reverse().limit(10).toArray();
    expect(lido.new_data).toEqual({ status: 'CONFERIDO' });
    expect(lido.old_data).toEqual({ status: 'PENDENTE' });
    expect(lido.tenantid).toBe('CICOPAL');
  });

  it('sem estados, os campos ficam nulos e o evento continua válido', async () => {
    sessionStorage.setItem('app_current_user', JSON.stringify({ tenantid: 'CICOPAL' }));

    await localDb.auditLogs.add({
      timestamp: '2026-11-23T10:00:00.000Z',
      user: 'auditor@gbr.com.br',
      action: 'LOGIN',
      details: 'login ok'
    });

    const [linha] = await db.audit_logs.toArray();
    expect(linha.old_data).toBeNull();
    expect(linha.new_data).toBeNull();
    expect(linha.delta).toBeNull();
    expect(linha.tenantid).toBe('CICOPAL');
  });
});
