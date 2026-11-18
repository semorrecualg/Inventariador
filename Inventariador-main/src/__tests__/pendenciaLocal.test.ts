// ============================================================================
// pendenciaLocal.test.ts — «Pendente Nuvem» tem de dizer há quanto tempo.
//
// As escritas que põem `_is_synced` a 0 não deixavam data nenhuma, e o selo do
// cartão (`syncPendingInfo`) procura `_lastUpdated` para os itens não conferidos.
// Resultado: «base por espelhar» sem idade — um toque de minutos parecia igual a
// um registo esquecido desde a semana passada.
// ============================================================================
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { marcarAlteracaoLocal } from '../utils/pendencia';
import { syncPendingInfo } from '../utils/syncBadge';

const varrer = (dir: string, acc: string[] = []): string[] => {
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const caminho = join(dir, entrada.name);
    if (entrada.isDirectory()) varrer(caminho, acc);
    else if (/\.(ts|tsx)$/.test(entrada.name)) acc.push(caminho);
  }
  return acc;
};

describe('marcarAlteracaoLocal', () => {
  it('marca pendente de nuvem com a data do toque', () => {
    const agora = new Date('2026-11-18T12:00:00.000Z');

    expect(marcarAlteracaoLocal(agora)).toEqual({
      _is_synced: 0,
      _lastUpdated: '2026-11-18T12:00:00.000Z',
    });
  });

  it('preserva a data que o registo já tinha e usa agora quando não há nenhuma', () => {
    expect(marcarAlteracaoLocal('2026-11-10T08:00:00.000Z')._lastUpdated)
      .toBe('2026-11-10T08:00:00.000Z');
    expect(marcarAlteracaoLocal(undefined)._lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('o selo passa a mostrar o motivo com a idade da pendência', () => {
    const tocado = marcarAlteracaoLocal(new Date('2026-11-18T10:00:00.000Z'));

    const info = syncPendingInfo(
      { _conferido: false, ...tocado } as never,
      Date.parse('2026-11-18T12:00:00.000Z')
    );

    expect(info).toEqual({ motivo: 'base por espelhar', idade: 'há 2 h' });
  });
});

describe('escritas locais — nenhuma marca a flag sem a data', () => {
  it('só o helper escreve `_is_synced: 0`', () => {
    const fonte = join(process.cwd(), 'src');
    const ficheiros = varrer(fonte)
      .filter((caminho) => !caminho.includes('__tests__'))
      .filter((caminho) => !caminho.endsWith(join('utils', 'pendencia.ts')));

    const infratores = ficheiros
      .filter((caminho) => /_is_synced:\s*0\b/.test(readFileSync(caminho, 'utf8')));

    expect(infratores).toEqual([]);
  });
});
