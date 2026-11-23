// @vitest-environment jsdom
// ============================================================================
// auditoriaRetencao.test.ts — o expurgo não apaga a prova da falha de envio.
//
// O ciclo de sincronização apagava tudo o que tivesse mais de 7 dias em
// `audit_logs`, incluindo `SYNC_RECORD_FAIL` / `SYNC_RECORD_EXCEPTION`. O
// carimbo do ativo (`_syncFailAt`) sobrevivia, mas a causa desaparecia da
// trilha — e é a trilha que o suporte lê para saber por que o registo não
// subiu. Estes testes fixam a excepção: a rotina continua a expurgar o resto.
// ============================================================================
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../services/sqliteService';
import {
  purgarAuditoriaAntiga,
  RETENCAO_AUDITORIA_DIAS,
  RETENCAO_NAO_ENVIADO_DIAS
} from '../services/auditoriaRetencao';

const DIA = 24 * 60 * 60 * 1000;
const AGORA = Date.parse('2026-11-19T12:00:00.000Z');

const linha = (id: string, acao: string, quando: number, sincronizada = 1) => ({
  id,
  usuario: 'semorr@gmail.com',
  acao,
  tabela: 'local_assets',
  registro_id: id,
  details: 'detalhe',
  delta: null,
  updated_at: new Date(quando).toISOString(),
  _synced: sincronizada,
});

beforeEach(async () => {
  await db.audit_logs.clear();
});

describe('expurgo da trilha de auditoria', () => {
  it('apaga o histórico confirmado com mais de sete dias', async () => {
    await db.audit_logs.bulkPut([
      linha('velho', 'UPDATE', AGORA - 8 * DIA, 1),
      linha('recente', 'LOGIN', AGORA - 1 * DIA, 1),
    ]);

    const resultado = await purgarAuditoriaAntiga(AGORA);

    expect(resultado.apagadas).toBe(1);
    expect(resultado.limite).toBe(new Date(AGORA - RETENCAO_AUDITORIA_DIAS * DIA).toISOString());
    expect((await db.audit_logs.toArray()).map((log) => log.id)).toEqual(['recente']);
  });

  it('não apaga um evento sem confirmação da nuvem (janela de segurança de 30 dias)', async () => {
    await db.audit_logs.bulkPut([
      linha('nao-subiu', 'CONFERENCIA', AGORA - 8 * DIA, 0),
      linha('confirmado', 'LOGIN', AGORA - 8 * DIA, 1),
    ]);

    const resultado = await purgarAuditoriaAntiga(AGORA);

    expect(resultado.apagadas).toBe(1);
    expect(resultado.preservadas).toBe(1);
    expect((await db.audit_logs.toArray()).map((log) => log.id)).toEqual(['nao-subiu']);
  });

  it('apaga o não confirmado depois da janela de segurança', async () => {
    await db.audit_logs.put(linha('abandonado', 'CONFERENCIA', AGORA - 31 * DIA, 0));

    const resultado = await purgarAuditoriaAntiga(AGORA);

    expect(resultado.apagadas).toBe(1);
    expect(resultado.limiteSeguranca).toBe(
      new Date(AGORA - RETENCAO_NAO_ENVIADO_DIAS * DIA).toISOString()
    );
  });

  it('preserva as recusas e as excepções do envio, mesmo antigas', async () => {
    await db.audit_logs.bulkPut([
      linha('fail', 'SYNC_RECORD_FAIL', AGORA - 30 * DIA),
      linha('exc', 'SYNC_RECORD_EXCEPTION', AGORA - 30 * DIA),
      linha('velho', 'UPDATE', AGORA - 30 * DIA, 1),
    ]);

    expect((await purgarAuditoriaAntiga(AGORA)).apagadas).toBe(1);

    const restantes = (await db.audit_logs.toArray()).map((log) => log.id).sort();
    expect(restantes).toEqual(['exc', 'fail']);
  });

  it('reconhece a acção sem depender da caixa', async () => {
    await db.audit_logs.put(linha('minusculas', 'sync_record_fail', AGORA - 30 * DIA));

    expect((await purgarAuditoriaAntiga(AGORA)).apagadas).toBe(0);
    expect(await db.audit_logs.count()).toBe(1);
  });

  it('não apaga nada quando a trilha está toda dentro da janela', async () => {
    await db.audit_logs.bulkPut([
      linha('a', 'UPDATE', AGORA - 1 * DIA),
      linha('b', 'SYNC_RECORD_FAIL', AGORA - 2 * DIA),
    ]);

    expect((await purgarAuditoriaAntiga(AGORA)).apagadas).toBe(0);
    expect(await db.audit_logs.count()).toBe(2);
  });
});
