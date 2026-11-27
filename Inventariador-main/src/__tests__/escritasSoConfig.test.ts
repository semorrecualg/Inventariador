// ============================================================================
// escritasSoConfig.test.ts — P3/P4 do levantamento de `saveInventory`.
//
// Dois sítios gravavam a base inteira sem que nenhum ativo tivesse mudado:
//
//   - `handleUpdateDatabaseMode`: persiste o estado antes de trocar de modo —
//     o que muda é `databaseMode`, e as tabelas do Dexie não dependem do modo;
//   - `completeOnboarding`: muda `hasCompletedOnboarding`.
//
// Ambos passam a `saveInventory(state, undefined, false, true)` (só
// configuração). Este ficheiro fixa o contrato sobre o código sem comentários e
// guarda o estado final do levantamento: os únicos saves sem esse caminho são o
// do JSON legado (`saveInventory(parsed)`, gravação em massa justificada) e o
// do autosave (`saveInventory(inventory, dirtyAssets, true)`, que passa a lista
// de sujos).
// ============================================================================
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const app = readFileSync(join(process.cwd(), 'src', 'App.tsx'), 'utf8');
const codigo = app.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const bloco = (inicio: string, fim: string): string => {
  const de = codigo.indexOf(inicio);
  const ate = de === -1 ? -1 : codigo.indexOf(fim, de);
  return de !== -1 && ate > de ? codigo.slice(de, ate) : '';
};

describe('troca de modo de base — só configuração (P3)', () => {
  const modo = bloco('const handleUpdateDatabaseMode', 'setDatabaseMode(mode);');

  it('encontra o caminho', () => {
    expect(modo).not.toBe('');
  });

  it('grava sem regravar os ativos', () => {
    expect(modo).toContain('saveInventory(inventory, undefined, false, true)');
    expect(modo).not.toContain('saveInventory(inventory)');
  });
});

describe('fim do onboarding — só configuração (P4)', () => {
  const onboarding = bloco('const completeOnboarding', 'const currentScreen = history');

  it('encontra o caminho', () => {
    expect(onboarding).not.toBe('');
  });

  it('grava sem regravar os ativos', () => {
    expect(onboarding).toContain('saveInventory(newState, undefined, false, true)');
    expect(onboarding).not.toContain('saveInventory(newState)');
  });
});

describe('estado final do levantamento em App.tsx', () => {
  it('só o JSON legado e o autosave ficam fora do caminho `skipSqlAssetsInsert`', () => {
    const chamadas = codigo.match(/saveInventory\([^)]*\)/g) ?? [];
    const fora = chamadas.filter((chamada) => !chamada.includes(', undefined, false, true)'));

    expect(fora.sort()).toEqual([
      'saveInventory(inventory, dirtyAssets, true)',
      'saveInventory(parsed)'
    ]);
  });
});
