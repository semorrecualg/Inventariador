// ============================================================================
// conferidoSitios.test.ts — os sítios que ainda repetiam a regra à mão.
//
// Painel master, contador de unidades, conciliação de contas, etiquetagem,
// busca ativa, limpeza de cópias, importação e carga da planilha comparavam
// `_conferido === 1` (ou `!!_conferido`) por conta própria: no aparelho a flag
// chega como 1/0, mas um JSON reimportado traz `'1'`/`'true'` e uma planilha já
// conferida traz a coluna de auditoria. Todos passam a ler `isConferido`.
// ============================================================================
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const { toArrayMock } = vi.hoisted(() => ({ toArrayMock: vi.fn() }));

vi.mock('../services/sqliteService', () => ({
  db: { ativos: { toArray: toArrayMock } }
}));

import { getMasterDashboardStats } from '../services/dashboardService';
import { getDemoSeedAssets } from '../services/demoSeed';
import { isConferido } from '../utils/conferencia';

const srcRoot = fileURLToPath(new URL('..', import.meta.url));

const linha = (over: Record<string, unknown>) => ({
  tenantid: 'CICOPAL',
  filial: '010101 CICOPAL GO',
  primarykey: 'X',
  status: 'ATIVO',
  _is_deleted: 0,
  _conferido: 0,
  ...over
});

describe('getMasterDashboardStats — a conferência vem do predicado único', () => {
  it('conta a flag (1, "1", true) e a coluna de auditoria, e só do contrato', async () => {
    toArrayMock.mockResolvedValue([
      linha({ primarykey: 'A', _conferido: 1 }),
      linha({ primarykey: 'B', _conferido: '1' }), // escrita legada de JSON
      linha({ primarykey: 'C', _conferido: true }),
      linha({ primarykey: 'D', _conferido: 0, AUDITOR_STATUS_CONFERENCIA: 'SIM' }),
      linha({ primarykey: 'E', _conferido: 0 }),
      // Outro contrato com as mesmas etiquetas: fica fora da contagem.
      linha({ primarykey: 'E', tenantid: 'OUTRO', _conferido: 1 }),
      linha({ primarykey: 'F', tenantid: 'OUTRO', _conferido: 1 })
    ]);

    const stats = await getMasterDashboardStats('CICOPAL', 'auditor@empresa.com');

    expect(stats).toMatchObject({
      tenantid: 'CICOPAL',
      totalAtivos: 5,
      conferidoAtivos: 4,
      pendentesAtivos: 1,
      avancoPercent: 80
    });
  });
});

describe('demoSeed — grava a conferência no contrato que o predicado lê', () => {
  const assets = getDemoSeedAssets();

  it('usa a flag e `AUDITOR_STATUS_CONFERENCIA = SIM/NAO` coerentes entre si', () => {
    expect(assets.length).toBeGreaterThan(0);

    for (const asset of assets) {
      const bruto = asset as unknown as Record<string, unknown>;
      expect(isConferido(asset)).toBe(!!asset._conferido);
      expect(bruto.AUDITOR_STATUS_CONFERENCIA).toBe(isConferido(asset) ? 'SIM' : 'NAO');
    }

    // O seed tem de produzir os dois estados, senão o painel demo fica plano.
    expect(assets.some(asset => isConferido(asset))).toBe(true);
    expect(assets.some(asset => !isConferido(asset))).toBe(true);
  });
});

describe('sítios migrados — ninguém repete a comparação à mão', () => {
  /** Ficheiros que passaram a ler a regra (ou a receber o ativo inteiro). */
  const SITIOS = [
    'components/AccountReconciliation.tsx',
    'components/Labeling.tsx',
    'components/ActiveSearch.tsx',
    'services/dashboardService.ts',
    'services/localDbService.ts',
    'services/sqliteService.ts',
    'services/DatabaseLoaderService.ts',
    'utils/unitAssetStats.ts',
    'utils/dedupAssets.ts'
  ];

  /** `_conferido === 1`, `Number(x._conferido) === 1`, `!!x._conferido`, `!x._conferido`. */
  const COMPARACAO_CRUA = /_conferido\s*(?:===|!==|==|!=)\s*1|!!\s*[\w.$]*_conferido\b|!\s*[\w.$]*_conferido\b/;

  /** Código sem comentários: um comentário pode citar o padrão antigo. */
  const semComentarios = (fonte: string): string =>
    fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

  it('todos chamam `isConferido` e nenhum compara a flag como antes', () => {
    for (const rel of SITIOS) {
      const fonte = readFileSync(join(srcRoot, rel), 'utf8');
      expect(fonte, `${rel} deixou de usar o predicado`).toContain('isConferido');
      expect(COMPARACAO_CRUA.test(semComentarios(fonte)), `${rel} repete a comparação à mão`).toBe(false);
    }
  });

  it('o contador de unidades recebe o ativo inteiro, não a flag isolada', () => {
    const fonte = readFileSync(join(srcRoot, 'components/UnitSelector.tsx'), 'utf8');
    expect(fonte).toContain('counter.count(rawFilial, asset)');
    expect(COMPARACAO_CRUA.test(semComentarios(fonte))).toBe(false);
  });
});
