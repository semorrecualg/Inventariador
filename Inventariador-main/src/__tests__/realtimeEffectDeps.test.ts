import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Contrato do efeito de tempo real em `App.tsx`.
 *
 * Duas regressões já vistas aqui:
 *  1. o efeito dependia de `inventory.lastUpdated` → cada sincronização desligava
 *     e religava os canais, perdendo eventos no intervalo;
 *  2. `pushScreen` não é estável (depende de `databaseMode`/`selectedUnit`) →
 *     mudar de unidade reabria os canais sem o contrato mudar.
 *
 * A comparação é feita sobre os tokens das dependências e sobre o código sem
 * comentários, para o teste não falhar por formatação do ficheiro.
 */
const appSource = readFileSync(fileURLToPath(new URL('../App.tsx', import.meta.url)), 'utf8');

const effectStart = appSource.indexOf('// Real-time Cloud Sync Listener');

/** Primeira lista de dependências de efeito depois do marcador. */
const depsPattern = /\}\s*,\s*\[([^\]]*)\]\s*\)\s*;/g;
const depsMatch = (() => {
  if (effectStart === -1) return null;
  depsPattern.lastIndex = effectStart;
  return depsPattern.exec(appSource);
})();

const effectBlock = depsMatch ? appSource.slice(effectStart, depsMatch.index) : '';
// Sem comentários: validamos o que executa, não a explicação.
const effectCode = effectBlock.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const deps = depsMatch
  ? depsMatch[1]
      .split(',')
      .map(token => token.trim())
      .filter(Boolean)
  : [];

describe('efeito realtime de App.tsx', () => {
  it('encontra o efeito e as suas dependências', () => {
    expect(effectStart).toBeGreaterThan(-1);
    expect(depsMatch).not.toBeNull();
    expect(deps.length).toBeGreaterThan(0);
  });

  it('só depende do modo de base e do contrato', () => {
    expect([...deps].sort()).toEqual(['databaseMode', 'realtimeTenantId']);
  });

  it('não depende de inventory.lastUpdated nem de pushScreen', () => {
    expect(deps).not.toContain('inventory.lastUpdated');
    expect(deps).not.toContain('pushScreen');
  });

  it('compara o horário pelo ref atual, não pelo valor capturado na render', () => {
    expect(effectCode).toContain('inventoryRef.current.lastUpdated');
    expect(effectCode).not.toContain('inventory.lastUpdated');
  });

  it('usa o pushScreen atual por ref (identidade instável não reabre o canal)', () => {
    expect(effectCode).toContain('realtimePushScreenRef.current(');
    expect(effectCode).not.toContain('pushScreen(');
  });

  it('usa o contrato estável nas duas subscrições', () => {
    expect(effectCode).toContain('}, realtimeTenantId);');
    expect(effectCode).toContain('subscribeToAssetChanges(realtimeTenantId');
    expect(effectCode).not.toContain('user?.tenantid');
  });
});
