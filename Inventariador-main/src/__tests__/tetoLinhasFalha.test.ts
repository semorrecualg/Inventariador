// @vitest-environment jsdom
// ============================================================================
// tetoLinhasFalha.test.ts — as recusas preservadas têm teto: uma por dia.
//
// O item 2 da agenda tirou as recusas de envio do expurgo de 7 dias (são a prova
// de por que um ativo não subiu), mas a janela de deduplicação era de 10 min: um
// ativo preso com o mesmo erro escrevia 144 linhas por dia, para sempre, numa
// trilha que se quer preservada justamente para diagnosticar.
//
// O teto: a mesma assinatura (`primarykey|erro estável`) escreve no máximo UMA
// linha por dia (UTC). O dia seguinte é uma linha nova — a falha continua
// visível enquanto durar. E o expurgo colapsa o histórico anterior ao teto
// (as 144 linhas diárias) na mais recente de cada dia.
// ============================================================================
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.stubEnv('VITE_SUPABASE_URL', 'https://fake.supabase.co');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'fake-anon-key');

const { fetchCloudDeletedKeys } = vi.hoisted(() => ({ fetchCloudDeletedKeys: vi.fn() }));
fetchCloudDeletedKeys.mockResolvedValue(new Set<string>());

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: vi.fn(() => false) }
}));

vi.mock('../services/supabaseService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/supabaseService')>();
  return {
    ...actual,
    supabase: null,
    fetchCloudDeletedKeys,
    registerCampaignSyncQueueDelegate: vi.fn()
  };
});

import { db } from '../services/sqliteService';
import type { DexieAuditLog } from '../services/sqliteService';
import { assinaturasDeFalhaDeHoje, registarRecusaNaTrilha } from '../services/syncService';
import { purgarAuditoriaAntiga } from '../services/auditoriaRetencao';
import {
  assinaturaDeFalha,
  chaveDeFalhaNoDia,
  idsDeFalhasRepetidas,
  inicioDoDiaDaFalha
} from '../utils/syncFalha';

const ACAO = 'SYNC_RECORD_FAIL';
const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;

/** Mensagem do mesmo erro com o que muda entre tentativas (id, hora, uuid). */
const detalheDoCiclo = (ciclo: number): string =>
  `Falha no upsert (req ${ciclo}): uuid 3f7a1c2e-1b4d-4e9a-9c2f-0a1b2c3d4e5${ciclo % 10} em 2026-11-20T10:${String(ciclo % 60).padStart(2, '0')}:00Z`;

const linha = (over: Partial<DexieAuditLog> & { id: string }): DexieAuditLog => ({
  usuario: 'auditor',
  acao: ACAO,
  tabela: 'local_assets',
  registro_id: 'PK-1',
  details: 'recusa',
  delta: null,
  updated_at: new Date().toISOString(),
  ...over
});

const assinaturaGravada = (primaryKey: string, detalhe: string): string =>
  JSON.stringify({ signature: assinaturaDeFalha(primaryKey, detalhe) });

describe('teto das linhas de falha — o ciclo de sincronização', () => {
  beforeEach(async () => {
    await db.audit_logs.clear();
  });

  it('100 ciclos do mesmo erro ao longo do dia → 1 linha, não 100', async () => {
    // O ciclo real não corre em rajada: corre a cada 60 s, ao longo de horas —
    // um laço instantâneo passaria com qualquer janela. Aqui os 100 ciclos são
    // espalhados pelas 24 h do MESMO dia UTC (00:05 → 23:11), com o instante
    // explícito (o mesmo que o runtime tira do relógio).
    const inicio = Date.UTC(2026, 10, 20, 0, 5, 0);
    for (let ciclo = 0; ciclo < 100; ciclo += 1) {
      const agora = inicio + ciclo * 14 * 60 * 1000;
      // Pior caso: o conjunto é recarregado da trilha a cada ciclo, como numa
      // fila reaberta.
      const jaAuditadas = await assinaturasDeFalhaDeHoje(ACAO, agora);
      await registarRecusaNaTrilha('auditor', ACAO, 'PK-1', detalheDoCiclo(ciclo), jaAuditadas, agora);
    }

    const linhas = await db.audit_logs.toArray();
    expect(linhas).toHaveLength(1);
    expect(linhas[0].registro_id).toBe('PK-1');
  });

  it('o dia seguinte ganha a sua linha (a falha continua visível)', async () => {
    const inicio = Date.UTC(2026, 10, 20, 8, 0, 0);
    const jaAuditadas = await assinaturasDeFalhaDeHoje(ACAO, inicio);
    await registarRecusaNaTrilha('auditor', ACAO, 'PK-1', detalheDoCiclo(1), jaAuditadas, inicio);

    const amanha = inicio + DIA;
    const novoDia = await assinaturasDeFalhaDeHoje(ACAO, amanha);
    expect(novoDia.size).toBe(0);
    await registarRecusaNaTrilha('auditor', ACAO, 'PK-1', detalheDoCiclo(2), novoDia, amanha);

    expect(await db.audit_logs.count()).toBe(2);
  });

  it('a linha de ontem não bloqueia a de hoje: uma por dia enquanto a falha durar', async () => {
    await db.audit_logs.put(
      linha({
        id: 'LOG_ONTEM',
        updated_at: new Date(Date.now() - 2 * DIA).toISOString(),
        delta: assinaturaGravada('PK-1', detalheDoCiclo(1))
      })
    );

    const jaAuditadas = await assinaturasDeFalhaDeHoje(ACAO);
    expect(jaAuditadas.size).toBe(0);

    await registarRecusaNaTrilha('auditor', ACAO, 'PK-1', detalheDoCiclo(2), jaAuditadas);

    expect(await db.audit_logs.count()).toBe(2); // a de ontem + a de hoje
  });

  it('erros diferentes no mesmo dia continuam a ser linhas diferentes', async () => {
    const set = await assinaturasDeFalhaDeHoje(ACAO);
    await registarRecusaNaTrilha('auditor', ACAO, 'PK-1', 'coluna inexistente: foo', set);
    await registarRecusaNaTrilha('auditor', ACAO, 'PK-1', 'viola row-level security', set);
    await registarRecusaNaTrilha('auditor', ACAO, 'PK-2', 'viola row-level security', set);

    expect(await db.audit_logs.count()).toBe(3);
  });
});

