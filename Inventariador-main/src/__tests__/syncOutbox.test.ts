// @vitest-environment jsdom
// ============================================================================
// syncOutbox.test.ts — contrato da fila de subida durável (schema v9).
//
// Fixa o que a Fase 1 promete:
//  1. `entradaOutbox` normaliza contrato (caixa alta) e chave do ativo;
//  2. `enfileirarOutbox` é idempotente (a chave primária é `key`);
//  3. `semearOutboxDePendentes` copia só o que está `_is_synced = 0`, marca
//     exclusões como DELETE e NÃO reinicia `attempts` de entradas existentes;
//  4. envio aceite remove a entrada; envio falhado incrementa `attempts` e
//     empurra `next_attempt_at` com recuo crescente.
// ============================================================================
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.stubEnv('VITE_SUPABASE_URL', 'https://fake.supabase.co');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'fake-anon-key');
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: vi.fn(() => false) } }));

import { db } from '../services/sqliteService';
import type { DexieAsset } from '../services/sqliteService';
import {
  chaveOutbox,
  entradaOutbox,
  enfileirarOutbox,
  marcarEnviadosOutbox,
  marcarFalhasOutbox,
  recuoDe,
  resumoOutbox,
  semearOutboxDePendentes
} from '../services/syncOutbox';

const ativo = (over: Record<string, unknown> = {}) => ({
  id: 'PK-1',
  primarykey: 'PK-1',
  tenantid: 'cicopal',
  filial: '010101 CICOPAL GO',
  etiqueta: '007222',
  _is_synced: 0,
  _is_deleted: 0,
  ...over
});

describe('sync_outbox — fila de subida durável', () => {
  beforeEach(async () => {
    await db.sync_outbox.clear();
    await db.local_assets.clear();
  });

  it('normaliza o contrato em caixa alta e usa tenantid|primarykey como chave', () => {
    const entrada = entradaOutbox({ primarykey: ' pk 1 ', tenantid: ' cicopal ' });
    expect(entrada.tenantid).toBe('CICOPAL');
    expect(entrada.key).toBe(chaveOutbox('cicopal', 'PK1'));
    expect(entrada.op).toBe('UPSERT');
    expect(entrada.status).toBe('PENDENTE');
    expect(entrada.attempts).toBe(0);
    expect(entrada.next_attempt_at).toBe(0);
  });

  it('exclusão sobe como DELETE', () => {
    expect(entradaOutbox({ primarykey: 'PK-1', tenantid: 'CICOPAL', _is_deleted: 1 }).op).toBe('DELETE');
  });

  it('enfileirar duas vezes o mesmo ativo deixa uma única linha', async () => {
    await enfileirarOutbox(ativo());
    await enfileirarOutbox(ativo({ etiqueta: '007223' }));
    const entradas = await db.sync_outbox.toArray();
    expect(entradas).toHaveLength(1);
    expect(entradas[0].key).toBe('CICOPAL|PK-1');
  });

  it('semear copia só os pendentes e preserva o recuo de quem já falhou', async () => {
    await db.local_assets.bulkPut([
      ativo({ primarykey: 'PK-1', _is_synced: 0 }) as unknown as DexieAsset,
      ativo({ primarykey: 'PK-2', _is_synced: 1 }) as unknown as DexieAsset,
      ativo({ primarykey: 'PK-3', _is_synced: 0, _is_deleted: 1 }) as unknown as DexieAsset
    ]);
    // PK-1 já está na outbox com uma tentativa falhada: a semeadura não a reseta.
    await db.sync_outbox.put({
      ...entradaOutbox(ativo({ primarykey: 'PK-1' })),
      status: 'FALHA',
      attempts: 2,
      next_attempt_at: 123
    });

    const semeadas = await semearOutboxDePendentes(true);

    expect(semeadas).toBe(1); // só a PK-3 é nova
    const entradas = await db.sync_outbox.toArray();
    expect(entradas.map((entrada) => entrada.key).sort()).toEqual(['CICOPAL|PK-1', 'CICOPAL|PK-3']);
    const pk1 = entradas.find((entrada) => entrada.key === 'CICOPAL|PK-1');
    expect(pk1?.attempts).toBe(2);
    expect(entradas.find((entrada) => entrada.key === 'CICOPAL|PK-3')?.op).toBe('DELETE');
  });

  it('envio aceite remove a entrada do envelope', async () => {
    await enfileirarOutbox(ativo({ primarykey: 'PK-1' }));
    await enfileirarOutbox(ativo({ primarykey: 'PK-2' }));

    const removidas = await marcarEnviadosOutbox(['PK-1']);

    expect(removidas).toBe(1);
    expect((await db.sync_outbox.toArray()).map((entrada) => entrada.primarykey)).toEqual(['PK-2']);
  });

  it('envio falhado incrementa tentativas e empurra a próxima com recuo', async () => {
    await enfileirarOutbox(ativo({ primarykey: 'PK-1' }));
    const antes = Date.now();

    const atualizadas = await marcarFalhasOutbox([ativo({ primarykey: 'PK-1' })], 'RLS recusou');
    const entrada = (await db.sync_outbox.toArray())[0];

    expect(atualizadas).toBe(1);
    expect(entrada.status).toBe('FALHA');
    expect(entrada.attempts).toBe(1);
    expect(entrada.last_error).toBe('RLS recusou');
    expect(entrada.next_attempt_at).toBeGreaterThanOrEqual(antes + recuoDe(1));
    expect(recuoDe(3)).toBeGreaterThan(recuoDe(1));
    expect(recuoDe(99)).toBe(recuoDe(6)); // tecto
  });

  it('resumo separa pendentes de falhas', async () => {
    await enfileirarOutbox(ativo({ primarykey: 'PK-1' }));
    await enfileirarOutbox(ativo({ primarykey: 'PK-2' }));
    await marcarFalhasOutbox([ativo({ primarykey: 'PK-2', id: 'PK-2' })], 'rede');

    await expect(resumoOutbox()).resolves.toEqual({ pendentes: 1, falhas: 1, total: 2 });
  });

  it('marcar falha de um ativo que nunca passou pela outbox cria a entrada com recuo', async () => {
    // Antes esta função só tocava em envelopes existentes, e este ativo ficava
    // sem recuo: era tentado a cada ciclo de 60 s.
    const criadas = await marcarFalhasOutbox(
      [{ primarykey: 'PK-XXXX', tenantid: 'CICOPAL', _is_deleted: 0 }],
      'rede'
    );
    const entrada = (await db.sync_outbox.toArray())[0];

    expect(criadas).toBe(1);
    expect(entrada).toMatchObject({
      key: 'CICOPAL|PK-XXXX',
      primarykey: 'PK-XXXX',
      tenantid: 'CICOPAL',
      op: 'UPSERT',
      status: 'FALHA',
      attempts: 1
    });
    expect(entrada.next_attempt_at).toBeGreaterThan(Date.now());
  });
});
