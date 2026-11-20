// src/__tests__/exclusaoVencePendencia.test.ts
// ============================================================================
// A EXCLUSÃO DA NUVEM VENCE A CÓPIA LOCAL PENDENTE
//
// O pull reaplica a cópia local por cima da linha da nuvem para não perder o que
// este aparelho mudou e ainda não subiu. Mas a exclusão não é um campo: é o
// registo inteiro. Um aparelho que ficou com `_is_deleted = 0` (offline durante
// a exclusão, `delete` que falhou antes, base antiga) desfazia a exclusão em
// todos os aparelhos no ciclo seguinte — o ativo ressuscitava sozinho.
// ============================================================================
import { describe, it, expect } from 'vitest';
import { mesclarComExclusao } from '../utils/pendencia';

const daNuvem = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'PK-1',
  primarykey: 'PK-1',
  etiqueta: '007222',
  descricaodoativo: 'DESCRIÇÃO DA NUVEM',
  status: 'PENDENTE',
  _is_deleted: 1,
  ...over
});

const doAparelho = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'PK-1',
  primarykey: 'PK-1',
  etiqueta: '007222',
  descricaodoativo: 'DESCRIÇÃO EDITADA NO APARELHO',
  status: 'CONFERIDO',
  _conferido: 1,
  _is_synced: 0,
  _is_deleted: 0,
  ...over
});

describe('mesclarComExclusao — a exclusão vence a edição pendente', () => {
  it('nuvem apagada: a cópia local não entra e a pendência é descartada', () => {
    const { registo, exclusaoVenceu } = mesclarComExclusao(daNuvem(), doAparelho());

    expect(exclusaoVenceu).toBe(true);
    expect(Number(registo._is_deleted)).toBe(1);
    // Nenhum campo da cópia local sobrevive — nem os que mudaram no aparelho.
    expect(registo.descricaodoativo).toBe('DESCRIÇÃO DA NUVEM');
    expect(registo.status).toBe('PENDENTE');
    expect(registo._conferido).toBeUndefined();
    expect(registo._is_synced).toBeUndefined();
  });

  it('aceita as três grafias da flag na nuvem (true, 1, "1")', () => {
    for (const grafia of [true, 1, '1'] as const) {
      const { exclusaoVenceu } = mesclarComExclusao(daNuvem({ _is_deleted: grafia }), doAparelho());
      expect(exclusaoVenceu).toBe(true);
    }
  });

  it('cópia local sem a flag (base antiga) também não desfaz a exclusão', () => {
    const { registo, exclusaoVenceu } = mesclarComExclusao(
      daNuvem(),
      doAparelho({ _is_deleted: undefined })
    );

    expect(exclusaoVenceu).toBe(true);
    expect(Number(registo._is_deleted)).toBe(1);
  });

  it('nuvem viva: a edição local pendente continua a ganhar (comportamento antigo)', () => {
    const { registo, exclusaoVenceu } = mesclarComExclusao(
      daNuvem({ _is_deleted: false }),
      doAparelho()
    );

    expect(exclusaoVenceu).toBe(false);
    expect(registo.descricaodoativo).toBe('DESCRIÇÃO EDITADA NO APARELHO');
    expect(Number(registo._is_synced)).toBe(0);
    expect(Number(registo._is_deleted)).toBe(0);
  });

  it('base sem a coluna na nuvem: a linha não conta como apagada', () => {
    const { registo, exclusaoVenceu } = mesclarComExclusao(
      daNuvem({ _is_deleted: undefined }),
      doAparelho()
    );

    expect(exclusaoVenceu).toBe(false);
    expect(registo.descricaodoativo).toBe('DESCRIÇÃO EDITADA NO APARELHO');
  });
});