describe('teto das linhas de falha — o expurgo colapsa o histórico', () => {
  beforeEach(async () => {
    await db.audit_logs.clear();
  });

  it('30 linhas do mesmo dia viram 1; dias distintos ficam; o resto expira', async () => {
    const assinatura = assinaturaGravada('PK-1', detalheDoCiclo(1));
    // 30 dias atrás, à meia-noite UTC: a chave do teto é o DIA (UTC), e as 30
    // linhas (10 min cada, 4h50) têm de caber no mesmo dia. Com a âncora
    // relativa ao relógio, uma execução depois das 19:10 UTC empurrava as
    // últimas para o dia seguinte — o teste passava na máquina e falhava na CI
    // conforme a hora (29 vs 28 linhas consolidadas).
    const base = Math.floor((Date.now() - 30 * DIA) / DIA) * DIA;

    // As 144/dia de antes do teto, num dia antigo.
    for (let i = 0; i < 30; i += 1) {
      await db.audit_logs.put(
        linha({
          id: `LOG_D1_${String(i).padStart(2, '0')}`,
          updated_at: new Date(base + i * 10 * 60 * 1000).toISOString(),
          delta: assinatura
        })
      );
    }
    // Um outro dia, com uma linha só (já no teto).
    await db.audit_logs.put(
      linha({
        id: 'LOG_D2',
        updated_at: new Date(base - DIA).toISOString(),
        delta: assinatura
      })
    );
    // Uma linha comum, fora das falhas de envio.
    await db.audit_logs.put(
      linha({ id: 'LOG_COMUM', acao: 'UPDATE', updated_at: new Date(base).toISOString() })
    );

    const resultado = await purgarAuditoriaAntiga(Date.now());

    expect(resultado.consolidadas).toBe(29);
    expect(resultado.apagadas).toBe(30); // 29 repetidas + 1 linha comum

    const restantes = (await db.audit_logs.toArray()).map((l) => l.id).sort();
    // A mais recente do dia 1, a do dia 2 e a linha comum expirada.
    expect(restantes).toEqual(['LOG_D1_29', 'LOG_D2']);
  });

  it('linha de falha sem assinatura não é tocada (não há como provar que é a mesma)', async () => {
    const base = Date.now() - 30 * DIA;
    for (let i = 0; i < 3; i += 1) {
      await db.audit_logs.put(
        linha({
          id: `LOG_SEM_${i}`,
          updated_at: new Date(base + i * HORA).toISOString(),
          details: '',
          delta: null
        })
      );
    }

    const resultado = await purgarAuditoriaAntiga(Date.now());

    expect(resultado.consolidadas).toBe(0);
    expect(await db.audit_logs.count()).toBe(3);
  });
});

describe('teto das linhas de falha — a regra pura', () => {
  const diaDe = (iso: string) => new Date(iso);

  it('a janela é o início do dia (UTC)', () => {
    const agora = Date.UTC(2026, 10, 20, 15, 42, 7);
    expect(inicioDoDiaDaFalha(agora)).toBe('2026-11-20T00:00:00.000Z');
    expect(inicioDoDiaDaFalha(diaDe('2026-11-20T00:00:00.000Z').getTime())).toBe(
      '2026-11-20T00:00:00.000Z'
    );
  });

  it('a chave do teto é ação|registo|dia|assinatura', () => {
    const assinatura = assinaturaDeFalha('PK-1', 'coluna inexistente');
    expect(
      chaveDeFalhaNoDia({
        id: 'X',
        acao: ACAO,
        registro_id: 'PK-1',
        updated_at: '2026-11-20T08:00:00.000Z',
        delta: JSON.stringify({ signature: assinatura })
      })
    ).toBe(`${ACAO}|PK-1|2026-11-20|${assinatura}`);

    // Sem dia legível ou sem assinatura não há chave (e a linha fica).
    expect(chaveDeFalhaNoDia({ id: 'X', acao: ACAO, updated_at: 'sem data' })).toBeNull();
    expect(chaveDeFalhaNoDia({ id: 'X', acao: ACAO, updated_at: '2026-11-20T08:00:00.000Z' })).toBeNull();
  });

  it('mantém a linha mais recente de cada dia (e desempata pela chave)', () => {
    const assinatura = assinaturaGravada('PK-1', 'erro');
    const ids = idsDeFalhasRepetidas([
      { id: 'A', acao: ACAO, registro_id: 'PK-1', updated_at: '2026-11-20T08:00:00.000Z', delta: assinatura },
      { id: 'B', acao: ACAO, registro_id: 'PK-1', updated_at: '2026-11-20T09:00:00.000Z', delta: assinatura },
      { id: 'C', acao: ACAO, registro_id: 'PK-1', updated_at: '2026-11-21T09:00:00.000Z', delta: assinatura }
    ]);

    expect(ids).toEqual(['A']);
  });
});
