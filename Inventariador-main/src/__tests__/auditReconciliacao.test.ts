// ============================================================================
// auditReconciliacao.test.ts — a trilha de ativos junta três fontes sem repetir
// (F2, 3.º passo). O arquivo da fila (`audit_logs` da nuvem) liga-se ao evento
// local por `client_event_id`; `asset_logs` é histórico de trigger, sem id local.
// ============================================================================
import { describe, it, expect } from 'vitest';
import { chaveDoConteudo, reconciliarTrilha } from '../utils/auditReconciliacao';

const base = {
  timestamp: '2026-11-23T10:00:00.000Z',
  user_email: 'auditor@gbr.com.br',
  action: 'CONFERENCIA',
  record_id: 'PK-1',
  details: 'Conferência do ativo',
};

describe('reconciliação da trilha de ativos', () => {
  it('funde o evento arquivado com o local pelo client_event_id', () => {
    const linhas = reconciliarTrilha(
      [{ ...base, id: 'LOG_1', _synced: 1 }],
      [{ ...base, id: 'uuid-1', client_event_id: 'LOG_1' }]
    );

    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({
      id: 'LOG_1',
      origem: 'APP',
      confirmadoNaNuvem: true,
    });
  });

  it('mostra o evento arquivado que já não existe no aparelho (reinstalação)', () => {
    const linhas = reconciliarTrilha([], [{ ...base, id: 'uuid-2', client_event_id: 'LOG_2' }]);

    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({ id: 'LOG_2', origem: 'APP', confirmadoNaNuvem: true });
  });

  it('marca o evento que só existe no aparelho', () => {
    const linhas = reconciliarTrilha([{ ...base, id: 'LOG_3', _synced: 0 }], []);

    expect(linhas[0]).toMatchObject({ id: 'LOG_3', origem: 'APP', confirmadoNaNuvem: false });
  });

  it('mantém o histórico antigo de asset_logs como origem da nuvem', () => {
    const linhas = reconciliarTrilha([], [], [{ ...base, id: 'asset-log-1' }]);

    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({ id: 'asset-log-1', origem: 'NUVEM', confirmadoNaNuvem: true });
  });

  it('não repete a linha quando o trigger e o app descrevem o mesmo evento', () => {
    const linhas = reconciliarTrilha(
      [{ ...base, id: 'LOG_4', _synced: 0 }],
      [],
      [{ ...base, id: 'asset-log-4' }]
    );

    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({ origem: 'APP', confirmadoNaNuvem: true });
  });

  it('guarda as duas linhas quando os detalhes dizem coisas diferentes', () => {
    const linhas = reconciliarTrilha(
      [{ ...base, id: 'LOG_5', _synced: 0 }],
      [],
      [{ ...base, id: 'asset-log-5', details: 'UPDATE vindo do trigger' }]
    );

    expect(linhas).toHaveLength(2);
    expect(linhas.map((l) => l.origem).sort()).toEqual(['APP', 'NUVEM']);
  });

  it('ordena do mais recente para o mais antigo', () => {
    const linhas = reconciliarTrilha(
      [
        { ...base, id: 'antigo', timestamp: '2026-11-20T10:00:00.000Z' },
        { ...base, id: 'novo', timestamp: '2026-11-23T10:00:00.000Z' },
      ],
      []
    );

    expect(linhas.map((l) => l.id)).toEqual(['novo', 'antigo']);
  });

  it('aceita created_at quando a linha não tem timestamp', () => {
    const linhas = reconciliarTrilha([], [
      { ...base, id: 'uuid-6', client_event_id: 'LOG_6', timestamp: null, created_at: '2026-11-23T11:00:00.000Z' },
    ]);

    expect(linhas[0].id).toBe('LOG_6');
    expect(chaveDoConteudo(linhas[0])).toContain('2026-11-23T11:00:00');
  });
});
