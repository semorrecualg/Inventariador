// @vitest-environment node
// ============================================================================
// batchIsolation.test.ts — o isolamento de lote que roda quando um lote falha.
//
// O transporte é injetado, portanto os três desfechos reais do Postgres podem
// ser cobertos sem rede: aceite, chave já existente (23505, conta como aceite) e
// recusa com motivo. Era o único caminho da recusa sem teste.
// ============================================================================
import { describe, it, expect } from 'vitest';
import {
  describeSyncError,
  isolateBatchRows,
  rowKeyOf,
  type BatchIsolationResult,
} from '../services/batchIsolation';

const linhas = (keys: string[]) => keys.map(key => ({ primarykey: key }));

/** Transporte de dublê: `falhar` devolve o erro para a linha, ou nada se aceite. */
const transporte = (falhar: (key: string) => unknown) => {
  const enviadas: string[] = [];
  return {
    enviadas,
    send: async (rows: Record<string, unknown>[]) => {
      const key = String(rows[0].primarykey);
      enviadas.push(key);
      const erro = falhar(key);
      if (erro) throw erro;
    },
  };
};

describe('isolamento de lote — desfechos por linha', () => {
  const keys = ['AT-1', 'AT-2', 'AT-3'];

  it('lote sem falhas: todas aceites, nenhuma recusa', async () => {
    const t = transporte(() => null);

    const r = await isolateBatchRows({ rows: linhas(keys), keys, send: t.send });

    expect(r).toEqual({ accepted: keys, failures: [] });
    expect(t.enviadas).toEqual(keys);
  });

  it('23505 (chave já na nuvem) conta como aceite, não como recusa', async () => {
    const t = transporte(key =>
      key === 'AT-2' ? { code: '23505', message: 'duplicate key value' } : null
    );

    const r = await isolateBatchRows({ rows: linhas(keys), keys, send: t.send });

    expect(r.accepted).toEqual(['AT-1', 'AT-2', 'AT-3']);
    expect(r.failures).toEqual([]);
  });

  it('recusa guarda a chave de origem e o motivo do banco', async () => {
    const t = transporte(key =>
      key === 'AT-2'
        ? { code: '23503', message: 'insert violates foreign key', details: 'filial 010101 ausente' }
        : null
    );

    const r = await isolateBatchRows({ rows: linhas(keys), keys, send: t.send });

    expect(r.accepted).toEqual(['AT-1', 'AT-3']);
    expect(r.failures).toEqual([
      {
        key: 'AT-2',
        reason: '[23503] · insert violates foreign key · detalhe: filial 010101 ausente',
      },
    ]);
  });

  it('erro de verdade (Error) usa a mensagem, sem inventar código', async () => {
    const t = transporte(key => (key === 'AT-1' ? new Error('timeout de rede') : null));

    const r: BatchIsolationResult = await isolateBatchRows({ rows: linhas(keys), keys, send: t.send });

    expect(r.failures).toEqual([{ key: 'AT-1', reason: 'timeout de rede' }]);
  });

  it('linha sem primarykey usa a chave local, para não perder a referência', async () => {
    const t = transporte(() => new Error('sem coluna'));

    const r = await isolateBatchRows({
      rows: [{ filial: '010101' }],
      keys: ['LOCAL-9'],
      send: t.send,
    });

    expect(r.failures).toEqual([{ key: 'LOCAL-9', reason: 'sem coluna' }]);
  });
});

describe('isolamento de lote — conjuntos maiores e erros ilegíveis', () => {
  it('percorre mais de uma onda (concorrência 2) sem trocar chaves', async () => {
    const keys = ['A', 'B', 'C', 'D', 'E'];
    const t = transporte(key => (key === 'D' ? { code: '23514', message: 'check falhou' } : null));

    const r = await isolateBatchRows({ rows: linhas(keys), keys, send: t.send, concurrency: 2 });

    expect([...r.accepted].sort()).toEqual(['A', 'B', 'C', 'E']);
    expect(r.failures).toEqual([{ key: 'D', reason: '[23514] · check falhou' }]);
    expect(t.enviadas.sort()).toEqual(keys);
  });

  it('describeSyncError cobre valores estranhos sem rebentar', () => {
    expect(describeSyncError(null)).toBe('erro desconhecido');
    expect(describeSyncError({})).toBe('{}');
    expect(describeSyncError({ hint: 'use outro contrato' })).toBe('dica: use outro contrato');
    expect(describeSyncError('texto')).toBe('"texto"');
  });

  it('rowKeyOf prefere o primarykey e cai para a chave local', () => {
    expect(rowKeyOf({ primarykey: 'AT-1' }, 'LOCAL')).toBe('AT-1');
    expect(rowKeyOf({ primarykey: '' }, 'LOCAL')).toBe('LOCAL');
    expect(rowKeyOf({}, 'LOCAL')).toBe('LOCAL');
  });
});
